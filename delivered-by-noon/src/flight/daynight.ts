import {
  ADDRESS_CLAMP_TO_EDGE,
  Color,
  type Entity,
  PIXELFORMAT_SRGBA8,
  StandardMaterial,
  Texture,
} from 'playcanvas';
import type { FlightContext, FlightModule } from './types';

interface SkyKeyframe {
  hour: number;
  zenith: [number, number, number];
  upper: [number, number, number];
  mid: [number, number, number];
  horizon: [number, number, number];
  below: [number, number, number];
  nadir: [number, number, number];
  sunColor: [number, number, number];
  sunIntensity: number;
  ambient: [number, number, number];
  fog: [number, number, number];
  night: number;
}

// Delivered by Noon: manhã clara e ensolarada de 06:00 até 12:00 (sem noite)
const KEYFRAMES: readonly SkyKeyframe[] = [
  {
    hour: 6.0,
    zenith: [0.18, 0.44, 0.78],
    upper: [0.36, 0.62, 0.88],
    mid: [0.68, 0.78, 0.88],
    horizon: [0.97, 0.85, 0.72],
    below: [0.76, 0.74, 0.72],
    nadir: [0.28, 0.36, 0.48],
    sunColor: [1.0, 0.88, 0.72],
    sunIntensity: 1.55,
    ambient: [0.56, 0.56, 0.62],
    fog: [0.89, 0.83, 0.76],
    night: 0.0,
  },
  {
    hour: 7.5,
    zenith: [0.14, 0.44, 0.8],
    upper: [0.3, 0.6, 0.9],
    mid: [0.56, 0.78, 0.94],
    horizon: [0.84, 0.9, 0.94],
    below: [0.66, 0.75, 0.82],
    nadir: [0.25, 0.36, 0.5],
    sunColor: [1.0, 0.95, 0.85],
    sunIntensity: 1.82,
    ambient: [0.6, 0.63, 0.69],
    fog: [0.81, 0.88, 0.93],
    night: 0.0,
  },
  {
    hour: 9.5,
    zenith: [0.11, 0.4, 0.8],
    upper: [0.26, 0.59, 0.92],
    mid: [0.52, 0.8, 0.96],
    horizon: [0.78, 0.9, 0.97],
    below: [0.6, 0.74, 0.83],
    nadir: [0.23, 0.35, 0.5],
    sunColor: [1.0, 0.97, 0.91],
    sunIntensity: 1.98,
    ambient: [0.63, 0.67, 0.73],
    fog: [0.76, 0.87, 0.95],
    night: 0.0,
  },
  {
    hour: 11.0,
    zenith: [0.1, 0.38, 0.78],
    upper: [0.24, 0.57, 0.91],
    mid: [0.5, 0.79, 0.97],
    horizon: [0.76, 0.9, 0.98],
    below: [0.58, 0.73, 0.83],
    nadir: [0.22, 0.34, 0.49],
    sunColor: [1.0, 0.98, 0.94],
    sunIntensity: 2.08,
    ambient: [0.65, 0.69, 0.75],
    fog: [0.75, 0.87, 0.95],
    night: 0.0,
  },
  {
    hour: 12.0,
    zenith: [0.09, 0.36, 0.76],
    upper: [0.23, 0.56, 0.9],
    mid: [0.49, 0.78, 0.97],
    horizon: [0.75, 0.89, 0.98],
    below: [0.57, 0.72, 0.82],
    nadir: [0.22, 0.34, 0.48],
    sunColor: [1.0, 0.99, 0.95],
    sunIntensity: 2.15,
    ambient: [0.66, 0.7, 0.76],
    fog: [0.74, 0.87, 0.95],
    night: 0.0,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
  out: [number, number, number],
): [number, number, number] {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

function rgbCss(c: [number, number, number]): string {
  const r = Math.round(Math.max(0, Math.min(1, c[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, c[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, c[2])) * 255);
  return `rgb(${r},${g},${b})`;
}

function collectMaterials(entity: Entity, out: StandardMaterial[]): void {
  const pushMeshMats = (instances: ReadonlyArray<{ material?: unknown }> | null | undefined) => {
    if (!instances) return;
    for (let i = 0; i < instances.length; i++) {
      const m = instances[i]?.material;
      if (m instanceof StandardMaterial && !out.includes(m)) out.push(m);
    }
  };
  pushMeshMats(entity.render?.meshInstances);
  pushMeshMats(entity.model?.meshInstances);
  for (let i = 0; i < entity.children.length; i++) {
    collectMaterials(entity.children[i] as Entity, out);
  }
}

function collectByName(root: Entity, exactName: string, out: Entity[]): void {
  if (root.name === exactName) out.push(root);
  for (let i = 0; i < root.children.length; i++) {
    collectByName(root.children[i] as Entity, exactName, out);
  }
}

function findCityMaterials(root: Entity, out: StandardMaterial[]): void {
  const stack: Entity[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const lower = cur.name.toLowerCase();
    if (lower === 'city' || lower.includes('mundo-cidade')) {
      collectMaterials(cur, out);
    }
    for (let i = cur.children.length - 1; i >= 0; i--) {
      stack.push(cur.children[i] as Entity);
    }
  }
}

export function sampleDayNight(clockMinutes: number) {
  const clampedMin = Math.max(360, Math.min(720, Number.isFinite(clockMinutes) ? clockMinutes : 360));
  const hour = clampedMin / 60;

  let lo = KEYFRAMES[0];
  let hi = KEYFRAMES[KEYFRAMES.length - 1];
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (hour >= KEYFRAMES[i].hour && hour <= KEYFRAMES[i + 1].hour) {
      lo = KEYFRAMES[i];
      hi = KEYFRAMES[i + 1];
      break;
    }
  }
  const span = Math.max(0.001, hi.hour - lo.hour);
  const rawT = Math.max(0, Math.min(1, (hour - lo.hour) / span));
  const t = rawT * rawT * (3 - 2 * rawT);

  const zenith: [number, number, number] = [0, 0, 0];
  const upper: [number, number, number] = [0, 0, 0];
  const mid: [number, number, number] = [0, 0, 0];
  const horizon: [number, number, number] = [0, 0, 0];
  const below: [number, number, number] = [0, 0, 0];
  const nadir: [number, number, number] = [0, 0, 0];
  const sunColor: [number, number, number] = [0, 0, 0];
  const ambient: [number, number, number] = [0, 0, 0];
  const fog: [number, number, number] = [0, 0, 0];

  lerpRgb(lo.zenith, hi.zenith, t, zenith);
  lerpRgb(lo.upper, hi.upper, t, upper);
  lerpRgb(lo.mid, hi.mid, t, mid);
  lerpRgb(lo.horizon, hi.horizon, t, horizon);
  lerpRgb(lo.below, hi.below, t, below);
  lerpRgb(lo.nadir, hi.nadir, t, nadir);
  lerpRgb(lo.sunColor, hi.sunColor, t, sunColor);
  lerpRgb(lo.ambient, hi.ambient, t, ambient);
  lerpRgb(lo.fog, hi.fog, t, fog);

  return {
    hour,
    zenith,
    upper,
    mid,
    horizon,
    below,
    nadir,
    sunColor,
    sunIntensity: lerp(lo.sunIntensity, hi.sunIntensity, t),
    ambient,
    fog,
    night: 0,
  };
}

/**
 * Ciclo diurno da manhã (06:00 → 12:00) dirigido por `ctx.mission.clockMinutes`:
 * eleva o sol da manhã até o meio-dia em céu claro e mantém emissivos noturnos/faróis desligados.
 */
export function createDayNight(ctx: FlightContext, sun: Entity): FlightModule {
  const { app, world, camera } = ctx;

  const prevSunColor = sun.light ? sun.light.color.clone() : null;
  const prevSunIntensity = sun.light ? sun.light.intensity : 1.7;
  const prevSunEuler = sun.getEulerAngles().clone();

  // Textura de degradê do céu atualizada dinamicamente (4x64: custo quase zero)
  let skyCanvas: HTMLCanvasElement | null = null;
  let sky2d: CanvasRenderingContext2D | null = null;
  let skyTex: Texture | null = null;
  const skyMats: StandardMaterial[] = [];
  const savedSkyMaps = new Map<StandardMaterial, Texture | null>();
  const savedSkyEmissive = new Map<StandardMaterial, Color>();

  if (typeof document !== 'undefined' && app.graphicsDevice) {
    skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 64;
    sky2d = skyCanvas.getContext('2d');
    if (sky2d) {
      skyTex = new Texture(app.graphicsDevice, {
        width: 4,
        height: 64,
        format: PIXELFORMAT_SRGBA8,
        mipmaps: false,
        addressU: ADDRESS_CLAMP_TO_EDGE,
        addressV: ADDRESS_CLAMP_TO_EDGE,
      });
      skyTex.setSource(skyCanvas);
    }
  }

  collectMaterials(world.sky, skyMats);
  if (skyTex) {
    for (const mat of skyMats) {
      savedSkyMaps.set(mat, mat.emissiveMap);
      savedSkyEmissive.set(mat, mat.emissive.clone());
      mat.emissiveMap = skyTex;
      mat.emissive.set(1, 1, 1);
      mat.update();
    }
  }

  // Sem noite: desliga o brilho noturno das janelas e das lâmpadas dos postes uma única vez
  const cityMats: StandardMaterial[] = [];
  const savedCityEmissive = new Map<StandardMaterial, number>();
  findCityMaterials(app.root, cityMats);
  for (const mat of cityMats) {
    if (mat.emissiveMap) {
      savedCityEmissive.set(mat, mat.emissiveIntensity);
      mat.emissiveIntensity = 0;
      mat.update();
    }
  }

  const streetLightMat = (world as { streetLightMaterial?: StandardMaterial }).streetLightMaterial ?? null;
  const savedStreetLightEmissive = streetLightMat ? streetLightMat.emissiveIntensity : null;
  if (streetLightMat) {
    streetLightMat.emissiveIntensity = 0;
    streetLightMat.update();
  }

  const headlights: Entity[] = [];
  let headlightScanTimer = 0;
  let lastAppliedMinute = Number.NaN;
  let destroyed = false;

  function disableHeadlights() {
    headlights.length = 0;
    collectByName(app.root, 'CarHeadlights', headlights);
    collectByName(app.root, 'TrafficLights', headlights);
    for (let i = 0; i < headlights.length; i++) {
      if (headlights[i].enabled) headlights[i].enabled = false;
    }
  }

  function applyClock(clockMinutes: number, force = false) {
    const clamped = Math.max(360, Math.min(720, Number.isFinite(clockMinutes) ? clockMinutes : 360));
    if (!force && Number.isFinite(lastAppliedMinute) && Math.abs(clamped - lastAppliedMinute) < 0.75) {
      return;
    }
    lastAppliedMinute = clamped;

    const s = sampleDayNight(clamped);

    // 1) Degradê do céu da manhã
    if (sky2d && skyCanvas && skyTex) {
      const grad = sky2d.createLinearGradient(0, 0, 0, skyCanvas.height);
      grad.addColorStop(0.0, rgbCss(s.zenith));
      grad.addColorStop(0.24, rgbCss(s.upper));
      grad.addColorStop(0.42, rgbCss(s.mid));
      grad.addColorStop(0.5, rgbCss(s.horizon));
      grad.addColorStop(0.58, rgbCss(s.below));
      grad.addColorStop(1.0, rgbCss(s.nadir));
      sky2d.fillStyle = grad;
      sky2d.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
      skyTex.upload();
    }

    // 2) Sol da manhã subindo do leste (06:00) até o alto do céu ao meio-dia (12:00)
    if (sun.light) {
      sun.light.color.set(s.sunColor[0], s.sunColor[1], s.sunColor[2]);
      sun.light.intensity = s.sunIntensity;
    }
    const morningFrac = Math.max(0, Math.min(1, (s.hour - 6.0) / 6.0));
    const elev = 22 + Math.sin(morningFrac * Math.PI * 0.5) * 54; // 22° às 06:00 → 76° às 12:00
    const yaw = 88 + morningFrac * 82; // leste → norte/zênite
    sun.setEulerAngles(elev, yaw, 0);

    // 3) Luz ambiente, névoa diurna e cor de fundo da câmera
    app.scene.ambientLight.set(s.ambient[0], s.ambient[1], s.ambient[2]);
    app.scene.fog.color.set(s.fog[0], s.fog[1], s.fog[2]);
    if (camera.camera) {
      camera.camera.clearColor.set(s.fog[0], s.fog[1], s.fog[2], 1);
    }

    if (force) {
      disableHeadlights();
    }
  }

  applyClock(ctx.mission?.clockMinutes ?? 360, true);

  return {
    update(dt: number) {
      if (destroyed) return;
      const clockMinutes = ctx.mission?.clockMinutes ?? 360;
      applyClock(clockMinutes, false);

      // Garante que faróis de carros recriados permaneçam desligados durante o dia
      headlightScanTimer += dt;
      if (headlightScanTimer >= 2.0) {
        headlightScanTimer = 0;
        disableHeadlights();
      }
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;

      for (const [mat, prevMap] of savedSkyMaps) {
        mat.emissiveMap = prevMap;
        const prevEm = savedSkyEmissive.get(mat);
        if (prevEm) mat.emissive.copy(prevEm);
        mat.update();
      }
      savedSkyMaps.clear();
      savedSkyEmissive.clear();

      for (const [mat, prevIntensity] of savedCityEmissive) {
        mat.emissiveIntensity = prevIntensity;
        mat.update();
      }
      savedCityEmissive.clear();

      if (streetLightMat && savedStreetLightEmissive !== null) {
        streetLightMat.emissiveIntensity = savedStreetLightEmissive;
        streetLightMat.update();
      }

      if (sun.parent) {
        sun.setEulerAngles(prevSunEuler);
        if (sun.light && prevSunColor) {
          sun.light.color.copy(prevSunColor);
          sun.light.intensity = prevSunIntensity;
        }
      }

      skyTex?.destroy();
      skyTex = null;
      skyCanvas = null;
      sky2d = null;
    },
  };
}
