import {
  BLEND_ADDITIVE,
  BLEND_NORMAL,
  Color,
  Entity,
  KEY_SPACE,
  Mesh,
  MeshInstance,
  StandardMaterial,
  Vec3,
  createSphere,
} from 'playcanvas';
import { isTunedNitroActive } from './hud';
import type { DeliveryPoint, FlightContext, FlightModule } from './types';
import { getRuntime } from './ui/settings';
import { UNIACADEMIA } from './world-data';

const POOL_SIZE = 48;
const DEG_TO_RAD = Math.PI / 180;

function makeFxMat(
  r: number,
  g: number,
  b: number,
  additive: boolean,
  emissiveIntensity = 1.8,
  opacity = 0.85,
): StandardMaterial {
  const m = new StandardMaterial();
  m.useLighting = false;
  m.diffuse = new Color(additive ? 0 : r, additive ? 0 : g, additive ? 0 : b);
  m.emissive = new Color(r, g, b);
  m.emissiveIntensity = emissiveIntensity;
  m.opacity = opacity;
  m.blendType = additive ? BLEND_ADDITIVE : BLEND_NORMAL;
  m.depthWrite = false;
  m.update();
  return m;
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

function shortestAngleDiff(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

/**
 * Módulo unificado de efeitos visuais ("game feel") com pool fixo de 48 partículas
 * (zero alocação por quadro, 0 draw calls em repouso) + linhas de velocidade em CSS:
 * - Faíscas/poeira ao derrapar com freio de mão
 * - Brilho e faíscas no escapamento durante o nitro
 * - Linhas de velocidade na borda da tela (> ~40 m/s, respeitando "reduzir movimento")
 * - Poeira radial no pouso do helicóptero
 * - Rastros nas pontas das asas do A-29 em curvas fortes
 * - Explosão de confete colorido ao concluir entregas
 * - Fogos de artifício sobre a UniAcademia na vitória
 */
export function createEfeitos(ctx: FlightContext, uiRoot?: HTMLElement | null): FlightModule {
  const { app, plane, state } = ctx;
  const ui = uiRoot ?? (typeof document !== 'undefined' ? document.getElementById('ui') : null);

  // Materiais leves compartilhados (sem luzes dinâmicas, sem sombras)
  const matDust = makeFxMat(0.76, 0.72, 0.64, false, 0.28, 0.62);
  const matSpark = makeFxMat(1.0, 0.68, 0.18, true, 2.8, 0.95);
  const matNitro = makeFxMat(0.28, 0.9, 1.0, true, 3.0, 0.92);
  const matVapor = makeFxMat(0.92, 0.96, 1.0, false, 0.45, 0.55);
  const matConfettiGold = makeFxMat(1.0, 0.84, 0.2, true, 2.4, 0.95);
  const matConfettiPink = makeFxMat(1.0, 0.3, 0.72, true, 2.4, 0.95);
  const matConfettiLime = makeFxMat(0.32, 0.96, 0.58, true, 2.4, 0.95);
  const allMaterials = [
    matDust,
    matSpark,
    matNitro,
    matVapor,
    matConfettiGold,
    matConfettiPink,
    matConfettiLime,
  ];
  const celebratoryMats = [matConfettiGold, matNitro, matConfettiPink, matConfettiLime, matSpark];

  const sharedMesh: Mesh | null = app.graphicsDevice
    ? createSphere(app.graphicsDevice, { radius: 0.5, latitudeBands: 4, longitudeBands: 6 })
    : null;

  const fxRoot = new Entity('GameFeelFx', app);
  const hostParent = plane.root.parent ?? app.root;
  hostParent.addChild(fxRoot);

  // Pool fixo de partículas e buffers tipados (zero alocação em update)
  const entities: Entity[] = new Array(POOL_SIZE);
  const mis: Array<MeshInstance | null> = new Array(POOL_SIZE);
  const ages = new Float32Array(POOL_SIZE);
  const lifetimes = new Float32Array(POOL_SIZE);
  const posX = new Float32Array(POOL_SIZE);
  const posY = new Float32Array(POOL_SIZE);
  const posZ = new Float32Array(POOL_SIZE);
  const velX = new Float32Array(POOL_SIZE);
  const velY = new Float32Array(POOL_SIZE);
  const velZ = new Float32Array(POOL_SIZE);
  const gravity = new Float32Array(POOL_SIZE);
  const dragRate = new Float32Array(POOL_SIZE);
  const startSize = new Float32Array(POOL_SIZE);
  const endSize = new Float32Array(POOL_SIZE);
  const baseOpacity = new Float32Array(POOL_SIZE);
  ages.fill(-1);

  for (let i = 0; i < POOL_SIZE; i++) {
    const e = new Entity(`fx_${i}`, app);
    let mi: MeshInstance | null = null;
    if (sharedMesh) {
      mi = new MeshInstance(sharedMesh, matDust);
      mi.cull = true;
      e.addComponent('render', {
        meshInstances: [mi],
        castShadows: false,
        receiveShadows: false,
      });
    } else {
      e.addComponent('render', {
        type: 'sphere',
        material: matDust,
        castShadows: false,
        receiveShadows: false,
      });
      mi = e.render?.meshInstances?.[0] ?? null;
      if (mi) mi.cull = true;
    }
    e.enabled = false;
    fxRoot.addChild(e);
    entities[i] = e;
    mis[i] = mi;
  }

  // Camada 2D de linhas de velocidade na borda da tela (0 draw calls WebGL)
  let speedLinesEl: HTMLDivElement | null = null;
  if (ui && typeof document !== 'undefined') {
    speedLinesEl = document.createElement('div');
    speedLinesEl.className = 'fx-speed-lines';
    speedLinesEl.hidden = true;
    ui.appendChild(speedLinesEl);
  }

  // Vetores reutilizáveis
  const tmpPos = new Vec3();
  const prevDeliveredIds = new Set<string>();

  let cursor = 0;
  let seq = 0;
  let driftTimer = 0;
  let nitroTimer = 0;
  let heliDustTimer = 0;
  let wingtipTimer = 0;
  let fireworkTimer = 0;
  let prevHeading = state.heading;
  let prevHeliHeight = state.heightAboveGround;
  let lastSpeedOpacity = -1;
  let destroyed = false;

  function hashSigned(n: number): number {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  }

  function spawnParticle(
    mat: StandardMaterial,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    s0: number,
    s1: number,
    grav: number,
    drag: number,
    opacity: number,
  ) {
    const idx = cursor;
    cursor = (cursor + 1) % POOL_SIZE;
    seq++;

    ages[idx] = 0;
    lifetimes[idx] = life;
    posX[idx] = x;
    posY[idx] = y;
    posZ[idx] = z;
    velX[idx] = vx;
    velY[idx] = vy;
    velZ[idx] = vz;
    gravity[idx] = grav;
    dragRate[idx] = drag;
    startSize[idx] = s0;
    endSize[idx] = s1;
    baseOpacity[idx] = opacity;

    const mi = mis[idx];
    if (mi) {
      if (mi.material !== mat) mi.material = mat;
      mi.setParameter('material_opacity', opacity);
    }
    const e = entities[idx];
    e.setPosition(x, y, z);
    e.setLocalScale(s0, s0, s0);
    e.enabled = true;
  }

  function spawnConfettiBurst(x: number, y: number, z: number, count: number, spreadSpeed: number, liftSpeed: number) {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + hashSigned(seq + i * 3) * 0.35;
      const spd = spreadSpeed * (0.45 + Math.abs(hashSigned(seq + i * 7)) * 0.7);
      const vy = liftSpeed * (0.65 + Math.abs(hashSigned(seq + i * 11)) * 0.65);
      const mat = celebratoryMats[(i + seq) % celebratoryMats.length];
      spawnParticle(
        mat,
        x + Math.cos(ang) * 0.8,
        y + 1.4,
        z + Math.sin(ang) * 0.8,
        Math.cos(ang) * spd,
        vy,
        Math.sin(ang) * spd,
        1.45 + Math.abs(hashSigned(seq + i)) * 0.55,
        0.55,
        0.22,
        11.5,
        0.9,
        0.95,
      );
    }
  }

  function spawnFireworkBurst(cx: number, cy: number, cz: number) {
    const matA = celebratoryMats[seq % celebratoryMats.length];
    const matB = celebratoryMats[(seq + 2) % celebratoryMats.length];
    const count = 18;
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i + seq * 0.7;
      const spd = 22 + Math.abs(hashSigned(seq + i * 5)) * 14;
      const vx = Math.sin(phi) * Math.cos(theta) * spd;
      const vy = Math.cos(phi) * spd + 4;
      const vz = Math.sin(phi) * Math.sin(theta) * spd;
      spawnParticle(
        i % 2 === 0 ? matA : matB,
        cx,
        cy,
        cz,
        vx,
        vy,
        vz,
        1.55 + Math.abs(hashSigned(i + seq)) * 0.45,
        1.4,
        0.35,
        9.8,
        1.1,
        0.95,
      );
    }
  }

  function updateSpeedLines(playing: boolean, reduceMotion: boolean, nitroOn: boolean) {
    if (!speedLinesEl) return;
    if (!playing || reduceMotion || state.crashed) {
      if (lastSpeedOpacity !== 0) {
        lastSpeedOpacity = 0;
        speedLinesEl.hidden = true;
      }
      return;
    }
    const speedAbs = Math.abs(state.speed);
    const threshold = nitroOn ? 28 : 40;
    const raw = speedAbs > threshold ? clamp((speedAbs - threshold) / 48, 0, 1) * (nitroOn ? 0.92 : 0.7) : 0;
    const quantized = Math.round(raw * 25) / 25;
    if (quantized !== lastSpeedOpacity) {
      lastSpeedOpacity = quantized;
      speedLinesEl.hidden = quantized <= 0.01;
      if (quantized > 0.01) {
        speedLinesEl.style.opacity = quantized.toFixed(2);
        speedLinesEl.classList.toggle('fx-speed-lines--nitro', nitroOn);
      }
    }
  }

  return {
    update(dt: number) {
      if (destroyed || !Number.isFinite(dt) || dt <= 0) return;

      const rt = getRuntime(state);
      const mission = ctx.mission;
      const playing = rt.mode === 'playing';
      const isWon = rt.mode === 'ended' && mission?.status === 'won';
      const nitroOn = playing && isTunedNitroActive(state);

      // 1) Atualiza partículas ativas no pool
      for (let i = 0; i < POOL_SIZE; i++) {
        const age = ages[i];
        if (age < 0) continue;
        const nextAge = age + dt;
        const life = lifetimes[i];
        if (nextAge >= life) {
          ages[i] = -1;
          entities[i].enabled = false;
          continue;
        }
        ages[i] = nextAge;
        const drag = Math.exp(-dragRate[i] * dt);
        velX[i] *= drag;
        velY[i] = velY[i] * drag - gravity[i] * dt;
        velZ[i] *= drag;
        posX[i] += velX[i] * dt;
        posY[i] += velY[i] * dt;
        posZ[i] += velZ[i] * dt;

        const t = nextAge / life;
        const s = startSize[i] + (endSize[i] - startSize[i]) * t;
        const alpha = baseOpacity[i] * (1 - t) * (1 - t);
        const e = entities[i];
        e.setPosition(posX[i], posY[i], posZ[i]);
        e.setLocalScale(s, s, s);
        mis[i]?.setParameter('material_opacity', alpha);
      }

      // 2) Linhas de velocidade na borda da tela (CSS, respeita "reduzir movimento")
      updateSpeedLines(playing, rt.settings.reduceMotion, nitroOn);

      // 3) Fogos de artifício sobre a UniAcademia na tela de vitória
      if (isWon) {
        fireworkTimer -= dt;
        if (fireworkTimer <= 0) {
          fireworkTimer = 0.85;
          const ox = hashSigned(seq + 1) * 42;
          const oz = hashSigned(seq + 3) * 42;
          const oy = 38 + Math.abs(hashSigned(seq + 5)) * 38;
          spawnFireworkBurst(UNIACADEMIA.x + ox, UNIACADEMIA.y + oy, UNIACADEMIA.z + oz);
        }
        return;
      }

      if (!playing) return;

      // 4) Explosão de confete colorido ao concluir entrega
      if (mission && mission.status === 'playing') {
        let newlyDelivered: DeliveryPoint | null = null;
        let newlyCount = 0;
        for (let i = 0; i < mission.deliveries.length; i++) {
          const d = mission.deliveries[i];
          if (d.delivered) {
            if (!prevDeliveredIds.has(d.id)) {
              prevDeliveredIds.add(d.id);
              newlyDelivered = d;
              newlyCount++;
            }
          } else {
            prevDeliveredIds.delete(d.id);
          }
        }
        if (newlyCount === 1 && newlyDelivered) {
          spawnConfettiBurst(newlyDelivered.x, newlyDelivered.y, newlyDelivered.z, 22, 11, 14);
        }
      }

      const headingRad = state.heading * DEG_TO_RAD;
      const fwdX = Math.sin(headingRad);
      const fwdZ = -Math.cos(headingRad);
      const rightX = Math.cos(headingRad);
      const rightZ = Math.sin(headingRad);
      const speedAbs = Math.abs(state.speed);
      const yawRate = dt > 0.0005 ? Math.abs(shortestAngleDiff(prevHeading, state.heading)) / dt : 0;

      // 5) Faíscas e poeira ao derrapar com o freio de mão nos carros
      const isCar = state.vehicle === 'car' || state.vehicle === 'tuned';
      const handbrake = Boolean(app.keyboard?.isPressed(KEY_SPACE));
      if (isCar && handbrake && speedAbs > 8 && state.heightAboveGround < 0.8 && !state.crashed) {
        driftTimer += dt;
        if (driftTimer >= 0.045) {
          driftTimer = 0;
          for (const side of [-1, 1] as const) {
            const wx = state.x - fwdX * 1.35 + rightX * side * 0.78;
            const wz = state.z - fwdZ * 1.35 + rightZ * side * 0.78;
            const wy = state.y + 0.14;
            // Poeira dos pneus traseiros
            spawnParticle(
              matDust,
              wx,
              wy,
              wz,
              -fwdX * 3 + rightX * side * 1.4,
              1.4 + Math.abs(hashSigned(seq)) * 0.8,
              -fwdZ * 3 + rightZ * side * 1.4,
              0.48,
              0.38,
              1.35,
              -0.4,
              2.2,
              0.55,
            );
            // Faíscas quentes em velocidade alta / carro tunado
            if (state.vehicle === 'tuned' || speedAbs > 16) {
              spawnParticle(
                matSpark,
                wx,
                wy,
                wz,
                -fwdX * (6 + speedAbs * 0.2) + hashSigned(seq + side) * 2.5,
                2.2 + Math.abs(hashSigned(seq + 2)) * 2.4,
                -fwdZ * (6 + speedAbs * 0.2) + hashSigned(seq + 4) * 2.5,
                0.32,
                0.18,
                0.05,
                14,
                1.2,
                0.95,
              );
            }
          }
        }
      } else {
        driftTimer = 0.045;
      }

      // 6) Faíscas e brilho no escapamento durante o nitro do Coupé Tunado
      if (nitroOn && !state.crashed) {
        nitroTimer += dt;
        if (nitroTimer >= 0.036) {
          nitroTimer = 0;
          const side = seq % 2 === 0 ? -1 : 1;
          const ex = state.x - fwdX * 2.35 + rightX * side * 0.46;
          const ez = state.z - fwdZ * 2.35 + rightZ * side * 0.46;
          const ey = state.y + 0.26;
          spawnParticle(
            seq % 3 === 0 ? matSpark : matNitro,
            ex,
            ey,
            ez,
            -fwdX * (12 + speedAbs * 0.25) + hashSigned(seq) * 1.1,
            0.5 + hashSigned(seq + 1) * 0.6,
            -fwdZ * (12 + speedAbs * 0.25) + hashSigned(seq + 2) * 1.1,
            0.24,
            0.34,
            0.08,
            1.5,
            2.4,
            0.92,
          );
        }
      } else {
        nitroTimer = 0.036;
      }

      // 7) Poeira radial no pouso do helicóptero (descida próxima ao chão ou toque no solo)
      if (state.vehicle === 'heli' && !state.crashed) {
        const nearGround = state.heightAboveGround < 4.5;
        const touchdown = prevHeliHeight > 0.65 && state.heightAboveGround <= 0.45;
        if (touchdown) {
          const gy = state.y - state.heightAboveGround + 0.25;
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2;
            spawnParticle(
              matDust,
              state.x + Math.cos(ang) * 1.8,
              gy,
              state.z + Math.sin(ang) * 1.8,
              Math.cos(ang) * 8.5,
              1.6,
              Math.sin(ang) * 8.5,
              0.78,
              0.75,
              2.6,
              -0.3,
              2.4,
              0.58,
            );
          }
        } else if (nearGround && (state.verticalSpeed < -0.5 || state.throttle > 0.35)) {
          heliDustTimer += dt;
          if (heliDustTimer >= 0.09) {
            heliDustTimer = 0;
            const gy = state.y - state.heightAboveGround + 0.22;
            const ang = seq * 2.39996;
            spawnParticle(
              matDust,
              state.x + Math.cos(ang) * 1.6,
              gy,
              state.z + Math.sin(ang) * 1.6,
              Math.cos(ang) * 6.5,
              0.9,
              Math.sin(ang) * 6.5,
              0.62,
              0.6,
              2.1,
              -0.25,
              2.3,
              0.46,
            );
          }
        }
      }

      // 8) Rastros nas pontas das asas do A-29 em curvas fortes (vórtices de ponta de asa)
      if (
        state.vehicle === 'a29' &&
        !state.crashed &&
        speedAbs > 45 &&
        (Math.abs(state.roll) > 30 || yawRate > 24)
      ) {
        wingtipTimer += dt;
        if (wingtipTimer >= 0.045) {
          wingtipTimer = 0;
          for (let w = 0; w < 2; w++) {
            const tip = plane.wingTips[w];
            if (!tip) continue;
            tmpPos.copy(tip.getPosition());
            spawnParticle(
              matVapor,
              tmpPos.x,
              tmpPos.y,
              tmpPos.z,
              -fwdX * 3.5,
              0.15,
              -fwdZ * 3.5,
              0.55,
              0.24,
              0.95,
              -0.1,
              1.8,
              0.48,
            );
          }
        }
      } else {
        wingtipTimer = 0.045;
      }

      prevHeading = state.heading;
      prevHeliHeight = state.heightAboveGround;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      fxRoot.destroy();
      sharedMesh?.destroy();
      for (const m of allMaterials) m.destroy();
      speedLinesEl?.remove();
      speedLinesEl = null;
    },
  };
}
