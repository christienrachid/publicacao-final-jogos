import { Entity, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

/**
 * Modo dev (F8): câmera livre "noclip" para explorar o mapa.
 * - WASD anda para onde a câmera olha, Espaço/E sobe, Ctrl/Q desce, Shift = 4x mais rápido.
 * - Mouse olha em volta (clique na tela para travar o ponteiro); roda do mouse muda a velocidade base.
 * - T teleporta o veículo atual para o chão abaixo da câmera (callback do jogo).
 * Enquanto ativo, a simulação fica congelada (o jogo não chama os módulos de voo/câmera).
 */
export interface DevMode {
  readonly active: boolean;
  toggle(from: Entity): boolean;
  update(dt: number): void;
  destroy(): void;
}

export interface DevModeOptions {
  app: AppBase;
  camera: Entity;
  uiRoot: HTMLElement;
  canvas: HTMLCanvasElement | null;
  /** Teleporta o veículo para (x, z) no chão; devolve uma mensagem curta para o rótulo. */
  teleport(x: number, z: number, headingDeg: number): string;
}

const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight']);

export function createDevMode(opts: DevModeOptions): DevMode {
  const { camera, uiRoot, canvas } = opts;
  let active = false;
  let yaw = 0;
  let pitch = -20;
  let baseSpeed = 40;
  let note = '';
  let noteTimer = 0;
  const pos = new Vec3();
  const fwd = new Vec3();
  const right = new Vec3();
  const pressed = new Set<string>();

  const label = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (label) {
    label.className = 'dev-mode-label';
    label.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);top:120px;z-index:9999;pointer-events:none;padding:8px 12px;' +
      'background:rgba(20,20,20,.82);color:#f2c21a;font:600 12px/1.5 ui-monospace,Consolas,monospace;' +
      'border-left:4px solid #f2c21a;white-space:pre;max-width:calc(100vw - 32px);';
    label.hidden = true;
    (document.body ?? uiRoot).appendChild(label);
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!active) return;
    if (KEYS.has(e.code)) {
      pressed.add(e.code);
      e.preventDefault();
      e.stopPropagation();
    } else if (e.code === 'KeyT' && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      note = opts.teleport(pos.x, pos.z, -yaw);
      noteTimer = 3;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    pressed.delete(e.code);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!active) return;
    const locked = typeof document !== 'undefined' && document.pointerLockElement === canvas;
    if (!locked && (e.buttons & 2) === 0) return;
    yaw -= e.movementX * 0.15;
    pitch = Math.max(-89, Math.min(89, pitch - e.movementY * 0.15));
  };
  const onMouseDown = () => {
    if (active && canvas && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  };
  const onWheel = (e: WheelEvent) => {
    if (!active) return;
    baseSpeed = Math.max(5, Math.min(400, baseSpeed * (e.deltaY > 0 ? 0.8 : 1.25)));
  };
  const onContextMenu = (e: MouseEvent) => {
    if (active) e.preventDefault();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: true });
    canvas?.addEventListener('mousedown', onMouseDown);
    canvas?.addEventListener('contextmenu', onContextMenu);
  }

  function render() {
    if (!label) return;
    label.textContent =
      `MODO DEV (F8 sai)  x ${pos.x.toFixed(0)}  y ${pos.y.toFixed(0)}  z ${pos.z.toFixed(0)}  vel ${baseSpeed.toFixed(0)} m/s\n` +
      'WASD anda · Espaço/E sobe · Ctrl/Q desce · Shift rápido · roda = velocidade · clique = mouse · T = trazer o veículo' +
      (noteTimer > 0 && note ? `\n${note}` : '');
  }

  return {
    get active() {
      return active;
    },
    toggle(from: Entity) {
      active = !active;
      pressed.clear();
      if (active) {
        pos.copy(from.getPosition());
        // ângulos a partir da direção para frente (a decomposição de Euler da câmera é ambígua)
        const f = from.forward;
        yaw = (Math.atan2(-f.x, -f.z) * 180) / Math.PI;
        pitch = (Math.asin(Math.max(-1, Math.min(1, f.y))) * 180) / Math.PI;
      } else if (typeof document !== 'undefined' && document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }
      if (label) label.hidden = !active;
      render();
      return active;
    },
    update(dt: number) {
      if (!active) return;
      const fast = pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? 4 : 1;
      const v = baseSpeed * fast * dt;
      const yr = (yaw * Math.PI) / 180;
      const pr = (pitch * Math.PI) / 180;
      fwd.set(-Math.sin(yr) * Math.cos(pr), Math.sin(pr), -Math.cos(yr) * Math.cos(pr));
      right.set(Math.cos(yr), 0, -Math.sin(yr));
      const f = (pressed.has('KeyW') ? 1 : 0) - (pressed.has('KeyS') ? 1 : 0);
      const s = (pressed.has('KeyD') ? 1 : 0) - (pressed.has('KeyA') ? 1 : 0);
      const u =
        (pressed.has('Space') || pressed.has('KeyE') ? 1 : 0) -
        (pressed.has('ControlLeft') || pressed.has('ControlRight') || pressed.has('KeyQ') ? 1 : 0);
      pos.x += (fwd.x * f + right.x * s) * v;
      pos.y += (fwd.y * f + u) * v;
      pos.z += (fwd.z * f + right.z * s) * v;
      camera.setPosition(pos);
      camera.setEulerAngles(pitch, yaw, 0);
      if (noteTimer > 0) noteTimer -= dt;
      render();
    },
    destroy() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('keyup', onKeyUp, true);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('wheel', onWheel);
        canvas?.removeEventListener('mousedown', onMouseDown);
        canvas?.removeEventListener('contextmenu', onContextMenu);
      }
      label?.remove();
    },
  };
}
