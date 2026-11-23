import {
  ADDRESS_CLAMP_TO_EDGE,
  type AppBase,
  CULLFACE_FRONT,
  Color,
  Entity,
  FOG_LINEAR,
  type MeshInstance,
  PIXELFORMAT_SRGBA8,
  StandardMaterial,
  TONEMAP_ACES,
  Texture,
  Vec3,
} from 'playcanvas';
import { bindSceneAirplane, buildAirplane, type AirplaneModel } from './airplane';
import { createFlightAudio } from './audio/sound';
import { createCameraRig } from './cameras';
import { createCockpit } from './cockpit';
import { createDayNight } from './daynight';
import { createDicas } from './dicas';
import { createEfeitos } from './efeitos';
import { createHud, isTunedNitroActive } from './hud';
import { createMarkers } from './markers';
import { createMissionSystem, startMission } from './mission';
import { applySave, clearSave, describeSave, loadSave, writeSave } from './save';
import { createDevMode } from './devmode';
import { createDropTarget } from './droptarget';
import { enableFrustumCulling } from './models/glb';
import { clearSmoke, createSmoke } from './smoke';
import { createGpsRoute } from './rota';
import { createTraffic } from './trafego';
import {
  STAGE_ORDER,
  createFlightState,
  createMissionState,
  type FlightContext,
  type FlightModule,
  type MissionState,
  type Stage,
} from './types';
import { createLoadingScreen, type LoadingScreenHandle } from './ui/loading';
import { createGameMenus, type PresentationLaunchConfig } from './ui/menus';
import {
  clearRuntime,
  initRuntime,
  loadSettings,
  requestCameraSnap,
  saveSettings,
  setRuntimeDaySeconds,
  setRuntimeMode,
  setRuntimePresentationMode,
  setRuntimeSettings,
  type GameMode,
  type GameSettings,
  type QualityLevel,
  type TrafficLevel,
} from './ui/settings';
import { createVehicleSystem } from './vehicles';
import { SKY_HORIZON, buildWorld, type World } from './world';
import { UNIACADEMIA, createWorldPhysics, nearestRoad } from './world-data';

export type DifficultyLevel = 'facil' | 'normal' | 'dificil';

export interface FlightSimOptions {
  /** Duração do turno da manhã 06:00 → 12:00 em minutos reais (padrão: 30). */
  dayDurationMinutes?: number;
  /** Dificuldade: ajusta raio das entregas e tempo disponível. */
  difficulty?: DifficultyLevel;
  /** Sensibilidade inicial do mouse para mira do A-29 e câmera (0.05..0.4). */
  mouseSensitivity?: number;
  /** Volume inicial da música (0..1). */
  musicVolume?: number;
  /** Volume inicial dos efeitos sonoros (0..1). */
  sfxVolume?: number;
  /** Exibe ou oculta o minimapa no canto inferior esquerdo. */
  showMinimap?: boolean;
  /** Exibe um contador leve de FPS no canto da tela. */
  showFps?: boolean;
  /** Ativa o modo apresentação (selo no HUD, atalhos F1–F6 e sem registro de recorde). */
  presentationMode?: boolean;
  /** Tela de carregamento pré-montada (opcional, usada por main.ts e scripts do Editor). */
  loadingScreen?: LoadingScreenHandle;
}

type VehicleSystemJumpable = FlightModule & {
  enterStageVehicle?: (
    kind: Stage,
    pose?: { x: number; y: number; z: number; heading: number; speed?: number },
  ) => void;
};

const PRESENTATION_STAGE_CLOCK: Record<Stage, number> = {
  car: 360, // 06:00 (início da manhã)
  tuned: 450, // 07:30 (manhã clara)
  heli: 540, // 09:00 (sol alto)
  a29: 630, // 10:30 (reta final da manhã)
};
const PRESENTATION_FINAL_CLOCK = 675; // 11:15 (quase hora do almoço na UniAcademia)

export interface FlightSimHandle {
  destroy(): void;
  applyOptions(next: FlightSimOptions): void;
}

const DIFFICULTY_PRESETS: Record<DifficultyLevel, { radiusScale: number; timeScale: number }> = {
  facil: { radiusScale: 1.35, timeScale: 1.25 },
  normal: { radiusScale: 1.0, timeScale: 1.0 },
  dificil: { radiusScale: 0.72, timeScale: 0.75 },
};

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return v < min ? min : v > max ? max : v;
}

function normalizeDifficulty(v: unknown): DifficultyLevel {
  return v === 'facil' || v === 'normal' || v === 'dificil' ? v : 'normal';
}

const QUALITY_CONFIG: Record<
  QualityLevel,
  { pixelRatio: number; fogStart: number; fogEnd: number; clouds: number; detailDistance: number }
> = {
  low: { pixelRatio: 1.0, fogStart: 1200, fogEnd: 3200, clouds: 0, detailDistance: 900 },
  medium: { pixelRatio: 1.25, fogStart: 1600, fogEnd: 4500, clouds: 0.5, detailDistance: 1400 },
  high: { pixelRatio: 1.5, fogStart: 2000, fogEnd: 5600, clouds: 1, detailDistance: Infinity },
};

const DETAIL_CULL_PATTERN = /^(bairros|casas|lampadas dos postes|cloud|nuve|mundo-bairros|mundo-casas|mundo-nuvens|detalhe)/i;
const PROTECTED_ENTITY_PATTERN = /(terrain|terreno|sea|mar|sky|ceu|céu|roads|ground|uniacademia|aeroporto|pista|hangar|cristo|oficina|heliponto|deliverymarker|finaldelivery)/i;

function isPerfDiagEnabled(): boolean {
  try {
    if (typeof window === 'undefined' || !window.location?.search) return false;
    return new URLSearchParams(window.location.search).get('perf') === '1';
  } catch {
    return false;
  }
}

function distanceToAabb(pos: Vec3, mi: MeshInstance): number {
  const aabb = mi.aabb;
  if (!aabb) return 0;
  const min = aabb.getMin();
  const max = aabb.getMax();
  const dx = pos.x < min.x ? min.x - pos.x : pos.x > max.x ? pos.x - max.x : 0;
  const dy = pos.y < min.y ? min.y - pos.y : pos.y > max.y ? pos.y - max.y : 0;
  const dz = pos.z < min.z ? min.z - pos.z : pos.z > max.z ? pos.z - max.z : 0;
  return Math.hypot(dx, dy, dz);
}

function collectDetailMeshInstances(root: Entity, out: Array<{ mi: MeshInstance; altitudeCap: number }>, inDetailBranch = false): void {
  const name = root.name || '';
  if (PROTECTED_ENTITY_PATTERN.test(name)) return;
  const matchesDetail = inDetailBranch || DETAIL_CULL_PATTERN.test(name);
  if (matchesDetail) {
    const isTinyDetail = /^(casas|lampadas dos postes|detalhe)/i.test(name);
    const altitudeCap = isTinyDetail ? 260 : 520;
    const renderMis = root.render?.meshInstances;
    if (renderMis) {
      for (let i = 0; i < renderMis.length; i++) {
        if (renderMis[i]) out.push({ mi: renderMis[i], altitudeCap });
      }
    }
    const modelMis = root.model?.meshInstances;
    if (modelMis) {
      for (let i = 0; i < modelMis.length; i++) {
        if (modelMis[i]) out.push({ mi: modelMis[i], altitudeCap });
      }
    }
  }
  const children = root.children;
  for (let i = 0; i < children.length; i++) {
    collectDetailMeshInstances(children[i] as Entity, out, matchesDetail);
  }
}

function readRenderPerfStats(app: AppBase): { drawCalls: number; visibleMeshInstances: number } {
  const stats = (app as { stats?: { drawCalls?: { total?: number; forward?: number; shadow?: number } } }).stats;
  const gd = app.graphicsDevice as { _drawCallsPerFrame?: number } | undefined;
  let drawCalls = 0;
  if (typeof stats?.drawCalls?.total === 'number' && stats.drawCalls.total > 0) {
    drawCalls = stats.drawCalls.total;
  } else if (typeof gd?._drawCallsPerFrame === 'number' && gd._drawCallsPerFrame > 0) {
    drawCalls = gd._drawCallsPerFrame;
  } else if (stats?.drawCalls) {
    drawCalls = (stats.drawCalls.forward ?? 0) + (stats.drawCalls.shadow ?? 0);
  }

  let visibleMeshInstances = 0;
  const layers = (app.scene as { layers?: { layerList?: Array<{ meshInstances?: MeshInstance[] }> } } | undefined)
    ?.layers?.layerList;
  if (Array.isArray(layers)) {
    const seen = new Set<MeshInstance>();
    for (let i = 0; i < layers.length; i++) {
      const mis = layers[i]?.meshInstances;
      if (!mis) continue;
      for (let j = 0; j < mis.length; j++) {
        const mi = mis[j];
        if (!mi || seen.has(mi)) continue;
        seen.add(mi);
        if (mi.visible && (mi as { visibleThisFrame?: boolean }).visibleThisFrame !== false) {
          visibleMeshInstances++;
        }
      }
    }
  } else {
    visibleMeshInstances = stats?.drawCalls?.forward ?? 0;
  }
  return { drawCalls, visibleMeshInstances };
}

const USE_SCENE_WORLD = false;

const SCENE_ENTITY_NAMES = {
  world: 'Mundo',
  plane: 'A29',
  camera: 'CameraJogo',
  sun: 'Sol',
} as const;

function findSceneEntity(root: Entity, name: string, exclude?: Entity): Entity | null {
  const stack: Entity[] = [];
  for (let i = root.children.length - 1; i >= 0; i--) {
    stack.push(root.children[i] as Entity);
  }
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === exclude) continue;
    if (cur.name === name) return cur;
    for (let i = cur.children.length - 1; i >= 0; i--) {
      stack.push(cur.children[i] as Entity);
    }
  }
  return null;
}

function collectByNamePattern(root: Entity, pattern: RegExp, out: Entity[] = []): Entity[] {
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i] as Entity;
    if (pattern.test(child.name)) out.push(child);
    collectByNamePattern(child, pattern, out);
  }
  return out;
}

function hasAnyVisual(node: Entity): boolean {
  if (node.render || node.model) return true;
  for (let i = 0; i < node.children.length; i++) {
    if (hasAnyVisual(node.children[i] as Entity)) return true;
  }
  return false;
}

/**
 * Colisão lógica oficial de `world-data.ts` (terreno, cidade, aeroporto/pista, heliponto),
 * sem criar malhas, texturas nem materiais — usada quando "Mundo" já está na cena.
 */
function createLogicalGroundAt(): (x: number, z: number) => number {
  const physics = createWorldPhysics();
  return (x: number, z: number) => physics.groundAt(x, z);
}

function buildSkyDome(
  app: AppBase,
  parent: Entity,
  materials: StandardMaterial[],
  textures: Texture[],
): Entity {
  const sky = new Entity('Sky', app);
  if (typeof document === 'undefined' || !app.graphicsDevice) {
    parent.addChild(sky);
    return sky;
  }

  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2266c8');
  grad.addColorStop(0.26, '#4c96e4');
  grad.addColorStop(0.42, '#8ac6f2');
  grad.addColorStop(0.5, '#cde4f5');
  grad.addColorStop(0.58, '#a4bfd4');
  grad.addColorStop(1.0, '#445e7e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);

  const tex = new Texture(app.graphicsDevice, {
    width: 4,
    height: 256,
    format: PIXELFORMAT_SRGBA8,
    mipmaps: false,
    addressU: ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
  });
  tex.setSource(c);
  textures.push(tex);

  const m = new StandardMaterial();
  m.useLighting = false;
  m.useFog = false;
  m.diffuse = new Color(0, 0, 0);
  m.emissiveMap = tex;
  m.emissive = new Color(1, 1, 1);
  m.cull = CULLFACE_FRONT;
  m.depthWrite = false;
  m.update();
  materials.push(m);

  sky.addComponent('render', { type: 'sphere', material: m, castShadows: false });
  sky.setLocalScale(9000, 9000, 9000);
  parent.addChild(sky);
  return sky;
}

export function startFlightSim(
  app: AppBase,
  uiRoot: HTMLElement,
  initialOptions?: FlightSimOptions,
): FlightSimHandle {
  // Preserva luz ambiente, névoa e pixel ratio originais para restaurar no destroy()
  const prevAmbient = app.scene.ambientLight.clone();
  const prevFog = {
    type: app.scene.fog.type,
    color: app.scene.fog.color.clone(),
    density: app.scene.fog.density,
    start: app.scene.fog.start,
    end: app.scene.fog.end,
  };
  const graphicsDevice = app.graphicsDevice as
    | (AppBase['graphicsDevice'] & { canvas?: HTMLCanvasElement; maxPixelRatio?: number })
    | undefined;
  const prevMaxPixelRatio = graphicsDevice?.maxPixelRatio;
  const canvas = graphicsDevice?.canvas ?? null;

  app.scene.ambientLight = new Color(0.55, 0.48, 0.55);
  app.scene.fog.type = FOG_LINEAR;
  app.scene.fog.color = SKY_HORIZON.clone();
  app.scene.fog.start = 900;
  app.scene.fog.end = 4200;

  const loadingScreen: LoadingScreenHandle =
    initialOptions?.loadingScreen ?? createLoadingScreen(typeof document !== 'undefined' ? uiRoot : null);
  loadingScreen.attachApp(app);
  loadingScreen.setStage('world', 'Carregando relevo, bairros e texturas de Juiz de Fora…', false);
  loadingScreen.setStage('vehicles', 'Carregando veículos e fachada da UniAcademia…', false);
  loadingScreen.setStage('minimap', 'Montando minimapa de Juiz de Fora…', false);

  const simRoot = new Entity('FlightSimRoot');
  app.root.addChild(simRoot);

  const restorers: Array<() => void> = [];

  // 1) Sol: usa entidade "Sol" da cena se existir; senão cria como antes
  const sceneSun = findSceneEntity(app.root, SCENE_ENTITY_NAMES.sun, simRoot);
  let sun: Entity;
  if (sceneSun) {
    const prevEnabled = sceneSun.enabled;
    sceneSun.enabled = true;
    if (!sceneSun.light) {
      sceneSun.addComponent('light', {
        type: 'directional',
        color: new Color(1, 0.8, 0.6),
        intensity: 1.7,
        castShadows: false,
      });
    }
    sun = sceneSun;
    restorers.push(() => {
      if (sceneSun.parent) sceneSun.enabled = prevEnabled;
    });
  } else {
    sun = new Entity('Sun');
    sun.addComponent('light', {
      type: 'directional',
      color: new Color(1, 0.8, 0.6),
      intensity: 1.7,
      castShadows: false,
    });
    sun.setEulerAngles(58, 125, 0);
    simRoot.addChild(sun);
  }

  // 2) Mundo: se "Mundo" existir na cena com malhas visuais (render ou model), usa ela + colisão lógica sem render
  const sceneWorld = findSceneEntity(app.root, SCENE_ENTITY_NAMES.world, simRoot);
  let world: World;
  let cloudEntities: Entity[];
  // A prévia "Mundo" do Editor vem do primeiro import dos GLBs (o Editor não reimporta o modelo ao atualizar
  // a fonte), então fica desatualizada: no Launch ela é escondida e o mundo é gerado igual ao local.
  if (sceneWorld && sceneWorld.enabled) {
    sceneWorld.enabled = false;
    restorers.push(() => {
      if (sceneWorld.parent) sceneWorld.enabled = true;
    });
  }
  if (USE_SCENE_WORLD && sceneWorld && hasAnyVisual(sceneWorld)) {
    const prevWorldEnabled = sceneWorld.enabled;
    sceneWorld.enabled = true;
    const skyMats: StandardMaterial[] = [];
    const skyTexs: Texture[] = [];
    const sceneSkies = collectByNamePattern(sceneWorld, /(?:^|[-_\s])(sky|ceu|céu)(?:$|[-_\s.])/i);
    let sky: Entity;
    if (sceneSkies.length > 0) {
      sky = sceneSkies[0];
      const prevSkyPos = sky.getPosition().clone();
      restorers.push(() => {
        if (sky.parent) sky.setPosition(prevSkyPos);
      });
    } else {
      sky = buildSkyDome(app, simRoot, skyMats, skyTexs);
    }
    cloudEntities = collectByNamePattern(sceneWorld, /(cloud|nuve)/i);
    const prevCloudEnabled = cloudEntities.map((c) => c.enabled);
    restorers.push(() => {
      if (sceneWorld.parent) sceneWorld.enabled = prevWorldEnabled;
      for (let i = 0; i < cloudEntities.length; i++) {
        if (cloudEntities[i].parent) cloudEntities[i].enabled = prevCloudEnabled[i];
      }
    });
    world = {
      sky,
      groundAt: createLogicalGroundAt(),
      materials: skyMats,
      textures: skyTexs,
    };
  } else {
    world = buildWorld(app, simRoot);
    cloudEntities = simRoot.children.filter((c) => c.name === 'Cloud') as Entity[];
  }

  // 2b) Prévias do Editor (montar-cena-editor.js): o jogo cria os próprios veículos, personagem e UniAcademia
  //     a partir dos GLBs; as cópias estáticas da cena só servem para ver no Viewport e ficariam duplicadas.
  for (const previewName of ['Heli', 'Carro_Inicial', 'Carro_1', 'Carro_2', 'Carro_3', 'Carro_4', 'Carro_5', 'Carro_Tunado', 'Personagem', 'UniAcademia']) {
    const preview = findSceneEntity(app.root, previewName, simRoot);
    if (!preview || !preview.enabled) continue;
    preview.enabled = false;
    restorers.push(() => {
      if (preview.parent) preview.enabled = true;
    });
  }

  // 3) Avião: se "A29" existir na cena, vincula a ela; senão cria como antes
  const scenePlane = findSceneEntity(app.root, SCENE_ENTITY_NAMES.plane, simRoot);
  let plane: AirplaneModel;
  if (scenePlane) {
    const prevEnabled = scenePlane.enabled;
    const prevPos = scenePlane.getLocalPosition().clone();
    const prevRot = scenePlane.getLocalRotation().clone();
    const bound = bindSceneAirplane(app, scenePlane);
    plane = bound.model;
    restorers.push(() => {
      bound.cleanup();
      if (scenePlane.parent) {
        scenePlane.setLocalPosition(prevPos);
        scenePlane.setLocalRotation(prevRot);
        scenePlane.enabled = prevEnabled;
      }
    });
  } else {
    plane = buildAirplane(app, simRoot);
  }

  // 4) Câmera: se "CameraJogo" existir na cena, usa ela; senão cria como antes
  const sceneCamera = findSceneEntity(app.root, SCENE_ENTITY_NAMES.camera, simRoot);
  let camera: Entity;
  if (sceneCamera) {
    const prevEnabled = sceneCamera.enabled;
    const prevPos = sceneCamera.getLocalPosition().clone();
    const prevRot = sceneCamera.getLocalRotation().clone();
    const prevFov = sceneCamera.camera?.fov;
    sceneCamera.enabled = true;
    if (!sceneCamera.camera) {
      sceneCamera.addComponent('camera', {
        clearColor: SKY_HORIZON.clone(),
        fov: 65,
        nearClip: 1.0,
        farClip: 6000,
        toneMapping: TONEMAP_ACES,
      });
    } else {
      sceneCamera.camera.clearColor = SKY_HORIZON.clone();
      if (sceneCamera.camera.farClip < 6000) sceneCamera.camera.farClip = 6000;
      sceneCamera.camera.toneMapping = TONEMAP_ACES;
    }
    camera = sceneCamera;
    restorers.push(() => {
      if (sceneCamera.parent) {
        sceneCamera.setLocalPosition(prevPos);
        sceneCamera.setLocalRotation(prevRot);
        if (sceneCamera.camera && typeof prevFov === 'number') sceneCamera.camera.fov = prevFov;
        sceneCamera.enabled = prevEnabled;
      }
    });
  } else {
    camera = new Entity('Camera');
    camera.addComponent('camera', {
      clearColor: SKY_HORIZON.clone(),
      fov: 65,
      nearClip: 1.0,
      farClip: 6000,
      toneMapping: TONEMAP_ACES,
    });
    simRoot.addChild(camera);
  }

  // Desliga câmeras, luzes e placeholders estáticos de veículos montados na cena do Editor
  const disabledEntities: Entity[] = [];
  for (const type of ['camera', 'light'] as const) {
    for (const comp of app.root.findComponents(type)) {
      const entity = comp.entity;
      if (entity !== camera && entity !== sun && entity !== simRoot && entity !== app.root && entity.enabled) {
        entity.enabled = false;
        disabledEntities.push(entity);
      }
    }
  }
  for (const child of app.root.children as Entity[]) {
    if (child === simRoot || child === camera || child === sun || child === scenePlane || !child.enabled) continue;
    if (/^(Heli|Carro_|Personagem)/i.test(child.name)) {
      child.enabled = false;
      disabledEntities.push(child);
    }
  }

  const materials = new Set([...world.materials, ...plane.materials]);
  const textures = new Set(world.textures);
  loadingScreen.setStage(
    'world',
    `Juiz de Fora, bairros e ${Math.max(1, textures.size)} texturas prontos`,
    true,
  );

  const persistedSettings = loadSettings();
  let simOptions: Required<Omit<FlightSimOptions, 'loadingScreen'>> = {
    dayDurationMinutes: clampNum(initialOptions?.dayDurationMinutes, 30, 2, 60),
    difficulty: normalizeDifficulty(initialOptions?.difficulty),
    mouseSensitivity: clampNum(initialOptions?.mouseSensitivity, persistedSettings.mouseSensitivity, 0.05, 0.4),
    musicVolume: clampNum(initialOptions?.musicVolume, persistedSettings.musicVolume, 0, 1),
    sfxVolume: clampNum(initialOptions?.sfxVolume, persistedSettings.sfxVolume, 0, 1),
    showMinimap: typeof initialOptions?.showMinimap === 'boolean' ? initialOptions.showMinimap : true,
    showFps: typeof initialOptions?.showFps === 'boolean' ? initialOptions.showFps : persistedSettings.showFps,
    presentationMode: Boolean(initialOptions?.presentationMode),
  };

  let settings: GameSettings = {
    ...persistedSettings,
    ...(initialOptions?.mouseSensitivity !== undefined ? { mouseSensitivity: simOptions.mouseSensitivity } : {}),
    ...(initialOptions?.musicVolume !== undefined ? { musicVolume: simOptions.musicVolume } : {}),
    ...(initialOptions?.sfxVolume !== undefined ? { sfxVolume: simOptions.sfxVolume } : {}),
    ...(initialOptions?.showFps !== undefined ? { showFps: simOptions.showFps } : {}),
  };
  const state = createFlightState();
  state.controlMode = settings.defaultControlMode;
  initRuntime(state, settings, 'title');
  setRuntimePresentationMode(state, simOptions.presentationMode);

  const mission: MissionState = createMissionState();
  const ctx: FlightContext = { app, world, plane, camera, state, mission };

  // Ordem fixa: veículos/voo → missão → luz da manhã → câmeras → marcadores → cabine → HUD → fumaça
  const flightModule: VehicleSystemJumpable = createVehicleSystem(ctx);
  loadingScreen.setStage('vehicles', 'Veículos e fachada da UniAcademia prontos', true);
  const missionModule: FlightModule = createMissionSystem(ctx);
  const gpsModule: FlightModule = createGpsRoute(ctx);
  const trafficModule: FlightModule = createTraffic(ctx);
  const dayNightModule = createDayNight(ctx, sun);
  const cameraRig = createCameraRig(ctx);
  const markersModule = createMarkers(ctx, uiRoot);
  const dropTarget = createDropTarget(ctx);
  const cockpitModule = createCockpit(ctx, uiRoot);
  const hudModule = createHud(ctx, uiRoot);
  loadingScreen.setStage('minimap', 'Minimapa de Juiz de Fora pronto', true);
  const smokeModule = createSmoke(ctx);
  const efeitosModule = createEfeitos(ctx, uiRoot);
  const dicasModule = createDicas(ctx, uiRoot);

  function syncRuntimeDayDuration() {
    const { timeScale } = DIFFICULTY_PRESETS[simOptions.difficulty];
    setRuntimeDaySeconds(state, Math.max(90, simOptions.dayDurationMinutes * timeScale * 60));
  }
  function syncReduceMotionClass() {
    uiRoot.classList?.toggle('reduce-motion', settings.reduceMotion);
  }
  syncRuntimeDayDuration();
  syncReduceMotionClass();

  // Guarda os raios originais das entregas para poder reajustar a dificuldade ao vivo pelo Editor
  const baseDeliveryRadii = new Map<string, number>();
  function syncDeliveryDifficulty() {
    const { radiusScale } = DIFFICULTY_PRESETS[simOptions.difficulty];
    for (let i = 0; i < mission.deliveries.length; i++) {
      const d = mission.deliveries[i];
      if (!baseDeliveryRadii.has(d.id)) {
        baseDeliveryRadii.set(d.id, d.radius);
      }
      const baseR = baseDeliveryRadii.get(d.id) ?? d.radius;
      d.radius = Math.max(4, Math.round(baseR * radiusScale * 10) / 10);
    }
  }
  syncDeliveryDifficulty();

  // Visibilidade do minimapa controlada por atributo do Editor
  const minimapEl = typeof uiRoot.querySelector === 'function'
    ? (uiRoot.querySelector('.hud-minimap') as HTMLElement | null)
    : null;
  function applyMinimapVisibility() {
    if (minimapEl) minimapEl.style.display = simOptions.showMinimap ? '' : 'none';
  }
  applyMinimapVisibility();

  // Contador leve de FPS com média dos últimos segundos + pior quadro (atributo do Editor e Opções)
  let fpsEl: HTMLDivElement | null = null;
  const fpsSamples: Array<{ t: number; dtMs: number }> = [];
  let fpsClockSec = 0;
  let fpsRefreshAccum = 0;
  const perfDiag = isPerfDiagEnabled();
  let perfElapsed = 0;
  let perfFrames = 0;
  let perfWorstMs = 0;

  if (typeof document !== 'undefined') {
    fpsEl = document.createElement('div');
    fpsEl.className = 'hud-fps-counter';
    fpsEl.textContent = '-- FPS · pior -- ms';
    fpsEl.hidden = !settings.showFps;
    uiRoot.appendChild(fpsEl);
  }

  // Frustum culling ligado em tudo + cache de detalhes para culling por distância (sem tocar em terreno/vias/marcos)
  const detailTargets: Array<{ mi: MeshInstance; altitudeCap: number }> = [];
  let detailCullTick = 0;
  function refreshPerformanceTargets() {
    enableFrustumCulling(app.root);
    detailTargets.length = 0;
    collectDetailMeshInstances(app.root, detailTargets);
  }
  function updateDetailDistanceCulling() {
    const maxDist = QUALITY_CONFIG[settings.quality].detailDistance;
    if (!Number.isFinite(maxDist)) {
      for (let i = 0; i < detailTargets.length; i++) {
        detailTargets[i].mi.visible = true;
      }
      return;
    }
    const camPos = camera.getPosition();
    for (let i = 0; i < detailTargets.length; i++) {
      const { mi, altitudeCap } = detailTargets[i];
      const dist = distanceToAabb(camPos, mi);
      const tooHigh = settings.quality === 'low' && camPos.y > altitudeCap && dist === 0;
      mi.visible = dist <= maxDist && !tooHigh;
    }
  }
  refreshPerformanceTargets();

  const audio = createFlightAudio(settings);

  let mode: GameMode = 'title';
  let hadPointerLockInFlight = false;
  let lastPauseAt = 0;
  let titleAngle = 0.65;
  let heliRotorAngle = 0;
  let nitroFlamePhase = 0;
  let prevDelivered = mission.delivered;
  let prevStage: Stage = mission.stage;
  let prevStatus: MissionState['status'] = mission.status;
  let prevWarnMsg = '';
  const titleFocus = new Vec3();
  const titleCamPos = new Vec3();

  function syncMissionTracking() {
    prevDelivered = mission.delivered;
    prevStage = mission.stage;
    prevStatus = mission.status;
    prevWarnMsg = mission.message ?? '';
  }

  function applyQuality(quality: QualityLevel) {
    const cfg = QUALITY_CONFIG[quality];
    app.scene.fog.start = cfg.fogStart;
    app.scene.fog.end = cfg.fogEnd;

    if (graphicsDevice && typeof graphicsDevice.maxPixelRatio === 'number') {
      const nativeDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      graphicsDevice.maxPixelRatio = Math.min(nativeDpr, cfg.pixelRatio);
      (app as { resizeCanvas?: () => void }).resizeCanvas?.();
    }

    for (let i = 0; i < cloudEntities.length; i++) {
      if (cfg.clouds <= 0) cloudEntities[i].enabled = false;
      else if (cfg.clouds >= 1) cloudEntities[i].enabled = true;
      else cloudEntities[i].enabled = cloudEntities.length === 1 ? true : i % 2 === 0;
    }
    updateDetailDistanceCulling();
  }

  function setPlaneExteriorVisible(visible: boolean) {
    for (let i = 0; i < plane.exterior.length; i++) {
      const render = plane.exterior[i].render;
      if (render) render.enabled = visible;
      const modelComp = plane.exterior[i].model;
      if (modelComp) modelComp.enabled = visible;
    }
  }

  function showPlaneExterior() {
    setPlaneExteriorVisible(true);
  }

  function releasePointerLock() {
    if (typeof document !== 'undefined' && canvas && document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
  }

  function requestPointerLockForFlight() {
    if (!canvas || state.controlMode !== 'mouse') return;
    const req = (canvas as { requestPointerLock?: () => Promise<void> | void }).requestPointerLock;
    if (typeof req !== 'function') return;
    try {
      const res = req.call(canvas);
      if (res && typeof res.then === 'function') {
        res.then(
          () => {
            if (destroyed || mode !== 'playing' || state.controlMode !== 'mouse') {
              releasePointerLock();
            }
          },
          () => {},
        );
      }
    } catch {
      // Ignora em ambientes sem suporte a pointer lock
    }
  }

  function updateTitleCamera(dt: number) {
    titleAngle = (titleAngle + dt * 0.14) % (Math.PI * 2);
    if (camera.camera) camera.camera.fov = 58;
    const isGround = state.vehicle === 'car' || state.vehicle === 'tuned' || state.vehicle === 'foot';
    const radius = isGround ? 14.5 : 34;
    const height = (isGround ? 5.2 : 10.5) + Math.sin(titleAngle * 2) * (isGround ? 1.0 : 2.2);
    titleFocus.set(state.x, state.y + (isGround ? 1.1 : 0.5), state.z);
    titleCamPos.set(
      titleFocus.x + Math.sin(titleAngle) * radius,
      titleFocus.y + height,
      titleFocus.z + Math.cos(titleAngle) * radius,
    );
    camera.setPosition(titleCamPos);
    camera.lookAt(titleFocus, Vec3.UP);
  }

  let presentationActive = simOptions.presentationMode;
  let baseDayDurationMinutes = simOptions.dayDurationMinutes;
  let lastPresentationConfig: PresentationLaunchConfig | null = null;

  function applyPresentationTarget(stage: Stage, finalDelivery: boolean) {
    startMission(ctx);
    baseDeliveryRadii.clear();
    syncDeliveryDifficulty();

    const targetIdx = STAGE_ORDER.indexOf(stage);
    let deliveredCount = 0;
    for (let i = 0; i < mission.deliveries.length; i++) {
      const d = mission.deliveries[i];
      const dIdx = STAGE_ORDER.indexOf(d.stage);
      const shouldMarkDone = finalDelivery ? d.id !== 'a29-4' : dIdx < targetIdx;
      d.delivered = shouldMarkDone;
      if (shouldMarkDone) deliveredCount++;
    }
    mission.stage = finalDelivery ? 'a29' : stage;
    mission.delivered = deliveredCount;
    mission.clockMinutes = finalDelivery ? PRESENTATION_FINAL_CLOCK : PRESENTATION_STAGE_CLOCK[stage];
    mission.carrying = mission.stage;
    const nextPending = mission.deliveries.find((d) => !d.delivered && d.stage === mission.stage);
    mission.nextDeliveryId = nextPending?.id ?? null;

    // Usa o gancho opcional em vehicles.ts (se exposto pelo Codex) para entrar direto no veículo do estágio
    const airborneFinalPose = finalDelivery
      ? {
          x: UNIACADEMIA.x,
          y: UNIACADEMIA.y + 135,
          z: UNIACADEMIA.z + 520,
          heading: 0,
          speed: 75,
        }
      : undefined;

    if (typeof flightModule.enterStageVehicle === 'function') {
      flightModule.enterStageVehicle(mission.stage, airborneFinalPose);
      mission.message = finalDelivery
        ? 'Modo apresentação · Entrega final na UniAcademia (A-29)'
        : `Modo apresentação · Estágio ${mission.stage.toUpperCase()}`;
    } else {
      mission.message = finalDelivery
        ? 'Modo apresentação · Entrega final pronta (UniAcademia · 11:15)'
        : `Modo apresentação · Estágio ${mission.stage.toUpperCase()} liberado`;
    }
    mission.messageTimer = 4;

    clearSmoke(state);
    state.controlMode = settings.defaultControlMode;
    state.camera = 'chase';
    menus.clearStageBanner();
    syncMissionTracking();
    requestCameraSnap(state);
    dayNightModule.update(0);
    cameraRig.update(0);
    gpsModule.update(0);
    markersModule.update(0);
    cockpitModule.update(0);
    hudModule.update(0);
    dicasModule.update(0);
  }

  function beginMissionPlay(keepPresentation = false) {
    audio.unlock();
    if (!keepPresentation) {
      presentationActive = simOptions.presentationMode;
      simOptions.dayDurationMinutes = baseDayDurationMinutes;
      syncRuntimeDayDuration();
      setRuntimePresentationMode(state, presentationActive);
      lastPresentationConfig = null;
    }
    startMission(ctx);
    baseDeliveryRadii.clear();
    syncDeliveryDifficulty();
    clearSmoke(state);
    state.controlMode = settings.defaultControlMode;
    state.camera = 'chase';
    menus.clearStageBanner();
    syncMissionTracking();
    mode = 'playing';
    hadPointerLockInFlight = false;
    setRuntimeMode(state, 'playing');
    requestCameraSnap(state);
    menus.setMode('playing');
    dayNightModule.update(0);
    cameraRig.update(0);
    gpsModule.update(0);
    markersModule.update(0);
    cockpitModule.update(0);
    hudModule.update(0);
    requestPointerLockForFlight();
  }

  function refreshSaveInfo() {
    const save = loadSave();
    menus.setSaveInfo(save ? describeSave(save) : null);
  }

  /** Salva o turno em andamento (fora do modo apresentação). */
  function persistProgress() {
    if (!presentationActive && (mode === 'playing' || mode === 'paused')) writeSave(mission);
  }

  function continueSavedMission() {
    const save = loadSave();
    beginMissionPlay(false);
    if (!save) return;
    applySave(mission, save);
    baseDeliveryRadii.clear();
    syncDeliveryDifficulty();
    if (typeof flightModule.enterStageVehicle === 'function') flightModule.enterStageVehicle(mission.stage);
    mission.message = `Turno retomado · ${describeSave(save)}`;
    mission.messageTimer = 4;
    syncMissionTracking();
    requestCameraSnap(state);
    dayNightModule.update(0);
    cameraRig.update(0);
    gpsModule.update(0);
    markersModule.update(0);
    hudModule.update(0);
  }

  function beginPresentationPlay(config: PresentationLaunchConfig) {
    audio.unlock();
    presentationActive = true;
    lastPresentationConfig = { ...config };
    simOptions.dayDurationMinutes = config.dayDurationMinutes;
    syncRuntimeDayDuration();
    setRuntimePresentationMode(state, true);
    mode = 'playing';
    hadPointerLockInFlight = false;
    setRuntimeMode(state, 'playing');
    menus.setMode('playing');
    applyPresentationTarget(config.finalDelivery ? 'a29' : config.stage, config.finalDelivery);
    requestPointerLockForFlight();
  }

  function pauseFlight() {
    if (mode !== 'playing') return;
    persistProgress();
    mode = 'paused';
    lastPauseAt = Date.now();
    hadPointerLockInFlight = false;
    setRuntimeMode(state, 'paused');
    releasePointerLock();
    menus.setMode('paused');
    hudModule.update(0);
    dicasModule.update(0);
  }

  function resumeFlight() {
    if (mode !== 'paused') return;
    audio.unlock();
    mode = 'playing';
    hadPointerLockInFlight = false;
    setRuntimeMode(state, 'playing');
    menus.setMode('playing');
    hudModule.update(0);
    dicasModule.update(0);
    requestPointerLockForFlight();
  }

  function returnToTitle() {
    persistProgress();
    startMission(ctx);
    baseDeliveryRadii.clear();
    syncDeliveryDifficulty();
    mission.status = 'intro';
    clearSmoke(state);
    state.controlMode = settings.defaultControlMode;
    state.camera = 'chase';
    menus.clearStageBanner();
    syncMissionTracking();
    mode = 'title';
    hadPointerLockInFlight = false;
    setRuntimeMode(state, 'title');
    releasePointerLock();
    showPlaneExterior();
    refreshSaveInfo();
    menus.setMode('title');
    dayNightModule.update(0);
    gpsModule.update(0);
    markersModule.update(0);
    cockpitModule.update(0);
    hudModule.update(0);
    dicasModule.update(0);
    updateTitleCamera(0);
  }

  function enterEndScreen(outcome: 'won' | 'lost') {
    if (!presentationActive) clearSave();
    mode = 'ended';
    hadPointerLockInFlight = false;
    setRuntimeMode(state, 'ended');
    releasePointerLock();
    if (outcome === 'won') audio.playVictory();
    else audio.playDefeat();
    // Modo apresentação não registra recorde
    menus.showEndScreen(outcome, mission, presentationActive);
    gpsModule.update(0);
    markersModule.update(0);
    cockpitModule.update(0);
    hudModule.update(0);
    dicasModule.update(0);
  }

  function applyUpdatedSettings(next: GameSettings) {
    const controlChanged = next.defaultControlMode !== settings.defaultControlMode;
    settings = { ...next };
    simOptions.showFps = settings.showFps;
    if (fpsEl) {
      fpsEl.hidden = !settings.showFps;
      if (settings.showFps) {
        fpsSamples.length = 0;
        fpsRefreshAccum = 0;
      }
    }
    saveSettings(settings);
    setRuntimeSettings(state, settings);
    syncReduceMotionClass();
    audio.applySettings(settings);
    applyQuality(settings.quality);
    syncTrafficControl?.(settings.traffic);
    syncGroundGpsControl?.(settings.showGroundGps);
    gpsModule.update(0);
    if (controlChanged) {
      state.controlMode = settings.defaultControlMode;
      if (state.controlMode === 'keyboard') releasePointerLock();
    }
    hudModule.update(0);
    dicasModule.update(0);
    cockpitModule.update(0);
  }

  let destroyed = false;
  let isLoading = true;
  const menus = createGameMenus(uiRoot, settings, {
    onStartFlight: () => {
      clearSave();
      beginMissionPlay(false);
    },
    onContinue: continueSavedMission,
    onStartPresentation: beginPresentationPlay,
    onResume: resumeFlight,
    onRestart: () => {
      if (presentationActive && lastPresentationConfig) {
        beginPresentationPlay(lastPresentationConfig);
      } else {
        if (!presentationActive) clearSave();
        beginMissionPlay(presentationActive);
      }
    },
    onReturnTitle: returnToTitle,
    onSettingsChange: applyUpdatedSettings,
    onButtonClick: (confirm) => {
      audio.unlock();
      if (confirm) audio.playConfirm();
      else audio.playClick();
    },
  });
  menus.setHiddenByLoading(true);
  refreshSaveInfo();

  // Desatolar (G ou botão): leva o veículo para a rua mais próxima, parado e alinhado com a via
  function desatolar() {
    if (mode !== 'playing') return;
    const kind = state.vehicle;
    if (kind === 'foot' || typeof flightModule.enterStageVehicle !== 'function') {
      mission.message = 'A pé dá para andar livre: entre num veículo (E).';
      mission.messageTimer = 3;
      return;
    }
    const air = kind === 'heli' || kind === 'a29';
    const p = nearestRoad(state.x, state.z, 4, 0) ?? { x: state.x, z: state.z, heading: state.heading };
    const ground = world.groundAt(p.x, p.z);
    flightModule.enterStageVehicle(kind, {
      x: p.x,
      y: air ? Math.max(state.y, ground + (kind === 'a29' ? 80 : 6)) : ground + 0.5,
      z: p.z,
      heading: p.heading,
      speed: kind === 'a29' ? 60 : 0,
    });
    clearSmoke(state);
    requestCameraSnap(state);
    mission.message = 'Desatolado! De volta à rua.';
    mission.messageTimer = 3;
  }
  let desatolarBtn: HTMLButtonElement | null = null;
  if (typeof document !== 'undefined') {
    desatolarBtn = document.createElement('button');
    desatolarBtn.type = 'button';
    desatolarBtn.className = 'desatolar-btn';
    desatolarBtn.textContent = 'Desatolar (G)';
    desatolarBtn.style.cssText =
      'position:fixed;right:24px;bottom:200px;z-index:120;pointer-events:auto;padding:8px 14px;border:2px solid #1b1b1b;' +
      'background:#f2c21a;color:#1b1b1b;font:700 13px/1 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;' +
      'box-shadow:3px 3px 0 #1b1b1b;cursor:pointer;';
    desatolarBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      desatolar();
    });
    uiRoot.appendChild(desatolarBtn);
  }

  // Modo dev (F8): câmera livre noclip; T traz o veículo para baixo da câmera
  const devMode = createDevMode({
    app,
    camera,
    uiRoot,
    canvas,
    teleport(x, z, headingDeg) {
      const kind = state.vehicle;
      if (kind === 'foot' || typeof flightModule.enterStageVehicle !== 'function') return 'A pé: entre num veículo para teleportar.';
      const ground = world.groundAt(x, z);
      const air = kind === 'heli' || kind === 'a29';
      const y = air ? Math.max(camera.getPosition().y, ground + 40) : ground + 0.5;
      flightModule.enterStageVehicle(kind, { x, y, z, heading: headingDeg, speed: kind === 'a29' ? 60 : 0 });
      return `Veículo trazido para x ${x.toFixed(0)} z ${z.toFixed(0)}`;
    },
  });
  const onPageHide = () => persistProgress();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

  // Opções "Tráfego" e "GPS no chão" injetadas na lista de opções (sem alterar ui/menus.ts)
  let syncTrafficControl: ((level: TrafficLevel) => void) | null = null;
  let syncGroundGpsControl: ((enabled: boolean) => void) | null = null;
  if (typeof document !== 'undefined' && typeof uiRoot.querySelector === 'function') {
    const optList = uiRoot.querySelector('.menu-options-list');
    if (optList) {
      const row = document.createElement('div');
      row.className = 'menu-opt-row';
      const lbl = document.createElement('span');
      lbl.className = 'menu-opt-label';
      lbl.textContent = 'Tráfego';
      const group = document.createElement('div');
      group.className = 'menu-segments';
      const btns = new Map<TrafficLevel, HTMLButtonElement>();
      for (const [val, text] of [
        ['off', 'Desligado'],
        ['low', 'Pouco'],
        ['normal', 'Normal'],
      ] as const) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu-seg-btn';
        b.textContent = text;
        b.addEventListener('click', () => {
          audio.unlock();
          audio.playClick();
          applyUpdatedSettings({ ...settings, traffic: val });
          menus.syncSettings(settings);
        });
        btns.set(val, b);
        group.appendChild(b);
      }
      row.append(lbl, group);
      optList.appendChild(row);
      syncTrafficControl = (level) => {
        for (const [v, b] of btns) b.classList.toggle('is-active', v === level);
      };
      syncTrafficControl(settings.traffic);

      const gpsRow = document.createElement('label');
      gpsRow.className = 'menu-opt-toggle';
      const gpsLbl = document.createElement('span');
      gpsLbl.className = 'menu-opt-label';
      gpsLbl.textContent = 'GPS no chão';
      const gpsInput = document.createElement('input');
      gpsInput.type = 'checkbox';
      gpsInput.className = 'menu-checkbox';
      gpsInput.addEventListener('change', () => {
        audio.unlock();
        audio.playClick();
        applyUpdatedSettings({ ...settings, showGroundGps: gpsInput.checked });
        menus.syncSettings(settings);
      });
      gpsRow.append(gpsLbl, gpsInput);
      optList.appendChild(gpsRow);
      syncGroundGpsControl = (enabled) => {
        gpsInput.checked = enabled;
      };
      syncGroundGpsControl(settings.showGroundGps);
    }
  }

  function onPointerDown() {
    audio.unlock();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (destroyed || isLoading) return;
    // Ctrl é tecla de jogo (freio/potência): bloqueia os atalhos do navegador (Ctrl+S salvar, Ctrl+A selecionar, Ctrl+D favorito...)
    if ((e.ctrlKey || e.metaKey) && mode === 'playing' && /^(Key[A-Z]|Digit\d|Space|Arrow\w+)$/.test(e.code)) e.preventDefault();
    audio.unlock();
    if (e.repeat) return;

    if (e.code === 'KeyG' && mode === 'playing' && !devMode.active) {
      e.preventDefault();
      desatolar();
      return;
    }

    if (e.code === 'F8' && mode === 'playing') {
      e.preventDefault();
      const on = devMode.toggle(camera);
      if (!on) requestCameraSnap(state);
      return;
    }

    // Atalhos exclusivos do Modo Apresentação (fora dele, F1–F6 não fazem nada)
    if (presentationActive && mode === 'playing') {
      if (e.code === 'F1') {
        e.preventDefault();
        applyPresentationTarget('car', false);
        return;
      }
      if (e.code === 'F2') {
        e.preventDefault();
        applyPresentationTarget('tuned', false);
        return;
      }
      if (e.code === 'F3') {
        e.preventDefault();
        applyPresentationTarget('heli', false);
        return;
      }
      if (e.code === 'F4') {
        e.preventDefault();
        applyPresentationTarget('a29', false);
        return;
      }
      if (e.code === 'F5') {
        e.preventDefault();
        applyPresentationTarget('a29', true);
        return;
      }
      if (e.code === 'F6') {
        e.preventDefault();
        mission.clockMinutes = Math.min(715, mission.clockMinutes + 60);
        const hh = String(Math.floor(mission.clockMinutes / 60)).padStart(2, '0');
        const mm = String(Math.floor(mission.clockMinutes % 60)).padStart(2, '0');
        mission.message = `Modo apresentação · Relógio +1h (${hh}:${mm})`;
        mission.messageTimer = 3;
        dayNightModule.update(0);
        hudModule.update(0);
        return;
      }
    }

    const isEsc = e.code === 'Escape' || e.key === 'Escape';
    const isP = e.code === 'KeyP' || e.key === 'p' || e.key === 'P';

    if (mode === 'title' && menus.getScreen() === 'story' && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      audio.playConfirm();
      beginMissionPlay();
      return;
    }

    if (!isEsc && !isP) return;

    if (mode === 'playing') {
      e.preventDefault();
      pauseFlight();
    } else if (mode === 'paused') {
      // Evita que o mesmo Esc que soltou o pointer lock (e pausou) despausar no mesmo instante
      if (Date.now() - lastPauseAt < 180) return;
      e.preventDefault();
      if (isEsc && menus.back()) {
        audio.playClick();
      } else {
        audio.playConfirm();
        resumeFlight();
      }
    } else if (mode === 'title' && isEsc) {
      if (menus.back()) {
        e.preventDefault();
        audio.playClick();
      }
    }
  }

  function onPointerLockChange() {
    if (destroyed || typeof document === 'undefined' || !canvas) return;
    const locked = document.pointerLockElement === canvas;
    if (mode !== 'playing') {
      hadPointerLockInFlight = false;
      return;
    }
    if (locked) {
      hadPointerLockInFlight = true;
    } else if (hadPointerLockInFlight && state.controlMode === 'mouse') {
      hadPointerLockInFlight = false;
      pauseFlight();
    } else {
      hadPointerLockInFlight = false;
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerlockchange', onPointerLockChange);
  }

  applyQuality(settings.quality);
  showPlaneExterior();
  dayNightModule.update(0);
  updateTitleCamera(0);
  world.sky.setPosition(camera.getPosition());
  markersModule.update(0);
  cockpitModule.update(0);
  hudModule.update(0);

  // Só revela o menu inicial depois que todos os GLBs e texturas terminarem de carregar
  loadingScreen.finishSetup(() => {
    if (destroyed) return;
    isLoading = false;
    refreshPerformanceTargets();
    updateDetailDistanceCulling();
    menus.setHiddenByLoading(false);
  });

  const onUpdate = (rawDt: number) => {
    if (Number.isFinite(rawDt) && rawDt > 0) {
      const dtMs = rawDt * 1000;
      if (fpsEl && settings.showFps) {
        fpsClockSec += rawDt;
        fpsSamples.push({ t: fpsClockSec, dtMs });
        const cutoff = fpsClockSec - 3.0;
        while (fpsSamples.length > 1 && fpsSamples[0].t < cutoff) {
          fpsSamples.shift();
        }
        fpsRefreshAccum += rawDt;
        if (fpsRefreshAccum >= 0.3) {
          fpsRefreshAccum = 0;
          let sumMs = 0;
          let worstMs = 0;
          for (let i = 0; i < fpsSamples.length; i++) {
            const ms = fpsSamples[i].dtMs;
            sumMs += ms;
            if (ms > worstMs) worstMs = ms;
          }
          const avgFps = sumMs > 0 ? Math.round((fpsSamples.length * 1000) / sumMs) : 0;
          fpsEl.textContent = `${avgFps} FPS · pior ${Math.round(worstMs)} ms`;
        }
      }

      if (perfDiag) {
        perfElapsed += rawDt;
        perfFrames++;
        if (dtMs > perfWorstMs) perfWorstMs = dtMs;
        if (perfElapsed >= 5.0) {
          const avgFps = perfFrames / perfElapsed;
          const worstFps = perfWorstMs > 0 ? 1000 / perfWorstMs : 0;
          const { drawCalls, visibleMeshInstances } = readRenderPerfStats(app);
          const dpr = graphicsDevice?.maxPixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
          console.log(
            `[PERF] FPS médio: ${avgFps.toFixed(1)} | Pior quadro: ${perfWorstMs.toFixed(1)} ms (${worstFps.toFixed(0)} FPS) | Draw calls: ${drawCalls} | Mesh instances visíveis: ${visibleMeshInstances} | Qualidade: ${settings.quality} (DPR ${dpr.toFixed(2)})`,
          );
          perfElapsed = 0;
          perfFrames = 0;
          perfWorstMs = 0;
        }
      }
    }
    const dt = Math.min(rawDt, 0.05);
    const hideDesatolar = mode !== 'playing' || devMode.active;
    if (desatolarBtn && desatolarBtn.hidden !== hideDesatolar) desatolarBtn.hidden = hideDesatolar;

    if (mode === 'title') {
      updateTitleCamera(dt);
    } else if (mode === 'playing' && devMode.active) {
      devMode.update(dt);
      world.sky.setPosition(camera.getPosition());
    } else if (mode === 'playing') {
      flightModule.update(dt);
      trafficModule.update(dt);
      const clockBefore = mission.clockMinutes;
      missionModule?.update(dt);
      gpsModule.update(dt);

      // Aplica duração configurada do dia e escala de tempo da dificuldade sem alterar mission.ts
      if (mission.status === 'playing' && mission.clockMinutes > clockBefore) {
        const { timeScale } = DIFFICULTY_PRESETS[simOptions.difficulty];
        const effectiveDayMin = Math.max(1.5, simOptions.dayDurationMinutes * timeScale);
        const clockScale = 30 / effectiveDayMin;
        if (Math.abs(clockScale - 1) > 1e-4) {
          const scaled = clockBefore + (mission.clockMinutes - clockBefore) * clockScale;
          if (scaled >= 720) {
            mission.clockMinutes = 720;
            mission.status = 'lost';
            mission.carrying = null;
            mission.nextDeliveryId = null;
            mission.message = 'Meio-dia! Acabou o turno — o almoço esfriou!';
            mission.messageTimer = 4;
          } else {
            mission.clockMinutes = scaled;
          }
        }
      }

      // Reage a eventos escritos em ctx.mission pelo mission.ts
      if (mission.delivered > prevDelivered) {
        audio.playDelivery();
        if (!presentationActive) writeSave(mission);
      }
      prevDelivered = mission.delivered;

      if (mission.stage !== prevStage) {
        if (!presentationActive) writeSave(mission);
        const prevIdx = STAGE_ORDER.indexOf(prevStage);
        const nextIdx = STAGE_ORDER.indexOf(mission.stage);
        prevStage = mission.stage;
        if (nextIdx > prevIdx) {
          audio.playStageFanfare();
          menus.showStageUnlocked(mission.stage);
        }
      }

      if (mission.message && mission.message !== prevWarnMsg) {
        prevWarnMsg = mission.message;
        if (/bloquead|trancad|termine as entregas/i.test(mission.message)) {
          audio.playLocked();
        }
      } else if (!mission.message) {
        prevWarnMsg = '';
      }

      if (mission.status !== prevStatus) {
        prevStatus = mission.status;
        if (mission.status === 'won' || mission.status === 'lost') {
          dayNightModule.update(0);
          enterEndScreen(mission.status);
          world.sky.setPosition(camera.getPosition());
          audio.update(dt, mode, state, mission, false);
          return;
        }
      }

      // Anima rotores do helicóptero e chamas de nitro do carro tunado (rodas já giram em car.ts)
      if (state.vehicle === 'heli') {
        heliRotorAngle = (heliRotorAngle + (420 + state.throttle * 1100) * dt) % 360;
        ctx.plane.prop.setLocalEulerAngles(0, heliRotorAngle, 0);
        ctx.plane.tailRotor?.setLocalEulerAngles((heliRotorAngle * 2.4) % 360, 0, 0);
      }

      const nitroActive = isTunedNitroActive(state);
      if (state.vehicle === 'tuned') {
        const flames = ctx.plane.root.findByName('NitroFlames') as Entity | null;
        if (flames) {
          flames.enabled = nitroActive;
          if (nitroActive) {
            nitroFlamePhase = (nitroFlamePhase + dt * 36) % (Math.PI * 2);
            const flicker = 0.85 + 0.35 * Math.sin(nitroFlamePhase);
            flames.setLocalScale(1, 1, flicker);
          }
        }
      }

      dayNightModule.update(dt);
      cameraRig.update(dt);
      // Sincroniza visibilidade de componentes `model` legados na troca de câmera (cabine)
      const isAircraft = state.vehicle === 'a29' || state.vehicle === 'heli';
      const showExt = !isAircraft || state.camera !== 'cockpit';
      for (let i = 0; i < plane.exterior.length; i++) {
        const modelComp = plane.exterior[i].model;
        if (modelComp && modelComp.enabled !== showExt) modelComp.enabled = showExt;
      }
      markersModule.update(dt);
      dropTarget.update(dt);
      cockpitModule.update(dt);
      hudModule.update(dt);
      smokeModule.update(dt);
      efeitosModule.update(dt);
      dicasModule.update(dt);
    } else if (mode === 'ended' && mission.status === 'won') {
      // Fogos de artifício sobre a UniAcademia na tela de vitória
      efeitosModule.update(dt);
    }
    // Na pausa e no fim de jogo: nenhum módulo de simulação/missão/dia-noite/marcadores atualiza (tudo congelado)

    // Culling por distância para detalhes pequenos e bairros (6 Hz; nunca esconde terreno, vias nem marcos)
    detailCullTick = (detailCullTick + 1) % 10;
    if (detailCullTick === 0) {
      updateDetailDistanceCulling();
    }

    world.sky.setPosition(camera.getPosition());
    audio.update(dt, mode, state, mission, mode === 'playing' && isTunedNitroActive(state));
  };
  app.on('update', onUpdate);

  // Depuração pelo console do navegador
  Object.assign(window, { app, flight: ctx.state, mission: ctx.mission });

  return {
    applyOptions(next: FlightSimOptions) {
      if (destroyed) return;
      simOptions = {
        dayDurationMinutes: clampNum(next.dayDurationMinutes, simOptions.dayDurationMinutes, 2, 60),
        difficulty: next.difficulty !== undefined ? normalizeDifficulty(next.difficulty) : simOptions.difficulty,
        mouseSensitivity: clampNum(next.mouseSensitivity, simOptions.mouseSensitivity, 0.05, 0.4),
        musicVolume: clampNum(next.musicVolume, simOptions.musicVolume, 0, 1),
        sfxVolume: clampNum(next.sfxVolume, simOptions.sfxVolume, 0, 1),
        showMinimap: typeof next.showMinimap === 'boolean' ? next.showMinimap : simOptions.showMinimap,
        showFps: typeof next.showFps === 'boolean' ? next.showFps : simOptions.showFps,
        presentationMode:
          typeof next.presentationMode === 'boolean' ? next.presentationMode : simOptions.presentationMode,
      };
      if (typeof next.dayDurationMinutes === 'number' && Number.isFinite(next.dayDurationMinutes)) {
        baseDayDurationMinutes = simOptions.dayDurationMinutes;
      }
      if (typeof next.presentationMode === 'boolean') {
        presentationActive = next.presentationMode;
        setRuntimePresentationMode(state, presentationActive);
      }
      syncDeliveryDifficulty();
      syncRuntimeDayDuration();
      applyMinimapVisibility();
      if (fpsEl) {
        fpsEl.hidden = !simOptions.showFps;
        if (simOptions.showFps) {
          fpsSamples.length = 0;
          fpsRefreshAccum = 0;
        }
      }
      settings = {
        ...settings,
        mouseSensitivity: simOptions.mouseSensitivity,
        musicVolume: simOptions.musicVolume,
        sfxVolume: simOptions.sfxVolume,
        showFps: simOptions.showFps,
      };
      setRuntimeSettings(state, settings);
      menus.syncSettings(settings);
      audio.applySettings(settings);
      hudModule.update(0);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;

      app.off('update', onUpdate);
      loadingScreen.destroy();
      fpsEl?.remove();
      fpsEl = null;
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('pagehide', onPageHide);
        devMode.destroy();
        desatolarBtn?.remove();
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('pointerlockchange', onPointerLockChange);
      }

      releasePointerLock();
      audio.destroy();
      menus.destroy();
      missionModule?.destroy?.();
      gpsModule.destroy?.();
      trafficModule.destroy?.();
      flightModule.destroy?.();
      dayNightModule.destroy?.();
      cameraRig.destroy?.();
      markersModule.destroy?.();
      dropTarget.destroy?.();
      cockpitModule.destroy?.();
      hudModule.destroy?.();
      smokeModule.destroy?.();
      efeitosModule.destroy?.();
      dicasModule.destroy?.();
      uiRoot.classList?.remove('reduce-motion');
      clearRuntime(state);

      simRoot.destroy();
      for (const mat of materials) mat.destroy();
      for (const tex of textures) tex.destroy();
      materials.clear();
      textures.clear();

      for (let i = restorers.length - 1; i >= 0; i--) restorers[i]();

      app.scene.ambientLight = prevAmbient.clone();
      app.scene.fog.type = prevFog.type;
      app.scene.fog.color = prevFog.color.clone();
      app.scene.fog.density = prevFog.density;
      app.scene.fog.start = prevFog.start;
      app.scene.fog.end = prevFog.end;

      if (graphicsDevice && typeof prevMaxPixelRatio === 'number') {
        graphicsDevice.maxPixelRatio = prevMaxPixelRatio;
        (app as { resizeCanvas?: () => void }).resizeCanvas?.();
      }

      for (const entity of disabledEntities) {
        if (entity.parent) entity.enabled = true;
      }
    },
  };
}
