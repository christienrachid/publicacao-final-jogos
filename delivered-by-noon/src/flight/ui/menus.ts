import type { MissionState, Stage } from '../types';
import {
  clearRecords,
  formatRecordClock,
  formatRecordDate,
  getBestRecord,
  isRecordStorageAvailable,
  loadRecords,
  type RecordEntry,
  sanitizeInitials,
  saveRecord,
  wouldMakeTopRecords,
} from '../recordes';
import { CITY_CREDITS } from '../world-data';
import {
  DEFAULT_SETTINGS,
  type GameMode,
  type GameSettings,
  type QualityLevel,
  sanitizeSettings,
} from './settings';

export type MenuScreen = 'main' | 'story' | 'presentation' | 'options' | 'controls' | 'credits' | 'result';

export interface PresentationLaunchConfig {
  stage: Stage;
  dayDurationMinutes: 5 | 10 | 30;
  finalDelivery: boolean;
}

export interface MenuCallbacks {
  onStartFlight(): void;
  /** Continua o turno salvo (botão aparece só quando há save). */
  onContinue?(): void;
  onStartPresentation?(config: PresentationLaunchConfig): void;
  onResume(): void;
  onRestart(): void;
  onReturnTitle(): void;
  onSettingsChange(next: GameSettings): void;
  onButtonClick(confirm?: boolean): void;
}

export interface GameMenus {
  setMode(mode: GameMode): void;
  setHiddenByLoading(hidden: boolean): void;
  /** Resumo do save (ex.: "5/16 entregas · 08:12") ou null sem save. */
  setSaveInfo(info: string | null): void;
  getScreen(): MenuScreen;
  back(): boolean;
  syncSettings(settings: GameSettings): void;
  showStageUnlocked(stage: Stage): void;
  clearStageBanner(): void;
  showEndScreen(outcome: 'won' | 'lost', mission: MissionState, presentationMode?: boolean): void;
  destroy(): void;
}

const STAGE_UNLOCK_COPY: Record<Stage, { title: string; subtitle: string; accent: string; badge: string; perk: string }> = {
  car: {
    title: 'Hatch da GoPostal liberado!',
    subtitle: 'Recado de Michael De Santa, o patrão: siga os marcadores luminosos pela cidade.',
    accent: 'car',
    badge: 'ETAPA 1 · HATCH',
    perk: 'Tração dianteira ágil nas ruas do Centro',
  },
  tuned: {
    title: 'Esportivo liberado!',
    subtitle: 'Recado de Michael De Santa, o patrão: mete o Shift no nitro e parte para as entregas malucas!',
    accent: 'tuned',
    badge: 'ETAPA 2 · COUPÉ TUNADO',
    perk: 'Tração traseira · Nitro (Shift) · Drift (Espaço)',
  },
  heli: {
    title: 'Helicóptero liberado!',
    subtitle: 'Recado de Michael De Santa, o patrão: agora o trânsito ficou lá embaixo — suba nos telhados!',
    accent: 'heli',
    badge: 'ETAPA 3 · HELICÓPTERO MD 500',
    perk: 'Pairado estável · Pouso em coberturas e morros',
  },
  a29: {
    title: 'Avião A-29 liberado!',
    subtitle: 'Reta final da GoPostal! Sobrevoe os alvos e aperte Espaço para soltar as caixas!',
    accent: 'a29',
    badge: 'ETAPA 4 · AVIÃO A-29',
    perk: 'Potência na pista e no ar (Shift/Ctrl) · Carga (Espaço) · Fumaça (F)',
  },
};

const STAGE_LABEL: Record<Stage, string> = {
  car: '1/4 · Hatch',
  tuned: '2/4 · Esportivo',
  heli: '3/4 · Helicóptero',
  a29: '4/4 · Avião A-29',
};

const CONTROLS_LIST: ReadonlyArray<[readonly string[], string]> = [
  [['E'], 'Entrar ou sair do veículo próximo (Hatch, Esportivo, helicóptero ou A-29)'],
  [['W', 'A', 'S', 'D'], 'Andar (a pé), dirigir (carros) ou pilotar (helicóptero e A-29)'],
  [['Shift'], 'Nitro no Esportivo · sobe no heli · aumenta potência do A-29 (pista e voo)'],
  [['Ctrl'], 'Desce no heli · reduz potência do A-29 (pista e voo); freia na pista com potência zerada'],
  [['W', 'S'], 'A-29: baixa / levanta o nariz; não controla o acelerador'],
  [['Espaço'], 'Freio de mão (carros), pular (a pé) ou soltar carga aérea (A-29)'],
  [['Mouse'], 'Gira a câmera (a pé, carros e helicóptero) ou move a mira de voo (A-29)'],
  [['Clique'], 'Trava o ponteiro para girar a câmera / mirar no A-29'],
  [['Q', 'E'], 'Leme / pedais em aeronaves'],
  [['M'], 'Alterna entre controle por Mouse e Teclado (somente A-29)'],
  [['F'], 'Liga / desliga a fumaça branca na cauda do A-29'],
  [['C', 'V'], 'Alterna câmeras disponíveis para o veículo atual'],
  [['R'], 'Reinicia o veículo atual'],
  [['Esc', 'P'], 'Pausa o jogo e congela o relógio'],
];

function formatClock(minutes: number): string {
  const clamped = Math.max(360, Math.min(720, Math.floor(minutes)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createGameMenus(
  uiRoot: HTMLElement,
  initialSettings: GameSettings,
  callbacks: MenuCallbacks,
): GameMenus {
  let mode: GameMode = 'title';
  let screen: MenuScreen = 'main';
  let hiddenByLoading = false;
  let settings: GameSettings = { ...initialSettings };
  let stageBannerTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSavedInitials = 'GOP';
  let pendingWinRecord: {
    finishMinutes: number;
    score: number;
    delivered: number;
    total: number;
  } | null = null;

  function createLeaderboardBox() {
    const root = node('div', 'menu-leaderboard');
    const lbHeader = node('div', 'menu-lb-header');
    lbHeader.append(node('span', 'menu-lb-title', 'Funcionários do mês'), node('span', 'menu-lb-tag', 'TOP 5'));
    const emptyEl = node(
      'p',
      'menu-lb-empty',
      'Quadro vazio — feche todas as entregas antes das 12:00 para assinar seu ponto.',
    );
    const listEl = node('div', 'menu-lb-list');
    root.append(lbHeader, emptyEl, listEl);

    return {
      root,
      render(records: readonly RecordEntry[], highlightId?: string | null) {
        listEl.textContent = '';
        emptyEl.hidden = records.length > 0;
        listEl.hidden = records.length === 0;
        for (let i = 0; i < records.length; i++) {
          const entry = records[i];
          const isNew = Boolean(highlightId && entry.id === highlightId);
          const row = node('div', isNew ? 'menu-lb-row is-new' : 'menu-lb-row');
          const meta = node('span', 'menu-lb-meta');
          meta.append(document.createTextNode(`${entry.delivered}/${entry.total} · ${formatRecordDate(entry.dateIso)}`));
          if (isNew) {
            meta.append(node('span', 'menu-lb-new-badge', 'Novo!'));
          }
          row.append(
            node('span', 'menu-lb-rank', `#${i + 1}`),
            node('span', 'menu-lb-initials', entry.initials),
            node('span', 'menu-lb-clock', formatRecordClock(entry.finishMinutes)),
            node('span', 'menu-lb-score', `${entry.score.toLocaleString('pt-BR')} pts`),
            meta,
          );
          listEl.append(row);
        }
      },
    };
  }

  const overlay = node('div', 'menu-overlay menu-overlay--title is-poster-main');
  const card = node('div', 'menu-card');
  overlay.append(card);
  uiRoot.append(overlay);

  // Ordem de serviço animada de estágio liberado
  const stageBanner = node('div', 'stage-banner');
  stageBanner.hidden = true;
  const stageBannerEyebrow = node('div', 'stage-banner-eyebrow', 'GOPOSTAL · GARAGEM LIBERADA');
  const stageBannerBody = node('div', 'stage-banner-body');
  const stageBannerBadge = node('div', 'stage-banner-badge', 'ETAPA 2 · COUPÉ TUNADO');
  const stageBannerTitle = node('div', 'stage-banner-title', 'Esportivo liberado!');
  const stageBannerSub = node('div', 'stage-banner-sub', '');
  const stageBannerPerk = node('div', 'stage-banner-perk', '');
  stageBannerBody.append(stageBannerBadge, stageBannerTitle, stageBannerSub, stageBannerPerk);
  stageBanner.append(stageBannerEyebrow, stageBannerBody);
  uiRoot.append(stageBanner);

  // --- Tela Principal (Pôster de capa no início / Prancheta na pausa) ---
  const mainView = node('div', 'menu-view menu-view--main');
  const mainCol = node('div', 'menu-main-col');

  const header = node('div', 'menu-header');
  const brandStrip = node('div', 'menu-brand-strip');
  const brandStamp = node('span', 'menu-brand-stamp', 'GOPOSTAL');
  const eyebrow = node('span', 'menu-eyebrow', 'Juiz de Fora · Turno 06:00 → 12:00');
  brandStrip.append(brandStamp, eyebrow);

  const titleEl = node('h1', 'menu-title');
  const titleLine1 = node('span', '', 'DELIVERED');
  const titleLine2 = node('span', 'menu-title-accent', 'BY NOON');
  titleEl.append(titleLine1, titleLine2);

  const subtitleEl = node('p', 'menu-subtitle', 'Entregue tudo antes do meio-dia para garantir seu horário de almoço.');
  header.append(brandStrip, titleEl, subtitleEl);

  const actions = node('div', 'menu-actions');
  const btnPrimary = node('button', 'menu-btn menu-btn--primary', 'Jogar');
  btnPrimary.type = 'button';
  const btnContinue = node('button', 'menu-btn menu-btn--primary', 'Continuar');
  btnContinue.type = 'button';
  btnContinue.hidden = true;
  const saveInfoEl = node('p', 'menu-subtitle menu-save-info', '');
  saveInfoEl.hidden = true;
  let saveInfo: string | null = null;

  const secondaryLinks = node('div', 'menu-secondary-links');
  const btnPresentation = node('button', 'menu-btn menu-btn--link', 'Modo apresentação');
  btnPresentation.type = 'button';
  const btnRestart = node('button', 'menu-btn menu-btn--link', 'Reiniciar turno (06:00)');
  btnRestart.type = 'button';
  const btnOptions = node('button', 'menu-btn menu-btn--link', 'Opções');
  btnOptions.type = 'button';
  const btnControls = node('button', 'menu-btn menu-btn--link', 'Controles');
  btnControls.type = 'button';
  const btnCredits = node('button', 'menu-btn menu-btn--link', 'Créditos');
  btnCredits.type = 'button';
  const btnReturnTitle = node('button', 'menu-btn menu-btn--link', 'Voltar ao início');
  btnReturnTitle.type = 'button';

  secondaryLinks.append(btnPresentation, btnRestart, btnOptions, btnControls, btnCredits, btnReturnTitle);
  actions.append(btnContinue, saveInfoEl, btnPrimary, secondaryLinks);

  mainCol.append(header, actions);
  const titleLeaderboard = createLeaderboardBox();
  mainView.append(mainCol, titleLeaderboard.root);

  // --- Tela de História (Ficha de turno antes de começar) ---
  const storyView = node('div', 'menu-view menu-subview');
  storyView.hidden = true;
  const storyBanner = node('div', 'menu-sub-banner');
  storyBanner.append(
    node('div', 'menu-eyebrow', 'GOPOSTAL · TURNO DA MANHÃ'),
    node('h2', 'menu-section-title', 'ENTREGUE TUDO ATÉ O ALMOÇO (12:00)'),
  );
  const storySubBody = node('div', 'menu-sub-body');
  const storyBody = node('div', 'menu-story-body');
  storyBody.append(
    node(
      'p',
      'menu-story-p',
      'A GoPostal prometeu todas as 16 encomendas da manhã em Juiz de Fora antes do meio-dia — sem atraso e sem perder a hora do almoço.',
    ),
    node(
      'p',
      'menu-story-p',
      'Michael De Santa, o patrão, deixou um recado no rádio das 06:00: só tem almoço depois da última caixa. A cada etapa concluída, a garagem libera veículos ainda mais rápidos para vencer o relógio.',
    ),
  );
  const storyLadder = node('div', 'menu-story-ladder');
  for (const [num, label] of [
    ['1', 'Hatch'],
    ['2', 'Esportivo'],
    ['3', 'Helicóptero'],
    ['4', 'Avião A-29'],
  ] as const) {
    const step = node('div', 'menu-story-step');
    step.append(node('span', 'menu-story-num', num), node('span', 'menu-story-veh', label));
    storyLadder.append(step);
  }
  const storyTip = node(
    'p',
    'menu-story-tip',
    'Siga a rota amarela no minimapa e as colunas de luz. A última entrega de cada etapa leva direto ao próximo veículo.',
  );
  const storyFooter = node('div', 'menu-sub-footer');
  const btnStoryBack = node('button', 'menu-btn menu-btn--ghost', 'Voltar');
  btnStoryBack.type = 'button';
  const btnStoryPlay = node('button', 'menu-btn menu-btn--primary', 'Iniciar turno');
  btnStoryPlay.type = 'button';
  storyFooter.append(btnStoryBack, btnStoryPlay);
  storySubBody.append(storyBody, storyLadder, storyTip, storyFooter);
  storyView.append(storyBanner, storySubBody);

  // --- Tela de Modo Apresentação ---
  const presView = node('div', 'menu-view menu-subview');
  presView.hidden = true;
  const presBanner = node('div', 'menu-sub-banner');
  presBanner.append(
    node('div', 'menu-eyebrow', 'ROTEIRO AO VIVO · SEM RECORDE'),
    node('h2', 'menu-section-title', 'MODO APRESENTAÇÃO'),
  );
  const presSubBody = node('div', 'menu-sub-body');
  const presIntro = node(
    'p',
    'menu-story-p',
    'Escolha em qual veículo começar e a duração do dia. Durante a partida, F1–F4 trocam de etapa, F5 vai direto para a entrega final na UniAcademia e F6 avança +1h no relógio.',
  );

  let presStage: Stage = 'car';
  let presDayMin: 5 | 10 | 30 = 10;
  let presFinal = false;

  const presForm = node('div', 'menu-pres-form');

  const stageRow = node('div', 'menu-opt-row');
  stageRow.append(node('span', 'menu-opt-label', 'Etapa inicial'));
  const stageSeg = node('div', 'menu-segments');
  const stageBtns = new Map<Stage, HTMLButtonElement>();
  for (const [st, label] of [
    ['car', 'Carro'],
    ['tuned', 'Esportivo'],
    ['heli', 'Heli'],
    ['a29', 'A-29'],
  ] as const) {
    const b = node('button', 'menu-seg-btn', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      callbacks.onButtonClick();
      presStage = st;
      presFinal = false;
      syncPresentationInputs();
    });
    stageBtns.set(st, b);
    stageSeg.append(b);
  }
  stageRow.append(stageSeg);

  const durRow = node('div', 'menu-opt-row');
  durRow.append(node('span', 'menu-opt-label', 'Duração do turno (06:00 → 12:00)'));
  const durSeg = node('div', 'menu-segments');
  const durBtns = new Map<5 | 10 | 30, HTMLButtonElement>();
  for (const mins of [5, 10, 30] as const) {
    const b = node('button', 'menu-seg-btn', `${mins} min`);
    b.type = 'button';
    b.addEventListener('click', () => {
      callbacks.onButtonClick();
      presDayMin = mins;
      syncPresentationInputs();
    });
    durBtns.set(mins, b);
    durSeg.append(b);
  }
  durRow.append(durSeg);

  const finalToggleRow = node('label', 'menu-opt-toggle');
  const finalToggleLbl = node('span', 'menu-opt-label', 'Ir direto para a entrega final (A-29 na UniAcademia)');
  const finalToggleInput = document.createElement('input');
  finalToggleInput.type = 'checkbox';
  finalToggleInput.className = 'menu-checkbox';
  finalToggleInput.addEventListener('change', () => {
    callbacks.onButtonClick();
    presFinal = finalToggleInput.checked;
    if (presFinal) presStage = 'a29';
    syncPresentationInputs();
  });
  finalToggleRow.append(finalToggleLbl, finalToggleInput);

  const presNote = node(
    'p',
    'menu-story-tip',
    'Atalhos ativos só neste modo: F1 Carro · F2 Esportivo · F3 Heli · F4 A-29 · F5 Entrega final · F6 +1h no relógio.',
  );

  presForm.append(stageRow, durRow, finalToggleRow, presNote);

  const presFooter = node('div', 'menu-sub-footer');
  const btnPresBack = node('button', 'menu-btn menu-btn--ghost', 'Voltar');
  btnPresBack.type = 'button';
  const btnPresStart = node('button', 'menu-btn menu-btn--primary', 'Iniciar');
  btnPresStart.type = 'button';
  presFooter.append(btnPresBack, btnPresStart);
  presSubBody.append(presIntro, presForm, presFooter);
  presView.append(presBanner, presSubBody);

  function syncPresentationInputs() {
    for (const [st, btn] of stageBtns) {
      btn.classList.toggle('is-active', !presFinal && st === presStage);
    }
    for (const [m, btn] of durBtns) {
      btn.classList.toggle('is-active', m === presDayMin);
    }
    finalToggleInput.checked = presFinal;
  }

  // --- Tela de Resultado (Comprovante de Turno: Vitória ou Derrota) ---
  const resultView = node('div', 'menu-view menu-subview');
  resultView.hidden = true;
  const resultBanner = node('div', 'menu-sub-banner');
  const resultEyebrow = node('div', 'menu-eyebrow', 'COMPROVANTE DE TURNO · GOPOSTAL');
  const resultTitle = node('h2', 'menu-title menu-result-title', 'MISSÃO CUMPRIDA!');
  resultBanner.append(resultEyebrow, resultTitle);

  const resultSubBody = node('div', 'menu-sub-body');
  const resultMsg = node('p', 'menu-result-msg', '');
  const resultStats = node('div', 'menu-result-stats');
  const statTimeVal = node('span', 'menu-stat-value', '06:00');
  const statScoreVal = node('span', 'menu-stat-value', '0');
  const statDeliveriesVal = node('span', 'menu-stat-value', '0/0');
  const statStageVal = node('span', 'menu-stat-value', '1/4 · Hatch');

  const makeStat = (label: string, valEl: HTMLElement) => {
    const box = node('div', 'menu-stat-box');
    box.append(node('span', 'menu-stat-label', label), valEl);
    return box;
  };
  resultStats.append(
    makeStat('Horário', statTimeVal),
    makeStat('Pontos', statScoreVal),
    makeStat('Entregas', statDeliveriesVal),
    makeStat('Etapa', statStageVal),
  );

  const recordForm = node('div', 'menu-record-form');
  recordForm.hidden = true;
  const recordFormHead = node('div', 'menu-record-form-head', 'Novo recorde — assine com suas 3 iniciais');
  const recordFormRow = node('div', 'menu-record-form-row');
  const initialsInput = document.createElement('input');
  initialsInput.type = 'text';
  initialsInput.className = 'menu-initials-input';
  initialsInput.maxLength = 3;
  initialsInput.placeholder = 'GOP';
  initialsInput.setAttribute('aria-label', 'Iniciais do jogador (3 letras)');
  const btnSaveRecord = node('button', 'menu-btn menu-record-save-btn', 'Carimbar recorde');
  btnSaveRecord.type = 'button';
  recordFormRow.append(initialsInput, btnSaveRecord);
  recordForm.append(recordFormHead, recordFormRow);

  const recordNote = node('p', 'menu-record-note', '');
  recordNote.hidden = true;

  const lossGoalBox = node('div', 'menu-loss-goal');
  lossGoalBox.hidden = true;
  const lossGoalMissing = node('div', 'menu-loss-goal-missing', '');
  const lossGoalTarget = node('div', 'menu-loss-goal-target', '');
  lossGoalBox.append(lossGoalMissing, lossGoalTarget);

  const resultLeaderboard = createLeaderboardBox();
  resultLeaderboard.root.hidden = true;

  const resultActions = node('div', 'menu-sub-footer');
  const btnResultTitle = node('button', 'menu-btn menu-btn--ghost', 'Voltar ao início');
  btnResultTitle.type = 'button';
  const btnPlayAgain = node('button', 'menu-btn menu-btn--primary', 'Jogar de novo');
  btnPlayAgain.type = 'button';
  resultActions.append(btnResultTitle, btnPlayAgain);
  resultSubBody.append(
    resultMsg,
    resultStats,
    recordForm,
    recordNote,
    lossGoalBox,
    resultLeaderboard.root,
    resultActions,
  );
  resultView.append(resultBanner, resultSubBody);

  // --- Subtela: Opções (mantém .menu-options-list única para injeção de Tráfego e GPS no chão pelo game.ts) ---
  const optionsView = node('div', 'menu-view menu-subview');
  optionsView.hidden = true;
  const optBanner = node('div', 'menu-sub-banner');
  optBanner.append(
    node('div', 'menu-eyebrow', 'GOPOSTAL · AJUSTES'),
    node('h2', 'menu-section-title', 'OPÇÕES'),
  );
  const optSubBody = node('div', 'menu-sub-body');
  const optList = node('div', 'menu-options-list');

  function makeRangeRow(
    label: string,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
    onChange: (v: number) => void,
  ) {
    const row = node('label', 'menu-opt-row');
    const head = node('div', 'menu-opt-head');
    const lbl = node('span', 'menu-opt-label', label);
    const val = node('span', 'menu-opt-value');
    head.append(lbl, val);

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'menu-range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.addEventListener('input', () => {
      const num = Number(input.value);
      val.textContent = format(num);
      onChange(num);
    });
    row.append(head, input);
    optList.append(row);
    return {
      setValue(v: number) {
        input.value = String(v);
        val.textContent = format(v);
      },
    };
  }

  function makeToggleRow(label: string, onChange: (checked: boolean) => void) {
    const row = node('label', 'menu-opt-toggle');
    const lbl = node('span', 'menu-opt-label', label);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'menu-checkbox';
    input.addEventListener('change', () => {
      callbacks.onButtonClick();
      onChange(input.checked);
    });
    row.append(lbl, input);
    optList.append(row);
    return {
      setChecked(v: boolean) {
        input.checked = v;
      },
    };
  }

  function makeSegmentRow<T extends string>(
    label: string,
    items: ReadonlyArray<[T, string]>,
    onChange: (value: T) => void,
  ) {
    const row = node('div', 'menu-opt-row');
    const lbl = node('span', 'menu-opt-label', label);
    const group = node('div', 'menu-segments');
    const buttons = new Map<T, HTMLButtonElement>();
    for (const [value, text] of items) {
      const b = node('button', 'menu-seg-btn', text);
      b.type = 'button';
      b.addEventListener('click', () => {
        callbacks.onButtonClick();
        onChange(value);
      });
      buttons.set(value, b);
      group.append(b);
    }
    row.append(lbl, group);
    optList.append(row);
    return {
      setActive(current: T) {
        for (const [val, btn] of buttons) {
          btn.classList.toggle('is-active', val === current);
        }
      },
    };
  }

  function patchSettings(partial: Partial<GameSettings>) {
    settings = sanitizeSettings({ ...settings, ...partial });
    syncOptionInputs();
    callbacks.onSettingsChange({ ...settings });
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const masterCtrl = makeRangeRow('Volume geral', 0, 1, 0.05, pct, (v) => patchSettings({ masterVolume: v }));
  const musicCtrl = makeRangeRow('Música', 0, 1, 0.05, pct, (v) => patchSettings({ musicVolume: v }));
  const sfxCtrl = makeRangeRow('Efeitos sonoros', 0, 1, 0.05, pct, (v) => patchSettings({ sfxVolume: v }));
  const sensCtrl = makeRangeRow(
    'Sensibilidade do mouse',
    0.05,
    0.4,
    0.01,
    (v) => `${(v / 0.15).toFixed(2)}×`,
    (v) => patchSettings({ mouseSensitivity: v }),
  );

  const invertCtrl = makeToggleRow('Inverter eixo Y (mouse)', (v) => patchSettings({ invertY: v }));
  const hudCtrl = makeToggleRow('Mostrar HUD', (v) => patchSettings({ showHud: v }));
  const tipsCtrl = makeToggleRow('Mostrar dicas', (v) => patchSettings({ showTips: v }));
  const fpsCtrl = makeToggleRow('Mostrar FPS', (v) => patchSettings({ showFps: v }));
  const reduceMotionCtrl = makeToggleRow('Reduzir movimento (desliga tremores e linhas)', (v) =>
    patchSettings({ reduceMotion: v }),
  );

  const controlModeCtrl = makeSegmentRow<'mouse' | 'keyboard'>(
    'Modo de controle do A-29',
    [
      ['mouse', 'Mouse'],
      ['keyboard', 'Teclado'],
    ],
    (v) => patchSettings({ defaultControlMode: v }),
  );

  const qualityCtrl = makeSegmentRow<QualityLevel>(
    'Qualidade gráfica',
    [
      ['low', 'Baixa'],
      ['medium', 'Média'],
      ['high', 'Alta'],
    ],
    (v) => patchSettings({ quality: v }),
  );

  const clearRecordsBox = node('div', 'menu-clear-records-box');
  const btnClearRecords = node('button', 'menu-btn menu-btn--ghost', 'Apagar recordes');
  btnClearRecords.type = 'button';
  const clearConfirmBar = node('div', 'menu-confirm-bar');
  clearConfirmBar.hidden = true;
  const clearConfirmText = node('span', 'menu-confirm-text', 'Apagar todos os recordes salvos neste navegador?');
  const clearConfirmActions = node('div', 'menu-confirm-actions');
  const btnClearConfirm = node('button', 'menu-btn menu-btn--danger', 'Confirmar');
  btnClearConfirm.type = 'button';
  const btnClearCancel = node('button', 'menu-btn menu-btn--ghost', 'Cancelar');
  btnClearCancel.type = 'button';
  clearConfirmActions.append(btnClearConfirm, btnClearCancel);
  clearConfirmBar.append(clearConfirmText, clearConfirmActions);
  const clearFeedback = node('span', 'menu-clear-feedback', '');
  clearFeedback.hidden = true;
  clearRecordsBox.append(btnClearRecords, clearConfirmBar, clearFeedback);

  const optFooter = node('div', 'menu-sub-footer');
  const btnResetDefaults = node('button', 'menu-btn menu-btn--ghost', 'Restaurar padrões');
  btnResetDefaults.type = 'button';
  const btnOptBack = node('button', 'menu-btn menu-btn--primary', 'Voltar');
  btnOptBack.type = 'button';
  optFooter.append(btnResetDefaults, btnOptBack);
  optSubBody.append(optList, clearRecordsBox, optFooter);
  optionsView.append(optBanner, optSubBody);

  // --- Subtela: Controles (teclas desenhadas como keycaps físicas) ---
  const controlsView = node('div', 'menu-view menu-subview');
  controlsView.hidden = true;
  const ctrlBanner = node('div', 'menu-sub-banner');
  ctrlBanner.append(
    node('div', 'menu-eyebrow', 'MANUAL DO ENTREGADOR'),
    node('h2', 'menu-section-title', 'CONTROLES'),
  );
  const ctrlSubBody = node('div', 'menu-sub-body');
  const ctrlTable = node('div', 'menu-controls-table');
  for (const [keys, desc] of CONTROLS_LIST) {
    const row = node('div', 'menu-ctrl-row');
    const keysWrap = node('div', 'menu-ctrl-keys');
    for (let i = 0; i < keys.length; i++) {
      keysWrap.append(node('kbd', 'gp-keycap', keys[i]));
    }
    row.append(keysWrap, node('span', 'menu-ctrl-desc', desc));
    ctrlTable.append(row);
  }
  const ctrlFooter = node('div', 'menu-sub-footer');
  const btnCtrlBack = node('button', 'menu-btn menu-btn--primary', 'Voltar');
  btnCtrlBack.type = 'button';
  ctrlFooter.append(btnCtrlBack);
  ctrlSubBody.append(ctrlTable, ctrlFooter);
  controlsView.append(ctrlBanner, ctrlSubBody);

  // --- Subtela: Créditos ---
  const creditsView = node('div', 'menu-view menu-subview');
  creditsView.hidden = true;
  const credBanner = node('div', 'menu-sub-banner');
  credBanner.append(
    node('div', 'menu-eyebrow', 'DELIVERED BY NOON'),
    node('h2', 'menu-section-title', 'CRÉDITOS'),
  );
  const credSubBody = node('div', 'menu-sub-body');
  const credBody = node('div', 'menu-credits-body');
  const creditEntries: ReadonlyArray<[string, string]> = [
    ['Equipe', 'João Victor da Costa, Gabriel Monteiro, Rafael Lima Henriques, Lucas Tostes'],
    ['Mapa e relevo (Juiz de Fora)', CITY_CREDITS],
    ['Física de voo', 'Física baseada no JSBSim (LGPL-2.1)'],
    ['Motor gráfico', 'PlayCanvas'],
    ['Modelos 3D', 'Modelos gerados no Meshy e ajustados no Blender pelo grupo (hatch, esportivo, carros do trânsito, helicóptero) e feitos no Blender (A-29, UniAcademia, personagem)'],
    ['Homenagens (texto)', 'GoPostal, Michael De Santa (o patrão) e entregas com nomes em homenagem a clássicos dos games'],
    ['Áudio e interface', 'Trilha dinâmica, motor procedural (Engine Sim MIT), iluminação da manhã e HUD em Web Audio API'],
  ];
  for (const [role, value] of creditEntries) {
    const item = node('div', 'menu-credit-item');
    item.append(node('span', 'menu-credit-role', role), node('span', 'menu-credit-name', value));
    credBody.append(item);
  }
  const credFooter = node('div', 'menu-sub-footer');
  const btnCredBack = node('button', 'menu-btn menu-btn--primary', 'Voltar');
  btnCredBack.type = 'button';
  credFooter.append(btnCredBack);
  credSubBody.append(credBody, credFooter);
  creditsView.append(credBanner, credSubBody);

  card.append(mainView, storyView, presView, resultView, optionsView, controlsView, creditsView);

  function clearStageBanner() {
    if (stageBannerTimer !== null) {
      clearTimeout(stageBannerTimer);
      stageBannerTimer = null;
    }
    stageBanner.hidden = true;
  }

  function resetClearRecordsUi(hideFeedback = true) {
    clearConfirmBar.hidden = true;
    btnClearRecords.hidden = false;
    if (hideFeedback) clearFeedback.hidden = true;
  }

  function refreshTitleLeaderboard() {
    titleLeaderboard.render(loadRecords(), null);
  }

  function commitPendingRecord() {
    if (!pendingWinRecord) return;
    const raw = initialsInput.value;
    const initials = sanitizeInitials(raw);
    lastSavedInitials = initials;
    const res = saveRecord({
      initials,
      finishMinutes: pendingWinRecord.finishMinutes,
      score: pendingWinRecord.score,
      delivered: pendingWinRecord.delivered,
      total: pendingWinRecord.total,
    });
    pendingWinRecord = null;
    recordForm.hidden = true;
    resultLeaderboard.render(res.records, res.entry?.id ?? null);
    refreshTitleLeaderboard();
    if (!res.saved) {
      recordNote.textContent = 'Armazenamento do navegador indisponível — resultado não salvo.';
      recordNote.hidden = false;
    } else if (res.rank === null) {
      recordNote.textContent = 'Fora do top 5 — termine mais cedo para entrar no quadro de funcionários!';
      recordNote.hidden = false;
    } else {
      recordNote.hidden = true;
    }
  }

  function syncOptionInputs() {
    masterCtrl.setValue(settings.masterVolume);
    musicCtrl.setValue(settings.musicVolume);
    sfxCtrl.setValue(settings.sfxVolume);
    sensCtrl.setValue(settings.mouseSensitivity);
    invertCtrl.setChecked(settings.invertY);
    hudCtrl.setChecked(settings.showHud);
    tipsCtrl.setChecked(settings.showTips);
    fpsCtrl.setChecked(settings.showFps);
    reduceMotionCtrl.setChecked(settings.reduceMotion);
    controlModeCtrl.setActive(settings.defaultControlMode);
    qualityCtrl.setActive(settings.quality);
  }

  function renderView() {
    const visible = !hiddenByLoading && mode !== 'playing';
    overlay.hidden = !visible;
    const isPosterMain = mode === 'title' && screen === 'main';
    overlay.className = `menu-overlay ${
      mode === 'title' ? 'menu-overlay--title' : mode === 'ended' ? 'menu-overlay--ended' : 'menu-overlay--paused'
    }${isPosterMain ? ' is-poster-main' : ''}`;
    if (!visible) return;

    mainView.hidden = screen !== 'main';
    storyView.hidden = screen !== 'story';
    presView.hidden = screen !== 'presentation';
    resultView.hidden = screen !== 'result';
    optionsView.hidden = screen !== 'options';
    controlsView.hidden = screen !== 'controls';
    creditsView.hidden = screen !== 'credits';

    if (mode === 'title') {
      eyebrow.textContent = 'Juiz de Fora · 06:00 → 12:00';
      titleLine1.textContent = 'DELIVERED';
      titleLine2.textContent = 'BY NOON';
      titleLine2.hidden = false;
      subtitleEl.textContent = 'Entregue tudo antes do meio-dia para garantir seu horário de almoço.';
      subtitleEl.hidden = false;
      btnPrimary.textContent = saveInfo ? 'Novo jogo' : 'Jogar';
      btnPrimary.className = saveInfo ? 'menu-btn menu-btn--link' : 'menu-btn menu-btn--primary';
      btnContinue.hidden = !saveInfo;
      saveInfoEl.hidden = !saveInfo;
      saveInfoEl.textContent = saveInfo ? `Turno salvo: ${saveInfo}` : '';
      btnPresentation.hidden = false;
      btnRestart.hidden = true;
      btnControls.textContent = 'Controles';
      btnCredits.hidden = false;
      btnReturnTitle.hidden = true;
      titleLeaderboard.root.hidden = false;
      if (screen === 'main') refreshTitleLeaderboard();
    } else if (mode === 'paused') {
      eyebrow.textContent = 'Turno pausado';
      titleLine1.textContent = 'PAUSADO';
      titleLine2.textContent = '';
      titleLine2.hidden = true;
      subtitleEl.textContent = 'Relógio congelado — aperte Esc ou P para voltar ao volante.';
      subtitleEl.hidden = false;
      btnPrimary.textContent = 'Continuar';
      btnPrimary.className = 'menu-btn menu-btn--primary';
      btnContinue.hidden = true;
      saveInfoEl.hidden = true;
      btnPresentation.hidden = true;
      btnRestart.textContent = 'Reiniciar turno (06:00)';
      btnRestart.hidden = false;
      btnControls.textContent = 'Ver controles';
      btnCredits.hidden = true;
      btnReturnTitle.hidden = false;
      titleLeaderboard.root.hidden = true;
    }
  }

  initialsInput.addEventListener('input', () => {
    const clean = initialsInput.value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3);
    if (initialsInput.value !== clean) initialsInput.value = clean;
  });

  initialsInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      callbacks.onButtonClick(true);
      commitPendingRecord();
    }
  });

  btnSaveRecord.addEventListener('click', () => {
    callbacks.onButtonClick(true);
    commitPendingRecord();
  });

  btnClearRecords.addEventListener('click', () => {
    callbacks.onButtonClick();
    clearFeedback.hidden = true;
    btnClearRecords.hidden = true;
    clearConfirmBar.hidden = false;
  });

  btnClearCancel.addEventListener('click', () => {
    callbacks.onButtonClick();
    resetClearRecordsUi(true);
  });

  btnClearConfirm.addEventListener('click', () => {
    callbacks.onButtonClick(true);
    const ok = clearRecords();
    resetClearRecordsUi(false);
    clearFeedback.textContent = ok ? 'Recordes apagados.' : 'Armazenamento indisponível.';
    clearFeedback.hidden = false;
    refreshTitleLeaderboard();
  });

  btnContinue.addEventListener('click', () => {
    callbacks.onButtonClick(true);
    callbacks.onContinue?.();
  });

  btnPrimary.addEventListener('click', () => {
    callbacks.onButtonClick(true);
    if (mode === 'title') {
      screen = 'story';
      renderView();
    } else {
      callbacks.onResume();
    }
  });

  btnPresentation.addEventListener('click', () => {
    callbacks.onButtonClick();
    screen = 'presentation';
    syncPresentationInputs();
    renderView();
  });

  btnPresBack.addEventListener('click', () => {
    callbacks.onButtonClick();
    screen = 'main';
    renderView();
  });

  btnPresStart.addEventListener('click', () => {
    callbacks.onButtonClick(true);
    callbacks.onStartPresentation?.({
      stage: presFinal ? 'a29' : presStage,
      dayDurationMinutes: presDayMin,
      finalDelivery: presFinal,
    });
  });

  btnStoryPlay.addEventListener('click', () => {
    callbacks.onButtonClick(true);
    callbacks.onStartFlight();
  });

  btnStoryBack.addEventListener('click', () => {
    callbacks.onButtonClick();
    screen = 'main';
    renderView();
  });

  btnRestart.addEventListener('click', () => {
    callbacks.onButtonClick(true);
    callbacks.onRestart();
  });

  btnPlayAgain.addEventListener('click', () => {
    callbacks.onButtonClick(true);
    commitPendingRecord();
    callbacks.onRestart();
  });

  btnOptions.addEventListener('click', () => {
    callbacks.onButtonClick();
    screen = 'options';
    syncOptionInputs();
    resetClearRecordsUi(true);
    renderView();
  });

  btnControls.addEventListener('click', () => {
    callbacks.onButtonClick();
    screen = 'controls';
    renderView();
  });

  btnCredits.addEventListener('click', () => {
    callbacks.onButtonClick();
    screen = 'credits';
    renderView();
  });

  btnReturnTitle.addEventListener('click', () => {
    callbacks.onButtonClick();
    callbacks.onReturnTitle();
  });

  btnResultTitle.addEventListener('click', () => {
    callbacks.onButtonClick();
    commitPendingRecord();
    callbacks.onReturnTitle();
  });

  btnResetDefaults.addEventListener('click', () => {
    callbacks.onButtonClick();
    patchSettings({ ...DEFAULT_SETTINGS });
  });

  const goMain = () => {
    callbacks.onButtonClick();
    resetClearRecordsUi(true);
    screen = 'main';
    renderView();
  };
  btnOptBack.addEventListener('click', goMain);
  btnCtrlBack.addEventListener('click', goMain);
  btnCredBack.addEventListener('click', goMain);

  syncOptionInputs();
  renderView();

  return {
    setSaveInfo(info: string | null) {
      saveInfo = info;
      if (mode === 'title') renderView();
    },
    setMode(nextMode: GameMode) {
      mode = nextMode;
      if (nextMode !== 'ended') {
        pendingWinRecord = null;
        resetClearRecordsUi(true);
        screen = 'main';
      }
      renderView();
    },
    setHiddenByLoading(hidden: boolean) {
      hiddenByLoading = hidden;
      renderView();
    },
    getScreen() {
      return screen;
    },
    back() {
      if (screen !== 'main' && screen !== 'result') {
        resetClearRecordsUi(true);
        screen = 'main';
        renderView();
        return true;
      }
      return false;
    },
    syncSettings(next: GameSettings) {
      settings = sanitizeSettings(next);
      syncOptionInputs();
    },
    showStageUnlocked(stage: Stage) {
      clearStageBanner();
      const copy = STAGE_UNLOCK_COPY[stage];
      stageBanner.className = `stage-banner stage-banner--${copy.accent}`;
      stageBannerBadge.textContent = copy.badge;
      stageBannerTitle.textContent = copy.title;
      stageBannerSub.textContent = copy.subtitle;
      stageBannerPerk.textContent = copy.perk;
      stageBanner.hidden = false;
      stageBannerTimer = setTimeout(() => {
        stageBannerTimer = null;
        stageBanner.hidden = true;
      }, 4800);
    },
    clearStageBanner,
    showEndScreen(outcome: 'won' | 'lost', mission: MissionState, presentationMode = false) {
      clearStageBanner();
      mode = 'ended';
      screen = 'result';
      pendingWinRecord = null;
      recordForm.hidden = true;
      recordNote.hidden = true;
      lossGoalBox.hidden = true;
      resultLeaderboard.root.hidden = true;

      const remaining = Math.max(0, mission.total - mission.delivered);

      resultView.className = `menu-view menu-subview menu-result--${outcome}`;
      resultBanner.className = `menu-sub-banner ${outcome === 'lost' ? 'menu-sub-banner--lost' : ''}`;
      if (outcome === 'won') {
        resultEyebrow.textContent = presentationMode
          ? 'MODO APRESENTAÇÃO · ENTREGUE NO PRAZO'
          : 'GOPOSTAL · ENTREGUE NO PRAZO';
        resultTitle.textContent = 'MISSÃO CUMPRIDA!';
        resultMsg.textContent = `Michael De Santa, o patrão, liberou seu almoço: todas as ${mission.delivered} entregas da GoPostal chegaram às ${formatClock(mission.clockMinutes)}!`;

        const currentRecords = loadRecords();
        resultLeaderboard.root.hidden = false;
        resultLeaderboard.render(currentRecords, null);

        if (presentationMode) {
          recordNote.textContent = 'Modo apresentação: este resultado não grava recordes.';
          recordNote.hidden = false;
        } else if (!isRecordStorageAvailable()) {
          recordNote.textContent = 'Armazenamento do navegador indisponível — o jogo continua sem recorde.';
          recordNote.hidden = false;
        } else {
          const finishMinutes = Math.max(360, Math.min(720, Math.floor(mission.clockMinutes)));
          if (wouldMakeTopRecords({ finishMinutes, score: mission.score, delivered: mission.delivered }, currentRecords)) {
            pendingWinRecord = {
              finishMinutes,
              score: mission.score,
              delivered: mission.delivered,
              total: mission.total,
            };
            initialsInput.value = lastSavedInitials;
            recordForm.hidden = false;
            setTimeout(() => {
              if (!recordForm.hidden) {
                initialsInput.focus();
                initialsInput.select();
              }
            }, 0);
          } else {
            recordNote.textContent = 'Fora do top 5 — termine mais cedo para entrar no quadro de funcionários!';
            recordNote.hidden = false;
          }
        }
      } else {
        resultEyebrow.textContent = presentationMode
          ? 'MODO APRESENTAÇÃO · 12:00'
          : 'GOPOSTAL · HORA DO ALMOÇO';
        resultTitle.textContent = 'MEIO-DIA!';
        resultMsg.textContent =
          remaining === 1
            ? 'Deu meio-dia! Faltou 1 entrega — Michael De Santa, o patrão, cancelou seu almoço e mandou recomeçar o turno.'
            : `Deu meio-dia! Faltaram ${remaining} entregas — Michael De Santa, o patrão, cancelou seu almoço e mandou recomeçar o turno.`;

        lossGoalMissing.textContent =
          remaining === 1
            ? 'Faltou apenas 1 entrega para fechar o turno antes do almoço.'
            : `Faltaram ${remaining} entregas para fechar o turno antes do almoço.`;
        const best = getBestRecord();
        lossGoalTarget.textContent = best
          ? `Meta — Melhor turno: ${best.initials} · ${formatRecordClock(best.finishMinutes)} · ${best.score.toLocaleString('pt-BR')} pts (${best.delivered}/${best.total})`
          : `Meta: entregue todas as ${mission.total} encomendas antes das 12:00 para abrir o quadro.`;
        lossGoalBox.hidden = false;

        if (presentationMode) {
          recordNote.textContent = 'Modo apresentação: este modo não grava recordes.';
          recordNote.hidden = false;
        }
      }

      statTimeVal.textContent = formatClock(outcome === 'lost' ? 720 : mission.clockMinutes);
      statScoreVal.textContent = `${mission.score.toLocaleString('pt-BR')} pts`;
      statDeliveriesVal.textContent = `${mission.delivered}/${mission.total}`;
      statStageVal.textContent = STAGE_LABEL[mission.stage];

      renderView();
    },
    destroy() {
      clearStageBanner();
      overlay.remove();
      stageBanner.remove();
    },
  };
}
