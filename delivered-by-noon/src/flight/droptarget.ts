import { Color, Entity, StandardMaterial } from 'playcanvas';
import type { FlightContext, FlightModule } from './types';

/**
 * Ponto onde a encomenda solta agora pelo A-29 cai no chão: mesma balística de mission.ts
 * (sai 0,8 m abaixo do avião com a velocidade dele, gravidade 9,81, toca o chão a 0,45 m).
 */
export function predictDropImpact(
  state: { x: number; y: number; z: number; heading: number; speed: number; verticalSpeed: number },
  groundAt: (x: number, z: number) => number,
  out: { x: number; y: number; z: number; t: number },
): boolean {
  const h = (state.heading * Math.PI) / 180;
  const horizontal = Math.sqrt(Math.max(0, state.speed ** 2 - state.verticalSpeed ** 2));
  let x = state.x, y = state.y - 0.8, z = state.z, vy = state.verticalSpeed;
  const vx = Math.sin(h) * horizontal, vz = -Math.cos(h) * horizontal;
  const step = 1 / 30;
  for (let t = 0; t < 40; t += step) {
    x += vx * step; z += vz * step; y += vy * step - 4.905 * step * step; vy -= 9.81 * step;
    const g = groundAt(x, z);
    if (y <= g + 0.45) {
      out.x = x; out.y = g; out.z = z; out.t = t;
      return true;
    }
  }
  return false;
}

/** Alvo no chão (anel + cruz) visível só no A-29, carregando encomenda, na câmera de cima. Verde = cai dentro de uma entrega. */
export function createDropTarget(ctx: FlightContext): FlightModule {
  const { app, state, mission, world } = ctx;
  const root = new Entity('AlvoDaEncomenda', app);
  const matHit = new StandardMaterial();
  const matMiss = new StandardMaterial();
  for (const [m, c] of [[matHit, new Color(0.2, 0.95, 0.35)], [matMiss, new Color(0.98, 0.78, 0.1)]] as const) {
    m.diffuse = new Color(0, 0, 0);
    m.emissive = c;
    m.opacity = 0.85;
    m.blendType = 2; // BLEND_NORMAL
    m.depthWrite = false;
    m.useLighting = false;
    m.update();
  }
  const parts: Entity[] = [];
  const add = (sx: number, sz: number, px: number, pz: number, rotY = 0) => {
    const e = new Entity('AlvoParte', app);
    if (app.systems?.render) e.addComponent('render', { type: 'box', material: matMiss, castShadows: false, receiveShadows: false });
    e.setLocalScale(sx, 0.08, sz);
    e.setLocalPosition(px, 0, pz);
    e.setLocalEulerAngles(0, rotY, 0);
    root.addChild(e);
    parts.push(e);
  };
  // anel de 12 segmentos (raio 9 m) + cruz central
  const R = 9;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(4.9, 0.9, Math.cos(a) * R, Math.sin(a) * R, (-a * 180) / Math.PI + 90);
  }
  add(6, 0.8, 0, 0);
  add(0.8, 6, 0, 0);
  root.enabled = false;
  (ctx.plane.root.parent ?? app.root).addChild(root);
  const hit = { x: 0, y: 0, z: 0, t: 0 };
  let lastHit: boolean | null = null;

  return {
    update() {
      const show =
        state.vehicle === 'a29' && mission?.carrying === 'a29' && mission.status === 'playing' && state.camera === 'top' && !state.crashed;
      if (!show || !predictDropImpact(state, world.groundAt, hit)) {
        root.enabled = false;
        return;
      }
      root.enabled = true;
      root.setPosition(hit.x, hit.y + 0.6, hit.z);
      const inside = !!mission?.deliveries.some(
        (p) => p.stage === 'a29' && !p.delivered && Math.hypot(p.x - hit.x, p.z - hit.z) <= p.radius,
      );
      if (inside !== lastHit) {
        lastHit = inside;
        for (const e of parts) {
          const mi = e.render?.meshInstances?.[0];
          if (mi) mi.material = inside ? matHit : matMiss;
        }
      }
    },
    destroy() {
      root.destroy();
      matHit.destroy();
      matMiss.destroy();
    },
  };
}
