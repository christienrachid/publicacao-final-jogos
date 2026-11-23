import {
  BLEND_NORMAL,
  Color,
  Entity,
  KEY_F,
  Mesh,
  MeshInstance,
  Quat,
  StandardMaterial,
  Vec3,
  createSphere,
} from 'playcanvas';
import type { FlightContext, FlightModule, FlightState } from './types';

const POOL_SIZE = 200;
const LIFETIME = 6.0;
const EMIT_INTERVAL = 0.032;
const EMIT_MIN_DIST_SQ = 2.4 * 2.4;
const TELEPORT_DIST_SQ = 80 * 80;
const MAX_EMITS_PER_FRAME = 3;
const TAIL_LOCAL = new Vec3(0, 0.05, 5.42);
const TAIL_BACK = new Vec3(0, 0, 1);

const smokeStateByFlight = new WeakMap<FlightState, boolean>();
const clearHandlerByFlight = new WeakMap<FlightState, () => void>();

/** Lê se a fumaça acrobática está ligada para o estado de voo informado. */
export function isSmokeActive(state: FlightState): boolean {
  return state.vehicle === 'a29' && (smokeStateByFlight.get(state) ?? false);
}

/** Limpa imediatamente todas as partículas ativas de fumaça (ex.: reinício de voo). */
export function clearSmoke(state: FlightState): void {
  clearHandlerByFlight.get(state)?.();
}

export function createSmoke({ app, plane, state }: FlightContext): FlightModule {
  const material = new StandardMaterial();
  material.diffuse = new Color(0.96, 0.97, 0.99);
  material.emissive = new Color(0.42, 0.43, 0.46);
  material.gloss = 0.05;
  material.opacity = 0.72;
  material.blendType = BLEND_NORMAL;
  material.depthWrite = false;
  material.update();

  const sharedMesh: Mesh | null = app.graphicsDevice
    ? createSphere(app.graphicsDevice, { radius: 0.5, latitudeBands: 6, longitudeBands: 8 })
    : null;

  const smokeRoot = new Entity('SmokeTrail', app);
  const hostParent = plane.root.parent ?? app.root;
  hostParent.addChild(smokeRoot);

  // Pool fixo de partículas e buffers numéricos (zero alocação por quadro)
  const entities: Entity[] = new Array(POOL_SIZE);
  const meshInstances: Array<MeshInstance | null> = new Array(POOL_SIZE);
  const ages = new Float32Array(POOL_SIZE);
  const posX = new Float32Array(POOL_SIZE);
  const posY = new Float32Array(POOL_SIZE);
  const posZ = new Float32Array(POOL_SIZE);
  const velX = new Float32Array(POOL_SIZE);
  const velY = new Float32Array(POOL_SIZE);
  const velZ = new Float32Array(POOL_SIZE);
  const scaleVar = new Float32Array(POOL_SIZE);

  ages.fill(-1);

  for (let i = 0; i < POOL_SIZE; i++) {
    const e = new Entity(`smoke_${i}`, app);
    let mi: MeshInstance | null = null;
    if (sharedMesh) {
      mi = new MeshInstance(sharedMesh, material);
      mi.setParameter('material_opacity', 0);
      e.addComponent('render', {
        meshInstances: [mi],
        castShadows: false,
        receiveShadows: false,
      });
    } else {
      e.addComponent('render', {
        type: 'sphere',
        material,
        castShadows: false,
        receiveShadows: false,
      });
      mi = e.render?.meshInstances?.[0] ?? null;
    }
    e.enabled = false;
    smokeRoot.addChild(e);
    entities[i] = e;
    meshInstances[i] = mi;
    // Pequena variação fixa de tamanho por slot (sem Math.random por quadro)
    scaleVar[i] = 0.9 + ((i * 37) % 21) * 0.01;
  }

  // Vetores reutilizáveis por quadro
  const planeRot = new Quat();
  const emitterPos = new Vec3();
  const lastEmitterPos = new Vec3();
  const backDir = new Vec3();

  let enabled = true;
  let hasLastEmitter = false;
  let emitTimer = 0;
  let cursor = 0;
  let seq = 0;
  let destroyed = false;

  smokeStateByFlight.set(state, enabled);
  clearHandlerByFlight.set(state, () => {
    for (let i = 0; i < POOL_SIZE; i++) {
      ages[i] = -1;
      entities[i].enabled = false;
    }
    hasLastEmitter = false;
    emitTimer = 0;
  });

  function spawnAt(x: number, y: number, z: number, bx: number, by: number, bz: number) {
    const idx = cursor;
    cursor = (cursor + 1) % POOL_SIZE;
    seq++;

    // Leve dispersão determinística para aspecto orgânico sem alocar nem oscilar
    const angle = seq * 2.3999632;
    const spread = 1.15;
    const jx = Math.cos(angle) * spread;
    const jz = Math.sin(angle) * spread;
    const jy = (((seq * 19) % 11) - 5) * 0.16;

    ages[idx] = 0;
    posX[idx] = x;
    posY[idx] = y;
    posZ[idx] = z;
    velX[idx] = bx * 9 + jx;
    velY[idx] = by * 9 + jy;
    velZ[idx] = bz * 9 + jz;

    const e = entities[idx];
    const s = 0.85 * scaleVar[idx];
    e.setPosition(x, y, z);
    e.setLocalScale(s, s, s);
    meshInstances[idx]?.setParameter('material_opacity', 0.45);
    e.enabled = true;
  }

  return {
    update(dt: number) {
      if (destroyed) return;

      if (state.vehicle === 'a29' && app.keyboard?.wasPressed(KEY_F)) {
        enabled = !enabled;
        smokeStateByFlight.set(state, enabled);
        emitTimer = EMIT_INTERVAL;
      }

      if (!Number.isFinite(dt) || dt <= 0) return;

      // Atualiza todas as partículas vivas
      const drag = Math.exp(-2.6 * dt);
      for (let i = 0; i < POOL_SIZE; i++) {
        const age = ages[i];
        if (age < 0) continue;

        const nextAge = age + dt;
        if (nextAge >= LIFETIME) {
          ages[i] = -1;
          entities[i].enabled = false;
          continue;
        }

        ages[i] = nextAge;
        velX[i] *= drag;
        velY[i] = velY[i] * drag + 0.32 * dt;
        velZ[i] *= drag;

        const nx = posX[i] + velX[i] * dt;
        const ny = posY[i] + velY[i] * dt;
        const nz = posZ[i] + velZ[i] * dt;
        posX[i] = nx;
        posY[i] = ny;
        posZ[i] = nz;

        const t = nextAge / LIFETIME;
        const fadeIn = t < 0.05 ? t / 0.05 : 1;
        const fadeOut = (1 - t) * (1 - t);
        const alpha = 0.72 * fadeIn * fadeOut;
        const size = (0.85 + 5.6 * Math.pow(t, 0.72)) * scaleVar[i];

        const e = entities[i];
        e.setPosition(nx, ny, nz);
        e.setLocalScale(size, size, size);
        meshInstances[i]?.setParameter('material_opacity', alpha);
      }

      // Emissão a partir da cauda somente no A-29 quando ligada e voando
      if (state.vehicle !== 'a29' || !enabled || state.crashed) {
        hasLastEmitter = false;
        emitTimer = 0;
        return;
      }

      planeRot.copy(plane.root.getRotation());
      planeRot.transformVector(TAIL_LOCAL, emitterPos);
      emitterPos.x += state.x;
      emitterPos.y += state.y;
      emitterPos.z += state.z;
      planeRot.transformVector(TAIL_BACK, backDir);

      if (hasLastEmitter && lastEmitterPos.distanceSq(emitterPos) > TELEPORT_DIST_SQ) {
        hasLastEmitter = false;
        emitTimer = 0;
      }

      emitTimer += dt;
      const distSq = hasLastEmitter ? lastEmitterPos.distanceSq(emitterPos) : EMIT_MIN_DIST_SQ;

      if (emitTimer >= EMIT_INTERVAL || distSq >= EMIT_MIN_DIST_SQ) {
        const steps = hasLastEmitter
          ? Math.min(MAX_EMITS_PER_FRAME, Math.max(1, Math.floor(Math.sqrt(distSq) / 2.6)))
          : 1;
        for (let s = 1; s <= steps; s++) {
          const f = s / steps;
          const sx = hasLastEmitter ? lastEmitterPos.x + (emitterPos.x - lastEmitterPos.x) * f : emitterPos.x;
          const sy = hasLastEmitter ? lastEmitterPos.y + (emitterPos.y - lastEmitterPos.y) * f : emitterPos.y;
          const sz = hasLastEmitter ? lastEmitterPos.z + (emitterPos.z - lastEmitterPos.z) * f : emitterPos.z;
          spawnAt(sx, sy, sz, backDir.x, backDir.y, backDir.z);
        }
        lastEmitterPos.copy(emitterPos);
        hasLastEmitter = true;
        emitTimer = 0;
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      smokeStateByFlight.delete(state);
      clearHandlerByFlight.delete(state);
      smokeRoot.destroy();
      sharedMesh?.destroy();
      material.destroy();
    },
  };
}
