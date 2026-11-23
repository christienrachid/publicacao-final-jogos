import { KEY_SPACE } from 'playcanvas';
import { isTunedNitroActive } from './hud';
import { onMissionRestart } from './mission';
import type { DeliveryPoint, FlightContext, FlightModule, MissionState, Stage, VehicleKind } from './types';
import { getRuntime } from './ui/settings';

type TipId =
  | 'car-drive'
  | 'follow-arrow'
  | 'first-delivery-stop'
  | 'vehicle-exit'
  | 'tuned-nitro'
  | 'tuned-handbrake'
  | 'heli-controls'
  | 'heli-land'
  | 'a29-controls'
  | 'air-camera'
  | 'late-11h'
  | 'idle-reminder';

type TipTone = 'default' | 'urgent' | 'goal';

interface TipPart {
  key?: string;
  text?: string;
}

interface ActiveTip {
  id: TipId;
  icon: string;
  tone: TipTone;
  parts: readonly TipPart[];
  remaining: number;
  minElapsed: number;
  elapsed: number;
}

const VEHICLE_NAMES: Record<Stage, string> = {
  car: 'Hatch',
  tuned: 'Esportivo',
  heli: 'helicóptero',
  a29: 'A-29',
};

function findCurrentDelivery(mission: MissionState, x: number, z: number): DeliveryPoint | null {
  if (mission.nextDeliveryId) {
    for (let i = 0; i < mission.deliveries.length; i++) {
      const d = mission.deliveries[i];
      if (!d.delivered && d.id === mission.nextDeliveryId) return d;
    }
  }
  const stage = mission.carrying ?? mission.stage;
  let best: DeliveryPoint | null = null;
  let bestSq = Infinity;
  for (let i = 0; i < mission.deliveries.length; i++) {
    const d = mission.deliveries[i];
    if (d.delivered || d.stage !== stage) continue;
    const dSq = (d.x - x) ** 2 + (d.z - z) ** 2;
    if (dSq < bestSq) {
      bestSq = dSq;
      best = d;
    }
  }
  return best;
}

/**
 * Dicas contextuais de primeiro minuto ("onboarding"):
 * - Uma dica por vez, com teclas em destaque, fora do centro da tela
 * - Cada dica aparece no máximo uma vez por partida
 * - Desligadas por padrão no Modo Apresentação e controladas por Opções → "Mostrar dicas"
 */
export function createDicas(ctx: FlightContext, uiRoot?: HTMLElement | null): FlightModule {
  const { app, state } = ctx;
  const ui = uiRoot ?? (typeof document !== 'undefined' ? document.getElementById('ui') : null);
  if (!ui || typeof document === 'undefined') {
    return { update() {} };
  }

  const card = document.createElement('div');
  card.className = 'hud-tip-card';
  card.hidden = true;

  const iconEl = document.createElement('span');
  iconEl.className = 'hud-tip-icon';

  const bodyEl = document.createElement('span');
  bodyEl.className = 'hud-tip-body';

  card.append(iconEl, bodyEl);
  ui.append(card);

  const shown = new Set<TipId>();
  let active: ActiveTip | null = null;
  let playTime = 0;
  let driveAccum = 0;
  let distanceMoved = 0;
  let idleSeconds = 0;
  let prevX = state.x;
  let prevZ = state.z;
  let prevVehicle: VehicleKind = state.vehicle;
  let prevDelivered = ctx.mission?.delivered ?? 0;
  let cooldown = 0.6;
  let destroyed = false;

  function clearActive() {
    active = null;
    card.hidden = true;
  }

  function resetRun() {
    shown.clear();
    clearActive();
    playTime = 0;
    driveAccum = 0;
    distanceMoved = 0;
    idleSeconds = 0;
    prevX = state.x;
    prevZ = state.z;
    prevVehicle = state.vehicle;
    prevDelivered = ctx.mission?.delivered ?? 0;
    cooldown = 0.6;
  }

  const unsubscribeRestart = onMissionRestart(ctx, resetRun);

  function renderTip(tip: ActiveTip) {
    card.className = `hud-tip-card hud-tip-card--${tip.tone}`;
    iconEl.textContent = tip.icon;
    bodyEl.textContent = '';
    for (let i = 0; i < tip.parts.length; i++) {
      const part = tip.parts[i];
      if (part.key) {
        const kbd = document.createElement('kbd');
        kbd.className = 'hud-tip-key';
        kbd.textContent = part.key;
        bodyEl.append(kbd);
      } else if (part.text) {
        bodyEl.append(document.createTextNode(part.text));
      }
    }
    card.hidden = false;
  }

  function showTip(
    id: TipId,
    icon: string,
    parts: readonly TipPart[],
    duration: number,
    tone: TipTone = 'default',
    minElapsed = 1.4,
  ): boolean {
    if (shown.has(id)) return false;
    shown.add(id);
    active = {
      id,
      icon,
      tone,
      parts,
      remaining: duration,
      minElapsed,
      elapsed: 0,
    };
    renderTip(active);
    return true;
  }

  function isActiveFulfilled(mission: MissionState, speedAbs: number, vehicleChanged: boolean): boolean {
    if (!active || active.elapsed < active.minElapsed) return false;
    switch (active.id) {
      case 'car-drive':
        return driveAccum > 1.8 && speedAbs > 6;
      case 'follow-arrow':
        return mission.delivered > 0;
      case 'first-delivery-stop':
        return mission.delivered > 0;
      case 'vehicle-exit':
        return vehicleChanged;
      case 'tuned-nitro':
        return isTunedNitroActive(state);
      case 'tuned-handbrake':
        return Boolean(app.keyboard?.isPressed(KEY_SPACE));
      case 'heli-controls':
        return state.vehicle === 'heli' && state.heightAboveGround > 7;
      case 'heli-land':
        return mission.delivered > prevDelivered;
      case 'a29-controls':
        return Boolean(app.keyboard?.isPressed(KEY_SPACE));
      case 'air-camera':
        return state.camera !== 'chase';
      case 'idle-reminder':
        return speedAbs > 2.2;
      default:
        return false;
    }
  }

  return {
    update(dt: number) {
      if (destroyed) return;
      const rt = getRuntime(state);
      const mission = ctx.mission;

      // Desligadas fora do jogo, quando HUD/dicas estão ocultos ou no Modo Apresentação
      if (
        rt.mode !== 'playing' ||
        !rt.settings.showHud ||
        !rt.settings.showTips ||
        rt.presentationMode ||
        !mission ||
        mission.status !== 'playing'
      ) {
        if (!card.hidden) card.hidden = true;
        return;
      }

      if (!Number.isFinite(dt) || dt <= 0) {
        if (active && card.hidden) card.hidden = false;
        return;
      }

      playTime += dt;
      const speedAbs = Math.abs(state.speed);
      const stepDist = Math.hypot(state.x - prevX, state.z - prevZ);
      if (stepDist < 60) distanceMoved += stepDist;
      prevX = state.x;
      prevZ = state.z;

      const vehicleChanged = state.vehicle !== prevVehicle;
      if (speedAbs > 3) driveAccum += dt;

      if (speedAbs < 0.8 && mission.delivered === prevDelivered) {
        idleSeconds += dt;
      } else {
        idleSeconds = 0;
      }

      // Atualiza dica ativa (tempo limite ou conclusão da ação)
      if (active) {
        if (card.hidden) card.hidden = false;
        active.elapsed += dt;
        active.remaining -= dt;
        if (active.remaining <= 0 || isActiveFulfilled(mission, speedAbs, vehicleChanged)) {
          clearActive();
          cooldown = 1.1;
        }
      }

      const nextDel = findCurrentDelivery(mission, state.x, state.z);
      const distNext = nextDel ? Math.hypot(nextDel.x - state.x, nextDel.z - state.z) : Infinity;

      // Dica urgente das 11:00 pode substituir dica comum imediatamente
      if (!shown.has('late-11h') && mission.clockMinutes >= 11 * 60) {
        showTip(
          'late-11h',
          '!',
          [{ text: 'Corre! O almoço está chegando' }],
          5.5,
          'urgent',
          1.8,
        );
      } else if (
        mission.delivered === 0 &&
        !shown.has('first-delivery-stop') &&
        distNext < 58 &&
        (!active || active.id === 'car-drive' || active.id === 'follow-arrow')
      ) {
        // Ao chegar perto da 1ª entrega, prioriza a dica de parada no círculo
        showTip(
          'first-delivery-stop',
          '◎',
          [{ text: 'Pare dentro do círculo para entregar' }],
          6.0,
          'goal',
          1.2,
        );
      }

      if (!active) {
        cooldown = Math.max(0, cooldown - dt);
        if (cooldown <= 0) {
          // 1) Início no carro: controles básicos
          if (state.vehicle === 'car' && !shown.has('car-drive')) {
            showTip(
              'car-drive',
              '→',
              [
                { key: 'W' },
                { text: ' acelera' },
                { key: 'S' },
                { text: ' freia' },
                { key: 'A' },
                { key: 'D' },
                { text: ' vira' },
              ],
              6.5,
            );
          }
          // 2) Logo depois, seguir a seta até a entrega
          else if (
            state.vehicle === 'car' &&
            shown.has('car-drive') &&
            !shown.has('follow-arrow') &&
            mission.delivered === 0
          ) {
            showTip('follow-arrow', '➤', [{ text: 'Siga a rota amarela até a entrega' }], 5.5, 'goal', 1.5);
          }
          // 3) Perto da 1ª entrega: parar dentro do círculo
          else if (mission.delivered === 0 && !shown.has('first-delivery-stop') && distNext < 58) {
            showTip(
              'first-delivery-stop',
              '◎',
              [{ text: 'Pare dentro do círculo para entregar' }],
              6.0,
              'goal',
              1.2,
            );
          }
          // 4) Esportivo: Shift = nitro e depois Espaço = freio de mão
          else if (state.vehicle === 'tuned' && !shown.has('tuned-nitro')) {
            showTip(
              'tuned-nitro',
              '⚡',
              [{ key: 'Shift' }, { text: ' ativa o nitro' }],
              5.5,
              'goal',
              1.0,
            );
          } else if (state.vehicle === 'tuned' && shown.has('tuned-nitro') && !shown.has('tuned-handbrake')) {
            showTip(
              'tuned-handbrake',
              '→',
              [{ key: 'Espaço' }, { text: ' freio de mão' }],
              5.5,
              'default',
              1.0,
            );
          }
          // 5) Helicóptero: controles e pousar devagar
          else if (state.vehicle === 'heli' && !shown.has('heli-controls')) {
            showTip(
              'heli-controls',
              '▲',
              [
                { key: 'Shift' },
                { key: 'Ctrl' },
                { text: ' sobe/desce' },
                { key: 'W' },
                { key: 'A' },
                { key: 'S' },
                { key: 'D' },
                { text: ' inclina' },
                { key: 'Q' },
                { key: 'E' },
                { text: ' gira' },
              ],
              7.2,
              'default',
              2.0,
            );
          } else if (
            state.vehicle === 'heli' &&
            shown.has('heli-controls') &&
            !shown.has('heli-land') &&
            (state.heightAboveGround > 5 || distNext < 160)
          ) {
            showTip('heli-land', '◎', [{ text: 'Pouse devagar no círculo' }], 6.0, 'goal', 1.4);
          }
          // 5b/6b) Aeronaves: depois dos controles, mostra como trocar a câmera (de cima mostra o alvo da caixa no A-29)
          else if (
            (state.vehicle === 'heli' || state.vehicle === 'a29') &&
            shown.has(state.vehicle === 'heli' ? 'heli-controls' : 'a29-controls') &&
            !shown.has('air-camera')
          ) {
            showTip(
              'air-camera',
              '◉',
              state.vehicle === 'a29'
                ? [{ key: 'C' }, { text: ' troca a câmera (atrás · de cima · cabine) — de cima mostra onde a caixa cai' }]
                : [{ key: 'C' }, { text: ' troca a câmera (atrás · de cima · cabine)' }],
              6.5,
              'default',
              1.2,
            );
          }
          // 6) A-29: controles de mira, acelerador e lançamento aéreo
          else if (state.vehicle === 'a29' && !shown.has('a29-controls')) {
            showTip(
              'a29-controls',
              '✈',
              [
                { key: 'Mouse' },
                { text: ' mira' },
                { key: 'Shift' },
                { text: ' aumenta a potência' },
                { key: 'Ctrl' },
                { text: ' reduz (na pista e no ar)' },
                { key: 'Espaço' },
                { text: ' solta a caixa' },
              ],
              7.8,
              'goal',
              2.2,
            );
          }
          // 7) Primeira vez que o carro para fora do círculo ou jogador a pé perto de veículo: E sai/entra
          else if (
            !shown.has('vehicle-exit') &&
            ((state.vehicle === 'foot' && Boolean(state.nearbyVehicleId)) ||
              ((state.vehicle === 'car' || state.vehicle === 'tuned') &&
                distanceMoved > 14 &&
                speedAbs < 1.2 &&
                playTime > 8 &&
                distNext > (nextDel?.radius ?? 12) + 8))
          ) {
            showTip(
              'vehicle-exit',
              '→',
              [{ key: 'E' }, { text: ' sair ou entrar no veículo' }],
              6.0,
              'default',
              1.4,
            );
          }
          // 8) 20 s parado sem objetivo: lembrete do próximo objetivo
          else if (!shown.has('idle-reminder') && idleSeconds >= 20) {
            const reminder = nextDel
              ? `Próxima entrega: ${nextDel.name}`
              : `Entre no ${VEHICLE_NAMES[mission.stage]} para continuar`;
            showTip('idle-reminder', '★', [{ text: reminder }], 6.5, 'goal', 1.4);
          }
        }
      }

      prevVehicle = state.vehicle;
      prevDelivered = mission.delivered;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeRestart();
      card.remove();
    },
  };
}
