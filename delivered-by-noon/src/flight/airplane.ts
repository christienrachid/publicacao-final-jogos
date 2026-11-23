import {
  type AppBase,
  type Asset,
  BLEND_NORMAL,
  BoundingBox,
  Color,
  type ContainerResource,
  Entity,
  type GraphNode,
  Mat4,
  type MeshInstance,
  StandardMaterial,
} from 'playcanvas';
import { glbUrl, sanitizeGlbMaterials } from './models/glb';

type PrimitiveType = 'box' | 'cylinder' | 'cone' | 'sphere';

function mat(r: number, g: number, b: number, gloss = 0.55, opacity = 1) {
  const m = new StandardMaterial();
  m.diffuse = new Color(r, g, b);
  m.gloss = gloss;
  if (opacity < 1) {
    m.opacity = opacity;
    m.blendType = BLEND_NORMAL;
    m.depthWrite = false;
  }
  m.update();
  return m;
}

export type AirplaneModel = {
  root: Entity;
  /** Partes externas (escondidas na câmera de cabine). */
  exterior: Entity[];
  prop: Entity;
  /** Pontas das asas, para os rastros. */
  wingTips: [Entity, Entity];
  materials: StandardMaterial[];
  /** Pontos extremos do contorno em coordenadas locais (frente = -Z), para colisão. */
  hitbox: [number, number, number][];
  /** Rodas giratórias (nós "Roda_*") para veículos terrestres. */
  wheels?: Entity[];
  /** Rotor de cauda (nó "TailRotor") para helicópteros. */
  tailRotor?: Entity;
};

const DEFAULT_A29_HITBOX: ReadonlyArray<[number, number, number]> = [
  [-5.57, -0.24, -1.18],
  [-5.57, -0.24, 0.06],
  [5.57, -0.24, -1.18],
  [5.57, -0.24, 0.06],
  [-5.57, -0.09, -1.18],
  [-5.57, -0.09, 0.06],
  [5.57, -0.09, -1.18],
  [5.57, -0.09, 0.06],
  [0, -0.04, -5.87],
  [0, 1.2, -5.24],
  [0, -1.28, -5.24],
  [-1.24, -0.04, -5.24],
  [1.24, -0.04, -5.24],
  [0, -0.93, -4.45],
  [-0.62, -0.71, -0.68],
  [0.62, -0.71, -0.68],
  [0, -0.78, 4.2],
  [0, 1.42, -0.85],
  [0, 1.42, 0.45],
  [-2.07, 0.22, 5.04],
  [2.07, 0.22, 5.04],
  [-2.07, 0.34, 5.04],
  [2.07, 0.34, 5.04],
  [0, 0.08, 5.51],
  [-0.08, 2.96, 4.55],
  [0.08, 2.96, 4.55],
  [-0.08, 2.96, 5.5],
  [0.08, 2.96, 5.5],
];

function cloneDefaultHitbox(): [number, number, number][] {
  return DEFAULT_A29_HITBOX.map(([x, y, z]) => [x, y, z]);
}

function isDescendantOrSelf(node: GraphNode, ancestor: GraphNode): boolean {
  let cur: GraphNode | null = node;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}

function relativeLocalMatrix(node: GraphNode, ancestor: GraphNode, out: Mat4): Mat4 {
  const chain: GraphNode[] = [];
  let cur: GraphNode | null = node;
  while (cur && cur !== ancestor) {
    chain.push(cur);
    cur = cur.parent;
  }
  out.setIdentity();
  const step = new Mat4();
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = chain[i];
    step.setTRS(n.getLocalPosition(), n.getLocalRotation(), n.getLocalScale());
    out.mul(step);
  }
  return out;
}

function collectVisualEntities(rootNode: Entity, out: Entity[] = []): Entity[] {
  if (rootNode.render || rootNode.model) out.push(rootNode);
  const children = rootNode.children;
  for (let i = 0; i < children.length; i++) {
    collectVisualEntities(children[i] as Entity, out);
  }
  return out;
}

function computeLocalAabb(rootNode: Entity): BoundingBox | null {
  const visualEntities = collectVisualEntities(rootNode);
  const relMat = new Mat4();
  const tmpBox = new BoundingBox();
  let total: BoundingBox | null = null;

  const accumulate = (entity: Entity, meshInstances: ReadonlyArray<MeshInstance> | null | undefined) => {
    if (!meshInstances || meshInstances.length === 0) return;
    for (let j = 0; j < meshInstances.length; j++) {
      const mi = meshInstances[j];
      const meshAabb = mi?.mesh?.aabb;
      if (!meshAabb) continue;
      const refNode: GraphNode = mi.node && isDescendantOrSelf(mi.node, rootNode) ? mi.node : entity;
      relativeLocalMatrix(refNode, rootNode, relMat);
      tmpBox.setFromTransformedAabb(meshAabb, relMat);
      if (!total) {
        total = new BoundingBox(tmpBox.center.clone(), tmpBox.halfExtents.clone());
      } else {
        total.add(tmpBox);
      }
    }
  };

  for (let i = 0; i < visualEntities.length; i++) {
    const entity = visualEntities[i];
    accumulate(entity, entity.render?.meshInstances);
    accumulate(entity, entity.model?.meshInstances);
  }
  return total;
}

function buildHitboxFromAabb(aabb: BoundingBox): {
  hitbox: [number, number, number][];
  wingTipY: number;
  wingTipZ: number;
  halfSpan: number;
} {
  const min = aabb.getMin();
  const max = aabb.getMax();

  const span = max.x - min.x;
  const length = max.z - min.z;
  const height = max.y - min.y;
  const cx = (min.x + max.x) * 0.5;
  const halfSpan = span * 0.5;

  // Proporções do contorno do A-29 derivadas do AABB real do GLB (frente = -Z, cima = +Y)
  const wingZFront = min.z + length * 0.41;
  const wingZBack = min.z + length * 0.52;
  const wingTipYLow = min.y + height * 0.18;
  const wingTipYHigh = min.y + height * 0.22;
  const wingTipY = (wingTipYLow + wingTipYHigh) * 0.5;
  const wingTipZ = (wingZFront + wingZBack) * 0.5;

  const propZ = min.z + length * 0.055;
  const propY = min.y + height * 0.23;
  // Keep the estimated disc inside the mesh bounds when the GLB origin is at its wheels.
  const propR = Math.min(halfSpan * 0.23, height * 0.32, propY - min.y);

  const bellyY = min.y;
  const canopyY = min.y + height * 0.6;
  const hStabHalfSpan = halfSpan * 0.37;
  const hStabZ = max.z - length * 0.04;
  const hStabYLow = min.y + height * 0.29;
  const hStabYHigh = min.y + height * 0.33;
  const finZFront = max.z - length * 0.085;
  const finZBack = max.z;

  const hitbox: [number, number, number][] = [
    // Pontas das asas (faces inferior e superior, bordo de ataque e fuga)
    [min.x, wingTipYLow, wingZFront],
    [min.x, wingTipYLow, wingZBack],
    [max.x, wingTipYLow, wingZFront],
    [max.x, wingTipYLow, wingZBack],
    [min.x, wingTipYHigh, wingZFront],
    [min.x, wingTipYHigh, wingZBack],
    [max.x, wingTipYHigh, wingZFront],
    [max.x, wingTipYHigh, wingZBack],
    // Nariz / spinner e extremos do disco da hélice
    [cx, propY, min.z],
    [cx, propY + propR, propZ],
    [cx, propY - propR, propZ],
    [cx - propR, propY, propZ],
    [cx + propR, propY, propZ],
    // Ventre / entrada de ar e barbatana ventral
    [cx, bellyY, min.z + length * 0.125],
    [cx - halfSpan * 0.11, min.y + height * 0.06, wingTipZ],
    [cx + halfSpan * 0.11, min.y + height * 0.06, wingTipZ],
    [cx, hStabYLow, max.z - length * 0.115],
    // Topo do canopy (voo invertido)
    [cx, canopyY, min.z + length * 0.44],
    [cx, canopyY, min.z + length * 0.55],
    // Estabilizador horizontal e cone de cauda
    [cx - hStabHalfSpan, hStabYLow, hStabZ],
    [cx + hStabHalfSpan, hStabYLow, hStabZ],
    [cx - hStabHalfSpan, hStabYHigh, hStabZ],
    [cx + hStabHalfSpan, hStabYHigh, hStabZ],
    [cx, propY + height * 0.03, max.z],
    // Topo da deriva
    [cx - 0.08, max.y, finZFront],
    [cx + 0.08, max.y, finZFront],
    [cx - 0.08, max.y, finZBack],
    [cx + 0.08, max.y, finZBack],
  ];

  return { hitbox, wingTipY, wingTipZ, halfSpan };
}

function findGlbAsset(app: AppBase): Asset | null {
  const assets = app.assets;
  if (!assets) return null;
  if (assets.find?.('a29.glb.bin', 'binary')) return null; // cópia binária atual vence o container velho do Editor
  const direct = assets.find?.('a29.glb', 'container');
  if (direct) return direct;
  const matches = assets.filter?.((a) => {
    if (a.type !== 'container') return false;
    const name = (a.name ?? '').toLowerCase();
    const file = ((a.file as { filename?: string } | null)?.filename ?? '').toLowerCase();
    return name === 'a29.glb' || name === 'a29' || file.endsWith('a29.glb');
  });
  return matches?.[0] ?? null;
}

/**
 * Turboélice low-poly original na silhueta do A-29 Super Tucano (escala real).
 * Carrega `models/a29.glb` (ou asset container `a29.glb` no Editor) de forma assíncrona,
 * mantendo a versão procedural como fallback imediato no quadro zero.
 * Frente = -Z local. Envergadura ~11.14 m, comprimento ~11.38 m, altura ~3.89 m.
 */
export function buildAirplane(app: AppBase, parent: Entity = app.root): AirplaneModel {
  const white = mat(0.95, 0.96, 0.98, 0.65);
  const blue = mat(0.08, 0.25, 0.62, 0.68);
  const yellow = mat(0.95, 0.76, 0.12, 0.65);
  const dark = mat(0.14, 0.16, 0.2, 0.45);
  const seat = mat(0.24, 0.27, 0.32, 0.35);
  const glass = mat(0.28, 0.5, 0.68, 0.92, 0.45);
  const materials = [white, blue, yellow, dark, seat, glass];

  const root = new Entity('Airplane', app);
  parent.addChild(root);

  const procedural = new Entity('ProceduralA29', app);
  root.addChild(procedural);

  const exterior: Entity[] = [];

  const part = (
    name: string,
    m: StandardMaterial,
    p: [number, number, number],
    s: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    targetParent: Entity = procedural,
    type: PrimitiveType = 'box',
  ) => {
    const e = new Entity(name, app);
    e.addComponent('render', { type, material: m });
    e.setLocalScale(...s);
    e.setLocalPosition(...p);
    e.setLocalEulerAngles(...rot);
    targetParent.addChild(e);
    exterior.push(e);
    return e;
  };

  // --- Fuselagem central (sob a cabine em tandem) ---
  part('fuselageCore', white, [0, 0.02, -0.25], [1.24, 1.32, 3.65]);
  part('fuselageBelly', blue, [0, -0.58, -0.25], [1.14, 0.26, 3.68]);
  part('fuselageStripeBlue', blue, [0, 0.08, -0.25], [1.27, 0.34, 3.66]);
  part('fuselageStripeYellow', yellow, [0, -0.13, -0.25], [1.27, 0.12, 3.66]);

  // --- Nariz longo de turboélice (-Z) ---
  part('noseRear', white, [0, 0.04, -2.95], [1.12, 1.18, 2.0]);
  part('noseTopRear', blue, [0, 0.56, -2.98], [0.96, 0.18, 2.02]);
  part('noseStripeRearBlue', blue, [0, 0.06, -2.95], [1.15, 0.3, 2.01]);
  part('noseStripeRearYellow', yellow, [0, -0.13, -2.95], [1.15, 0.11, 2.01]);

  part('noseMid', blue, [0, -0.02, -4.4], [0.88, 0.96, 1.15]);
  part('noseStripeMidYellow', yellow, [0, -0.14, -4.4], [0.91, 0.11, 1.08]);
  part('noseTipCone', blue, [0, -0.04, -5.05], [0.74, 0.48, 0.78], [-90, 0, 0], procedural, 'cone');

  // Spinner pontiagudo com anel amarelo
  part('spinnerBase', yellow, [0, -0.04, -5.18], [0.58, 0.14, 0.58], [90, 0, 0], procedural, 'cylinder');
  part('spinnerCone', white, [0, -0.04, -5.56], [0.56, 0.62, 0.56], [-90, 0, 0], procedural, 'cone');

  // Entrada de ar proeminente sob o nariz
  part('intakeHousing', white, [0, -0.66, -4.35], [0.54, 0.44, 1.55]);
  part('intakeLip', blue, [0, -0.84, -4.45], [0.48, 0.18, 1.38]);
  part('intakeMouth', dark, [0, -0.68, -5.13], [0.44, 0.3, 0.08]);
  part('intakeDuct', blue, [0, -0.6, -2.85], [0.62, 0.34, 1.65]);

  // Escapamentos laterais do motor turboélice
  for (const side of [-1, 1] as const) {
    part(
      side < 0 ? 'exhaustL' : 'exhaustR',
      dark,
      [side * 0.52, -0.06, -4.48],
      [0.14, 0.36, 0.14],
      [80, side * 28, 0],
      procedural,
      'cylinder',
    );
  }

  // --- Cabine em tandem (dois assentos escalonados sob canopy longo) ---
  part('cockpitTub', dark, [0, 0.56, -0.25], [0.84, 0.34, 3.05]);
  part('frontGlareShield', dark, [0, 0.8, -1.52], [0.74, 0.24, 0.42]);
  part('seatFrontBack', seat, [0, 0.9, -0.82], [0.5, 0.58, 0.16], [-12, 0, 0]);
  part('seatFrontHead', dark, [0, 1.18, -0.76], [0.34, 0.18, 0.18]);
  part('rearGlareShield', dark, [0, 0.92, -0.14], [0.7, 0.24, 0.36]);
  part('seatRearBack', seat, [0, 1.04, 0.64], [0.5, 0.6, 0.16], [-12, 0, 0]);
  part('seatRearHead', dark, [0, 1.32, 0.7], [0.34, 0.18, 0.18]);
  part('canopyBowFront', dark, [0, 0.96, -1.48], [0.88, 0.08, 0.08]);
  part('canopyBowMid', dark, [0, 1.24, -0.1], [0.86, 0.07, 0.08]);
  part('canopyRailL', dark, [-0.47, 0.72, -0.2], [0.06, 0.08, 3.15]);
  part('canopyRailR', dark, [0.47, 0.72, -0.2], [0.06, 0.08, 3.15]);
  part('canopyBubble', glass, [0, 0.88, -0.18], [0.98, 1.08, 3.45], [0, 0, 0], procedural, 'sphere');
  part('canopyFairing', blue, [0, 0.78, 1.65], [0.76, 0.58, 1.15], [-14, 0, 0]);

  // --- Fuselagem traseira afilada e bocal de fumaça ---
  part('tailMid', white, [0, 0.08, 2.55], [0.94, 1.04, 2.25]);
  part('tailMidStripeBlue', blue, [0, 0.14, 2.55], [0.97, 0.34, 2.26]);
  part('tailMidStripeYellow', yellow, [0, -0.06, 2.55], [0.97, 0.12, 2.26]);
  part('tailAft', blue, [0, 0.1, 4.35], [0.64, 0.72, 1.65]);
  part('tailCone', blue, [0, 0.08, 5.28], [0.48, 0.46, 0.52], [90, 0, 0], procedural, 'cone');
  part('smokeNozzle', dark, [0, 0.05, 5.34], [0.12, 0.24, 0.12], [90, 0, 0], procedural, 'cylinder');
  part('ventralFin', blue, [0, -0.44, 4.2], [0.08, 0.48, 1.45], [-10, 0, 0]);

  // --- Empenagem (deriva alta com dorsal fin + estabilizador horizontal) ---
  part('dorsalFin', blue, [0, 0.88, 3.05], [0.12, 0.62, 1.85], [16, 0, 0]);
  part('finBase', blue, [0, 1.45, 4.35], [0.16, 1.65, 1.55], [-18, 0, 0]);
  part('finUpper', blue, [0, 2.38, 4.82], [0.13, 1.05, 1.12], [-18, 0, 0]);
  part('finBandYellow', yellow, [0, 2.1, 4.7], [0.15, 0.22, 1.24], [-18, 0, 0]);
  part('finBandWhite', white, [0, 1.86, 4.58], [0.15, 0.14, 1.32], [-18, 0, 0]);
  part('finTip', yellow, [0, 2.9, 5.02], [0.14, 0.12, 0.96]);

  part('hStabCenter', white, [0, 0.28, 4.58], [2.6, 0.12, 1.02]);
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'L' : 'R';
    part(`hStabOuter${tag}`, blue, [side * 1.62, 0.28, 4.65], [0.76, 0.11, 0.82]);
    part(`hStabTip${tag}`, yellow, [side * 2.0, 0.28, 4.68], [0.14, 0.11, 0.72]);
  }

  // --- Asa baixa reta (envergadura 11.14 m, diedro sutil de 4°) ---
  part('wingCenter', white, [0, -0.45, -0.68], [2.8, 0.22, 2.15]);
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'L' : 'R';
    const dihedral = side * 4;
    part(`wingInner${tag}`, white, [side * 2.6, -0.37, -0.64], [2.55, 0.19, 1.88], [0, 0, dihedral]);
    part(`wingBand${tag}`, yellow, [side * 3.72, -0.29, -0.61], [0.32, 0.2, 1.66], [0, 0, dihedral]);
    part(`wingOuter${tag}`, blue, [side * 4.55, -0.23, -0.58], [1.55, 0.15, 1.48], [0, 0, dihedral]);
    part(`wingTipCap${tag}`, yellow, [side * 5.44, -0.17, -0.56], [0.28, 0.13, 1.24], [0, 0, dihedral]);
    part(`gearBay${tag}`, dark, [side * 1.75, -0.53, -0.78], [0.75, 0.04, 0.55], [0, 0, dihedral]);
  }
  part('gearBayNose', dark, [0, -0.68, -2.55], [0.38, 0.04, 0.9]);

  // --- Hélice de 5 pás (gira em torno de Z) ---
  const prop = new Entity('prop', app);
  prop.setLocalPosition(0, -0.04, -5.24);
  procedural.addChild(prop);
  for (let i = 0; i < 5; i++) {
    const deg = i * 72;
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const midR = 0.68;
    const tipR = 1.18;
    part(`blade${i}`, dark, [-sin * midR, cos * midR, 0], [0.15, 1.04, 0.035], [0, 0, deg], prop);
    part(`bladeTip${i}`, yellow, [-sin * tipR, cos * tipR, 0], [0.145, 0.14, 0.038], [0, 0, deg], prop);
  }

  const tipL = new Entity('wingTipL', app);
  tipL.setLocalPosition(-5.57, -0.16, -0.56);
  const tipR = new Entity('wingTipR', app);
  tipR.setLocalPosition(5.57, -0.16, -0.56);
  root.addChild(tipL);
  root.addChild(tipR);

  // Contorno em coordenadas locais (frente = -Z), cobrindo também voo invertido
  const hitbox: [number, number, number][] = cloneDefaultHitbox();

  const model: AirplaneModel = { root, exterior, prop, wingTips: [tipL, tipR], materials, hitbox };

  // Carregamento assíncrono do GLB (Editor: asset "a29.glb"; local: `${BASE_URL}models/a29.glb`)
  let destroyed = false;
  let glbApplied = false;
  root.once('destroy', () => {
    destroyed = true;
  });

  function applyGlbContainer(resource: ContainerResource) {
    if (destroyed || glbApplied || !root.parent || typeof resource.instantiateRenderEntity !== 'function') return;
    const glbRoot = resource.instantiateRenderEntity({ castShadows: false, receiveShadows: false });
    if (!glbRoot) return;
    sanitizeGlbMaterials(glbRoot);
    glbApplied = true;

    const showExterior = exterior.length === 0 ? true : (exterior[0].render?.enabled ?? true);
    const propEuler = model.prop.getLocalEulerAngles().clone();

    root.addChild(glbRoot);

    // Coleta todas as entidades renderizáveis do GLB e preserva visibilidade (ex.: modo cabine)
    const glbExterior = collectVisualEntities(glbRoot);
    for (let i = 0; i < glbExterior.length; i++) {
      const render = glbExterior[i].render;
      if (render) render.enabled = showExterior;
    }

    // Troca a referência da hélice para o nó "Prop" do GLB
    const glbProp =
      (glbRoot.findByName('Prop') as Entity | null) ??
      (glbRoot.findByName('prop') as Entity | null);
    if (glbProp) {
      glbProp.setLocalEulerAngles(propEuler.x, propEuler.y, propEuler.z);
      model.prop = glbProp;
    } else {
      const fallbackProp = new Entity('Prop', app);
      fallbackProp.setLocalPosition(0, -0.04, -5.24);
      fallbackProp.setLocalEulerAngles(propEuler.x, propEuler.y, propEuler.z);
      glbRoot.addChild(fallbackProp);
      model.prop = fallbackProp;
    }

    // Recalcula hitbox e pontas das asas a partir do AABB real do GLB
    const aabb = computeLocalAabb(glbRoot);
    if (aabb && aabb.halfExtents.x > 0.5 && aabb.halfExtents.z > 0.5 && aabb.halfExtents.y > 0.2) {
      const derived = buildHitboxFromAabb(aabb);
      hitbox.length = 0;
      for (let i = 0; i < derived.hitbox.length; i++) hitbox.push(derived.hitbox[i]);
      tipL.setLocalPosition(-derived.halfSpan, derived.wingTipY, derived.wingTipZ);
      tipR.setLocalPosition(derived.halfSpan, derived.wingTipY, derived.wingTipZ);
    }

    // Registra materiais do GLB na lista do modelo sem duplicar
    const resMats = (resource as { materials?: Asset[] }).materials;
    if (Array.isArray(resMats)) {
      for (let i = 0; i < resMats.length; i++) {
        const resMat = resMats[i]?.resource;
        if (resMat instanceof StandardMaterial && !materials.includes(resMat)) {
          materials.push(resMat);
        }
      }
    }

    // Atualiza exterior in-place e remove o modelo procedural de fallback
    exterior.length = 0;
    for (let i = 0; i < glbExterior.length; i++) exterior.push(glbExterior[i]);
    procedural.destroy();
  }

  if (app.assets) {
    const editorAsset = findGlbAsset(app);
    if (editorAsset) {
      if (editorAsset.resource) {
        applyGlbContainer(editorAsset.resource as ContainerResource);
      } else {
        editorAsset.ready((loaded) => {
          if (loaded.resource) applyGlbContainer(loaded.resource as ContainerResource);
        });
        app.assets.load(editorAsset);
      }
    } else if (typeof app.assets.loadFromUrl === 'function') {
      const url = glbUrl(app, 'a29.glb');
      try {
        app.assets.loadFromUrl(url, 'container', (err, asset) => {
          if (err || !asset?.resource) return;
          applyGlbContainer(asset.resource as ContainerResource);
        });
      } catch {
        // Sem arquivo ou sem loader de container: mantém o fallback procedural
      }
    }
  }

  return model;
}

/**
 * Vincula uma entidade já montada na cena do Editor (ex.: "A29") ao contrato AirplaneModel,
 * sem criar duplicatas nem destruir os materiais dos assets da cena.
 */
export function bindSceneAirplane(
  app: AppBase,
  sceneRoot: Entity,
): { model: AirplaneModel; cleanup(): void } {
  sceneRoot.enabled = true;
  const createdHelpers: Entity[] = [];
  const exterior = collectVisualEntities(sceneRoot);

  // Se a entidade da cena estiver vazia (sem malhas render nem model), anexa o modelo padrão como filho temporário
  if (exterior.length === 0) {
    const built = buildAirplane(app, sceneRoot);
    built.root.setLocalPosition(0, 0, 0);
    built.root.setLocalEulerAngles(0, 0, 0);
    built.root.setLocalScale(1, 1, 1);
    return {
      model: {
        root: sceneRoot,
        exterior: built.exterior,
        prop: built.prop,
        wingTips: built.wingTips,
        materials: built.materials,
        hitbox: built.hitbox,
      },
      cleanup() {
        built.root.destroy();
      },
    };
  }

  let prop: Entity | null =
    (sceneRoot.findByName('Prop') as Entity | null) ??
    (sceneRoot.findByName('prop') as Entity | null);
  // No componente legado `model`, o nó "Prop" pode estar no grafo interno do modelo
  if (!prop) {
    for (let i = 0; i < exterior.length; i++) {
      const graph = exterior[i].model?.model?.graph;
      const found = graph?.findByName('Prop') ?? graph?.findByName('prop') ?? null;
      if (found) {
        prop = found as unknown as Entity;
        break;
      }
    }
  }
  if (!prop) {
    prop = new Entity('Prop', app);
    prop.setLocalPosition(0, -0.04, -5.24);
    sceneRoot.addChild(prop);
    createdHelpers.push(prop);
  }

  let tipL = sceneRoot.findByName('wingTipL') as Entity | null;
  if (!tipL) {
    tipL = new Entity('wingTipL', app);
    tipL.setLocalPosition(-5.57, -0.16, -0.56);
    sceneRoot.addChild(tipL);
    createdHelpers.push(tipL);
  }

  let tipR = sceneRoot.findByName('wingTipR') as Entity | null;
  if (!tipR) {
    tipR = new Entity('wingTipR', app);
    tipR.setLocalPosition(5.57, -0.16, -0.56);
    sceneRoot.addChild(tipR);
    createdHelpers.push(tipR);
  }

  let hitbox = cloneDefaultHitbox();
  const aabb = computeLocalAabb(sceneRoot);
  if (aabb && aabb.halfExtents.x > 0.5 && aabb.halfExtents.z > 0.5 && aabb.halfExtents.y > 0.2) {
    const derived = buildHitboxFromAabb(aabb);
    hitbox = derived.hitbox;
    tipL.setLocalPosition(-derived.halfSpan, derived.wingTipY, derived.wingTipZ);
    tipR.setLocalPosition(derived.halfSpan, derived.wingTipY, derived.wingTipZ);
  }

  const model: AirplaneModel = {
    root: sceneRoot,
    exterior,
    prop,
    wingTips: [tipL, tipR],
    // Materiais pertencem aos assets da cena do Editor; não devem ser destruídos ao sair
    materials: [],
    hitbox,
  };

  return {
    model,
    cleanup() {
      for (let i = 0; i < exterior.length; i++) {
        const render = exterior[i].render;
        if (render) render.enabled = true;
        const modelComp = exterior[i].model;
        if (modelComp) modelComp.enabled = true;
      }
      for (let i = 0; i < createdHelpers.length; i++) {
        createdHelpers[i].destroy();
      }
    },
  };
}
