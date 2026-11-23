import type { AppBase, Asset } from 'playcanvas';
import { subscribeGlbLoads } from '../models/glb';

export interface LoadingScreenHandle {
  /** Registra ou atualiza uma etapa síncrona do carregamento (mundo, bairros, texturas, minimapa). */
  setStage(key: string, label: string, done: boolean): void;
  /** Conecta aos assets do PlayCanvas (GLBs, texturas, modelos do Editor e loadFromUrl). */
  attachApp(app: AppBase): void;
  /** Sinaliza que todas as etapas de montagem da cena foram iniciadas e aguarda os assets pendentes. */
  finishSetup(onReady: () => void): void;
  /** Remove imediatamente a tela de carregamento e limpa timers/listeners. */
  destroy(): void;
}

const LOADING_TIPS: ReadonlyArray<string> = [
  'Dica: aperte E perto de qualquer veículo para entrar ou sair a pé.',
  'Dica: no Esportivo, segure Shift para acionar o nitro nas avenidas.',
  'Dica: siga as colunas luminosas e o minimapa de Juiz de Fora até cada entrega.',
  'Dica: no A-29, aperte Espaço para soltar a carga aérea e F para ligar a fumaça.',
  'Dica: aperte C ou V para alternar entre câmera de perseguição, topo e cabine.',
  'Dica: a última entrega de cada estágio leva você direto ao próximo veículo.',
];

const TRACKED_ASSET_TYPES = new Set(['container', 'model', 'render', 'texture']);
const SAFETY_TIMEOUT_MS = 10_000;

function friendlyAssetLabel(rawName: string, type?: string): string {
  const lower = rawName.toLowerCase();
  if (lower.includes('uniacademia')) return 'Carregando fachada da UniAcademia…';
  if (lower.includes('mundo-terreno') || lower.includes('terreno')) return 'Carregando relevo de Juiz de Fora…';
  if (lower.includes('mundo-bairros') || lower.includes('bairro')) return 'Carregando bairros de Juiz de Fora…';
  if (lower.includes('mundo-cidade') || lower.includes('cidade')) return 'Carregando ruas e prédios do Centro…';
  if (lower.includes('mundo-aeroporto') || lower.includes('aeroporto')) return 'Carregando Aeroporto da Serrinha…';
  if (lower.includes('mundo-nuvens') || lower.includes('mundo-ceu')) return 'Carregando céu e nuvens…';
  if (lower.includes('a29')) return 'Carregando avião A-29 Super Tucano…';
  if (lower.includes('helicoptero') || lower.includes('heli')) return 'Carregando helicóptero MD 500…';
  if (lower.includes('carro-tunado') || lower.includes('tunado')) return 'Carregando Esportivo…';
  if (lower.includes('carro')) return 'Carregando veículos urbanos…';
  if (lower.includes('personagem')) return 'Carregando personagem entregador…';
  if (type === 'texture' || /\.(png|jpe?g|webp|dds|ktx2?)$/i.test(lower)) return 'Carregando texturas do cenário…';
  return `Carregando ${rawName}…`;
}

function getAssetName(asset: Asset): string {
  const file = asset.file as { filename?: string; url?: string } | null | undefined;
  const fromFile = file?.filename || file?.url?.split('/').pop() || '';
  return String(asset.name || fromFile || `asset-${asset.id ?? ''}`);
}

function isTrackableAsset(asset: Asset | null | undefined): asset is Asset {
  if (!asset) return false;
  const type = String(asset.type ?? '').toLowerCase();
  if (TRACKED_ASSET_TYPES.has(type)) return true;
  const name = getAssetName(asset).toLowerCase();
  return name.endsWith('.glb') || name.endsWith('.gltf');
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Tela de carregamento diurna com progresso real de GLBs, texturas e etapas da cena.
 * Funciona tanto no app local (Vite) quanto no Launch do PlayCanvas Editor.
 */
export function createLoadingScreen(uiRoot: HTMLElement | null | undefined): LoadingScreenHandle {
  if (!uiRoot || typeof document === 'undefined') {
    return {
      setStage() {},
      attachApp() {},
      finishSetup(onReady) {
        onReady();
      },
      destroy() {},
    };
  }

  const overlay = el('div', 'loading-overlay');
  const card = el('div', 'loading-card');
  const band = el('div', 'loading-band');
  const eyebrow = el('div', 'loading-eyebrow', 'GOPOSTAL · JUIZ DE FORA');
  const shiftTag = el('div', 'loading-eyebrow', 'TURNO 06:00');
  band.append(eyebrow, shiftTag);

  const body = el('div', 'loading-body');
  const title = el('h1', 'loading-title', 'DELIVERED BY NOON');
  const subtitle = el('p', 'loading-subtitle', 'Preparando as ruas e os veículos para o turno da manhã.');

  const barWrap = el('div', 'loading-bar-wrap');
  const barTrack = el('div', 'loading-bar-track');
  const barFill = el('div', 'loading-bar-fill');
  barFill.style.transform = 'scaleX(0.04)';
  barTrack.append(barFill);

  const metaRow = el('div', 'loading-meta');
  const statusEl = el('span', 'loading-status', 'Preparando mapa de Juiz de Fora…');
  const pctEl = el('span', 'loading-pct', '0%');
  metaRow.append(statusEl, pctEl);
  barWrap.append(barTrack, metaRow);

  let tipIdx = Math.floor(Math.random() * LOADING_TIPS.length);
  const tipEl = el('p', 'loading-tip', LOADING_TIPS[tipIdx]);

  body.append(title, subtitle, barWrap, tipEl);
  card.append(band, body);
  overlay.append(card);
  uiRoot.append(overlay);

  interface TrackedEntry {
    label: string;
    done: boolean;
  }

  const stages = new Map<string, TrackedEntry>();
  const glbItems = new Map<string, TrackedEntry>();
  const assetItems = new Map<string, TrackedEntry>();

  let setupDone = false;
  let completed = false;
  let destroyed = false;
  let maxShownRatio = 0.04;
  let readyCallback: (() => void) | null = null;
  let detachGlb: (() => void) | null = null;
  let detachAssets: (() => void) | null = null;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  const tipTimer = setInterval(() => {
    if (destroyed || completed) return;
    tipIdx = (tipIdx + 1) % LOADING_TIPS.length;
    tipEl.textContent = LOADING_TIPS[tipIdx];
  }, 3400);

  function computeTotals(): { done: number; total: number; pendingLabel: string | null } {
    let done = 0;
    let total = 0;
    let pendingLabel: string | null = null;

    const visit = (map: Map<string, TrackedEntry>) => {
      for (const entry of map.values()) {
        total++;
        if (entry.done) done++;
        else if (!pendingLabel) pendingLabel = entry.label;
      }
    };
    visit(stages);
    visit(assetItems);
    visit(glbItems);
    return { done, total, pendingLabel };
  }

  function completeNow() {
    if (completed || destroyed) return;
    completed = true;
    clearInterval(tipTimer);
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }

    barFill.style.transform = 'scaleX(1)';
    pctEl.textContent = '100%';
    statusEl.textContent = 'Tudo pronto para a entrega!';
    overlay.classList.add('loading-overlay--done');

    const cb = readyCallback;
    readyCallback = null;
    cb?.();

    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      overlay.remove();
    }, 320);
  }

  function refresh() {
    if (destroyed || completed) return;
    const { done, total, pendingLabel } = computeTotals();
    const rawRatio = total > 0 ? done / total : setupDone ? 1 : 0.06;
    // Evita mostrar 100% antes de finishSetup() confirmar que todos os assets foram registrados
    const capped = setupDone ? rawRatio : Math.min(0.88, rawRatio);
    maxShownRatio = Math.max(maxShownRatio, capped);

    barFill.style.transform = `scaleX(${Math.max(0.04, Math.min(1, maxShownRatio)).toFixed(4)})`;
    pctEl.textContent = `${Math.round(maxShownRatio * 100)}%`;

    if (pendingLabel) {
      statusEl.textContent = total > 0 ? `${pendingLabel} (${done}/${total})` : pendingLabel;
    } else if (!setupDone) {
      statusEl.textContent = 'Montando Juiz de Fora, veículos e texturas…';
    }

    if (setupDone && (total === 0 || done >= total)) {
      completeNow();
    }
  }

  function recordRegistryAsset(asset: Asset, forceDone = false, allowIdle = false) {
    if (!isTrackableAsset(asset)) return;
    const key = `asset:${asset.id ?? getAssetName(asset)}`;
    const name = getAssetName(asset);
    const loaded = forceDone || Boolean(asset.loaded || asset.resource);
    // Na varredura inicial do Editor, ignora assets que não estão em preload nem carregando ativamente;
    // assets adicionados dinamicamente (ex.: loadFromUrl de a29.glb) são sempre acompanhados.
    const loading = Boolean((asset as { loading?: boolean }).loading);
    const preload = Boolean((asset as { preload?: boolean }).preload);
    if (!allowIdle && !loaded && !loading && !preload) return;

    const prev = assetItems.get(key);
    if (prev && prev.done) return;
    assetItems.set(key, {
      label: friendlyAssetLabel(name, String(asset.type ?? '')),
      done: loaded,
    });
  }

  return {
    setStage(key: string, label: string, done: boolean) {
      if (destroyed || completed) return;
      stages.set(key, { label, done });
      refresh();
    },

    attachApp(app: AppBase) {
      if (destroyed || completed) return;
      detachGlb?.();
      detachAssets?.();

      detachGlb = subscribeGlbLoads(app, (items) => {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          glbItems.set(it.id, {
            label: friendlyAssetLabel(it.filename, 'container'),
            done: it.done,
          });
        }
        refresh();
      });

      const registry = app.assets;
      if (registry) {
        const list = typeof registry.list === 'function' ? registry.list() : [];
        for (let i = 0; i < list.length; i++) {
          recordRegistryAsset(list[i]);
        }

        const onAdd = (asset: Asset) => {
          recordRegistryAsset(asset, false, true);
          refresh();
        };
        const onLoad = (asset: Asset) => {
          recordRegistryAsset(asset, true, true);
          refresh();
        };
        const onError = (_err: string, asset?: Asset) => {
          if (asset) recordRegistryAsset(asset, true, true);
          refresh();
        };

        registry.on?.('add', onAdd);
        registry.on?.('load', onLoad);
        registry.on?.('error', onError);
        detachAssets = () => {
          registry.off?.('add', onAdd);
          registry.off?.('load', onLoad);
          registry.off?.('error', onError);
        };
      }
      refresh();
    },

    finishSetup(onReady: () => void) {
      if (destroyed) return;
      if (completed) {
        onReady();
        return;
      }
      setupDone = true;
      readyCallback = onReady;
      refresh();
      if (!completed && safetyTimer === null) {
        safetyTimer = setTimeout(() => {
          safetyTimer = null;
          completeNow();
        }, SAFETY_TIMEOUT_MS);
      }
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearInterval(tipTimer);
      if (safetyTimer !== null) clearTimeout(safetyTimer);
      if (fadeTimer !== null) clearTimeout(fadeTimer);
      detachGlb?.();
      detachAssets?.();
      detachGlb = null;
      detachAssets = null;
      readyCallback = null;
      overlay.remove();
    },
  };
}
