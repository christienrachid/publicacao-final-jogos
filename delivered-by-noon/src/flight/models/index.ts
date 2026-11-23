// CONTRATO (dono: maestro; implementação: Gemini). Ponto único para criar o modelo de qualquer veículo.
// O gerenciador de veículos (vehicles.ts, Codex) só chama buildVehicleModel; mantém assinatura intacta.
import { type AppBase, BLEND_ADDITIVE, Color, Entity, StandardMaterial } from 'playcanvas';
import { type AirplaneModel, buildAirplane } from '../airplane';
import { buildHelicopter } from '../helicopter';
import type { VehicleKind } from '../types';
import { attachAsyncGlb, collectNodesByPrefix, makeMaterial } from './glb';

/** Mesmo formato do AirplaneModel: root, exterior, prop (hélice/rotor), wingTips, materials, hitbox, wheels?, tailRotor?. */
export type VehicleModel = AirplaneModel;

export type LandmarkKind = 'uniacademia';

const CAR_VARIANTS: ReadonlyArray<{
  filename: string;
  label: string;
  body: [number, number, number];
  accent: [number, number, number];
  rim: [number, number, number];
  size: [number, number, number];
  wheelRadius: number;
  wheelX: number;
  wheelZ: number;
  hasBed?: boolean;
  hasWing?: boolean;
  isHatch?: boolean;
}> = [
  {
    filename: 'carro.glb',
    label: 'Hatch',
    body: [0.94, 0.95, 0.97],
    accent: [0.06, 0.065, 0.08],
    rim: [0.18, 0.19, 0.22],
    size: [1.73, 1.44, 4.07], // Fiesta ST branco
    wheelRadius: 0.3,
    wheelX: 0.72,
    wheelZ: 1.2,
    isHatch: true,
  },
  {
    filename: 'carro-picape.glb',
    label: 'Picape',
    body: [0.84, 0.42, 0.1],
    accent: [0.16, 0.18, 0.2],
    rim: [0.78, 0.8, 0.84],
    size: [1.85, 1.68, 4.45],
    wheelRadius: 0.33,
    wheelX: 0.74,
    wheelZ: 1.32,
    hasBed: true,
  },
  {
    filename: 'carro-esportivo.glb',
    label: 'Esportivo',
    body: [0.86, 0.16, 0.14],
    accent: [0.96, 0.96, 0.98],
    rim: [0.78, 0.8, 0.84],
    size: [1.83, 1.4, 4.5],
    wheelRadius: 0.31,
    wheelX: 0.73,
    wheelZ: 1.26,
    hasWing: true,
  },
  {
    filename: 'carro-compacto.glb',
    label: 'Compacto',
    body: [0.86, 0.88, 0.91],
    accent: [0.12, 0.13, 0.16],
    rim: [0.68, 0.7, 0.74],
    size: [1.8, 1.4, 3.9],
    wheelRadius: 0.3,
    wheelX: 0.7,
    wheelZ: 1.24,
    isHatch: true,
  },
];

function makeGlowMaterial(
  r: number,
  g: number,
  b: number,
  opacity: number,
  intensity = 1.6,
): StandardMaterial {
  const m = new StandardMaterial();
  m.useLighting = false;
  m.diffuse = new Color(0, 0, 0);
  m.emissive = new Color(r, g, b);
  m.emissiveIntensity = intensity;
  m.opacity = opacity;
  m.blendType = BLEND_ADDITIVE;
  m.depthWrite = false;
  m.update();
  return m;
}

/**
 * Faróis leves (lentes emissivas + cones aditivos no asfalto, sem luzes dinâmicas)
 * anexados direto ao `root` para sobreviver à troca assíncrona de GLB e acender à noite via daynight.ts.
 */
function attachCarHeadlights(
  app: AppBase,
  root: Entity,
  materials: StandardMaterial[],
  width: number,
  lensY: number,
  frontZ: number,
  tint: [number, number, number] = [1.0, 0.95, 0.78],
): void {
  const group = new Entity('CarHeadlights', app);
  group.enabled = false;
  root.addChild(group);

  const mLens = makeGlowMaterial(tint[0], tint[1], tint[2], 0.92, 2.4);
  const mBeam = makeGlowMaterial(tint[0], tint[1], tint[2], 0.22, 1.4);
  materials.push(mLens, mBeam);

  for (const s of [-1, 1] as const) {
    const lx = s * (width * 0.34);

    const lens = new Entity(`HeadlightGlow_${s < 0 ? 'L' : 'R'}`, app);
    lens.addComponent('render', { type: 'box', material: mLens, castShadows: false, receiveShadows: false });
    lens.setLocalScale(0.36, 0.14, 0.08);
    lens.setLocalPosition(lx, lensY, frontZ - 0.05);
    group.addChild(lens);

    // Feixe projetado no asfalto à frente (-Z local)
    const beam = new Entity(`HeadlightBeam_${s < 0 ? 'L' : 'R'}`, app);
    beam.addComponent('render', { type: 'plane', material: mBeam, castShadows: false, receiveShadows: false });
    beam.setLocalScale(2.1, 1, 11.5);
    beam.setLocalPosition(lx * 1.18, 0.09, frontZ - 6.0);
    beam.setLocalEulerAngles(0, s * -5, 0);
    group.addChild(beam);
  }
}

function buildCar(app: AppBase, variant: number, parent: Entity): VehicleModel {
  const idx = ((Math.floor(variant) % CAR_VARIANTS.length) + CAR_VARIANTS.length) % CAR_VARIANTS.length;
  const spec = CAR_VARIANTS[idx];

  const mBody = makeMaterial(...spec.body, 0.76);
  const mAccent = makeMaterial(...spec.accent, 0.68);
  const mGlass = makeMaterial(0.05, 0.08, 0.13, 0.92);
  const mDark = makeMaterial(0.09, 0.1, 0.12, 0.38);
  const mRim = makeMaterial(...spec.rim, 0.8);
  const mHead = makeMaterial(0.95, 0.97, 1.0, 0.9);
  const mTail = makeMaterial(0.88, 0.1, 0.08, 0.82);
  const materials: StandardMaterial[] = [mBody, mAccent, mGlass, mDark, mRim, mHead, mTail];

  const root = new Entity(`Carro_${spec.label}`, app);
  parent.addChild(root);

  const procedural = new Entity(`Procedural_${spec.label}`, app);
  root.addChild(procedural);
  const exterior: Entity[] = [];

  const part = (
    name: string,
    m: StandardMaterial,
    p: [number, number, number],
    s: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    target: Entity = procedural,
    type: 'box' | 'cylinder' = 'box',
  ) => {
    const e = new Entity(name, app);
    e.addComponent('render', { type, material: m, castShadows: false, receiveShadows: false });
    e.setLocalScale(...s);
    e.setLocalPosition(...p);
    e.setLocalEulerAngles(...rot);
    target.addChild(e);
    exterior.push(e);
    return e;
  };

  const [w, h, l] = spec.size;
  const r = spec.wheelRadius;
  const bodyH = spec.hasWing ? 0.44 : spec.isHatch ? 0.5 : 0.56;
  const bodyY = r + bodyH * 0.48;

  part('chassis', mBody, [0, bodyY, 0], [w, bodyH, l]);
  part('bumperF', mDark, [0, r + 0.06, -l * 0.5], [w + 0.02, 0.18, 0.14]);
  part('bumperR', mDark, [0, r + 0.06, l * 0.5], [w + 0.02, 0.18, 0.14]);

  // Cabine conforme variante (Hatch 5 portas / Picape / Esportivo)
  if (spec.hasBed) {
    part('cabin', mGlass, [0, bodyY + 0.62, -0.22], [w * 0.9, 0.68, 1.55]);
    part('roof', mBody, [0, h - 0.05, -0.2], [w * 0.88, 0.1, 1.5]);
    part('bedFloor', mAccent, [0, bodyY + 0.26, 1.48], [w * 0.86, 0.08, 1.7]);
    part('rollbar', mAccent, [0, h - 0.06, 0.66], [w * 0.88, 0.09, 0.1]);
  } else if (spec.hasWing) {
    part('cabin', mGlass, [0, bodyY + 0.44, 0.24], [w * 0.78, 0.44, 1.75]);
    part('roof', mBody, [0, h - 0.03, 0.22], [w * 0.7, 0.07, 1.25]);
    part('stripe', mAccent, [0, bodyY + bodyH * 0.52, -0.05], [0.34, 0.03, l * 0.92]);
    part('spoiler', mDark, [0, 1.06, l * 0.45], [w * 0.96, 0.06, 0.32], [8, 0, 0]);
  } else {
    // Hatch 5 portas branco com teto escuro, grade trapezoidal grande e faróis puxados
    part('hood', mBody, [0, bodyY + 0.26, -1.2], [w * 0.88, 0.15, 1.2], [8, 0, 0]);
    part('cabin', mGlass, [0, bodyY + 0.56, 0.24], [w * 0.84, 0.54, 2.2]);
    part('roof', mAccent, [0, h - 0.03, 0.32], [w * 0.74, 0.07, 1.62]);
    part('hatchSpoiler', mBody, [0, h - 0.04, 1.68], [w * 0.76, 0.07, 0.26], [-6, 0, 0]);
    part('grille', mDark, [0, 0.48, -l * 0.505], [0.96, 0.34, 0.08]);
  }

  for (const s of [-1, 1] as const) {
    if (spec.isHatch) {
      part(`headlight_${s < 0 ? 'L' : 'R'}`, mHead, [s * 0.64, 0.68, -l * 0.46], [0.34, 0.13, 0.52], [10, s * 22, 0]);
      part(`taillight_${s < 0 ? 'L' : 'R'}`, mTail, [s * 0.72, 0.92, l * 0.47], [0.22, 0.4, 0.18]);
    } else {
      part(`headlight_${s < 0 ? 'L' : 'R'}`, mHead, [s * (w * 0.34), bodyY + 0.08, -l * 0.5], [0.34, 0.14, 0.08]);
      part(`taillight_${s < 0 ? 'L' : 'R'}`, mTail, [s * (w * 0.35), bodyY + 0.1, l * 0.5], [0.32, 0.16, 0.08]);
    }
  }

  // 4 rodas separadas ("Roda_*") para girar em X
  const wheelSpecs: ReadonlyArray<[string, number, number]> = [
    ['Roda_FL', -spec.wheelX, -spec.wheelZ],
    ['Roda_FR', spec.wheelX, -spec.wheelZ],
    ['Roda_RL', -spec.wheelX, spec.wheelZ],
    ['Roda_RR', spec.wheelX, spec.wheelZ],
  ];
  const wheels: Entity[] = [];
  for (const [wName, wx, wz] of wheelSpecs) {
    const wheel = new Entity(wName, app);
    wheel.setLocalPosition(wx, r, wz);
    procedural.addChild(wheel);
    part(`${wName}_tire`, mDark, [0, 0, 0], [r * 2, 0.22, r * 2], [0, 0, 90], wheel, 'cylinder');
    part(`${wName}_rim`, mRim, [0, 0, 0], [r * 1.38, 0.24, r * 1.38], [0, 0, 90], wheel, 'cylinder');
    wheels.push(wheel);
  }

  attachCarHeadlights(app, root, materials, w, spec.isHatch ? 0.68 : bodyY + 0.08, -l * 0.5);

  const prop = new Entity('prop', app);
  root.addChild(prop);

  const tipL = new Entity('wingTipL', app);
  const tipR = new Entity('wingTipR', app);
  tipL.setLocalPosition(-w * 0.5, h * 0.5, 0);
  tipR.setLocalPosition(w * 0.5, h * 0.5, 0);
  root.addChild(tipL);
  root.addChild(tipR);

  const hitbox: [number, number, number][] = [];
  for (const x of [-w * 0.5, w * 0.5]) {
    for (const y of [0, h]) {
      for (const z of [-l * 0.5, l * 0.5]) hitbox.push([x, y, z]);
    }
  }

  const model: VehicleModel = {
    root,
    exterior,
    prop,
    wingTips: [tipL, tipR],
    materials,
    hitbox,
    wheels,
  };

  attachAsyncGlb({
    app,
    root,
    procedural,
    model,
    filename: spec.filename,
    trimCarOutliers: true,
    onMounted(glbRoot) {
      const glbWheels = collectNodesByPrefix(glbRoot, 'roda_');
      if (glbWheels.length > 0) {
        wheels.length = 0;
        for (let i = 0; i < glbWheels.length; i++) wheels.push(glbWheels[i]);
      }
    },
  });

  return model;
}

/**
 * Coupé Tunado ("Coupé Tunado", kind "tuned"): cupê 2 portas cinza grafite rebaixado,
 * alargadores de para-lama, entradas no capô, aerofólio traseiro, grade dupla genérica,
 * faróis duplos, rodas largas cromadas e gaiola de proteção visível pelo vidro.
 * Carrega `carro-tunado.glb` com fallback procedural imediato.
 */
function buildTunedCar(app: AppBase, parent: Entity): VehicleModel {
  const mBody = makeMaterial(0.22, 0.24, 0.27, 0.78);
  const mCarbon = makeMaterial(0.07, 0.075, 0.09, 0.48);
  const mGlass = makeMaterial(0.06, 0.1, 0.15, 0.94, 0.45);
  const mCage = makeMaterial(0.94, 0.34, 0.08, 0.6);
  const mChrome = makeMaterial(0.9, 0.92, 0.96, 0.94);
  const mCaliper = makeMaterial(0.92, 0.14, 0.14, 0.75);
  const mHead = makeMaterial(0.94, 0.97, 1.0, 0.95);
  mHead.emissive = new Color(0.8, 0.92, 1.0);
  mHead.update();

  const mTail = makeMaterial(0.88, 0.09, 0.1, 0.88);
  mTail.emissive = new Color(0.75, 0.06, 0.08);
  mTail.update();

  const mNitroFlame = makeGlowMaterial(0.24, 0.86, 1.0, 0.9, 3.0);

  const materials: StandardMaterial[] = [
    mBody,
    mCarbon,
    mGlass,
    mCage,
    mChrome,
    mCaliper,
    mHead,
    mTail,
    mNitroFlame,
  ];

  const root = new Entity('Carro_Tunado', app);
  parent.addChild(root);

  const procedural = new Entity('Procedural_CoupeTunado', app);
  root.addChild(procedural);

  const exterior: Entity[] = [];
  const part = (
    name: string,
    m: StandardMaterial,
    p: [number, number, number],
    s: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    target: Entity = procedural,
    type: 'box' | 'cylinder' | 'plane' | 'cone' = 'box',
  ) => {
    const e = new Entity(name, app);
    e.addComponent('render', { type, material: m, castShadows: false, receiveShadows: false });
    e.setLocalScale(...s);
    e.setLocalPosition(...p);
    e.setLocalEulerAngles(...rot);
    target.addChild(e);
    exterior.push(e);
    return e;
  };

  const w = 1.80; // Esportivo (911 GT3): medidas da carroceria do GLB
  const h = 1.2;
  const l = 4.57;
  const r = 0.32;
  const wheelX = 0.7;
  const wheelZ = 1.32;

  // Carroceria cupê 2 portas cinza grafite rebaixada
  part('chassis', mBody, [0, 0.52, 0], [1.62, 0.46, 4.38]);
  part('hood', mBody, [0, 0.77, -1.32], [1.56, 0.12, 1.56], [3, 0, 0]);
  part('trunk', mBody, [0, 0.79, 1.68], [1.56, 0.14, 0.96]);
  part('roof', mBody, [0, 1.27, 0.34], [1.28, 0.065, 1.32]);

  // Gaiola de proteção visível através do vidro semitransparente
  part('cageBarTop', mCage, [0, 1.16, 0.52], [1.06, 0.05, 0.05]);
  part('cageBarDiag', mCage, [0, 0.96, 0.52], [1.08, 0.045, 0.045], [0, 0, 22]);
  for (const s of [-1, 1] as const) {
    part(`cagePost_${s < 0 ? 'L' : 'R'}`, mCage, [s * 0.52, 0.95, 0.52], [0.05, 0.48, 0.05]);
  }
  part('cabin', mGlass, [0, 1.0, 0.3], [1.44, 0.44, 1.96]);

  // Alargadores de para-lama, entradas no capô, saias, splitter, aerofólio e grade dupla genérica
  for (const [fName, fx, fz] of [
    ['fender_FL', -0.96, -wheelZ],
    ['fender_FR', 0.96, -wheelZ],
    ['fender_RL', -0.96, wheelZ],
    ['fender_RR', 0.96, wheelZ],
  ] as const) {
    part(fName, mCarbon, [fx, 0.52, fz], [0.22, 0.4, 1.08]);
  }
  for (const s of [-1, 1] as const) {
    part(`hoodVent_${s < 0 ? 'L' : 'R'}`, mCarbon, [s * 0.36, 0.84, -1.38], [0.36, 0.05, 0.56]);
    part(`sideSkirt_${s < 0 ? 'L' : 'R'}`, mCarbon, [s * 0.98, 0.2, -0.02], [0.16, 0.12, 1.98]);
    part(`grille_${s < 0 ? 'L' : 'R'}`, mCarbon, [s * 0.21, 0.63, -2.2], [0.32, 0.16, 0.06]);
    part(`headlightA_${s < 0 ? 'L' : 'R'}`, mHead, [s * 0.54, 0.64, -2.21], [0.14, 0.14, 0.06]);
    part(`headlightB_${s < 0 ? 'L' : 'R'}`, mHead, [s * 0.72, 0.64, -2.21], [0.14, 0.14, 0.06]);
    part(`taillight_${s < 0 ? 'L' : 'R'}`, mTail, [s * 0.68, 0.66, 2.19], [0.44, 0.17, 0.07]);
  }
  part('frontSplitter', mCarbon, [0, 0.19, -2.24], [2.06, 0.06, 0.34]);
  part('spoilerBlade', mCarbon, [0, 1.18, 2.02], [1.88, 0.055, 0.32], [9, 0, 0]);
  for (const s of [-1, 1] as const) {
    part(`spoilerPillar_${s < 0 ? 'L' : 'R'}`, mCarbon, [s * 0.56, 1.0, 1.99], [0.06, 0.34, 0.2], [-10, 0, 0]);
  }

  // Escapes duplos + chamas de nitro (ativadas por game.ts quando Shift está pressionado)
  const nitroGroup = new Entity('NitroFlames', app);
  nitroGroup.enabled = false;
  root.addChild(nitroGroup);
  for (const s of [-1, 1] as const) {
    part(`exhaust_${s < 0 ? 'L' : 'R'}`, mChrome, [s * 0.46, 0.24, 2.25], [0.13, 0.13, 0.24], [90, 0, 0], procedural, 'cylinder');
    const flame = new Entity(`NitroFlame_${s < 0 ? 'L' : 'R'}`, app);
    flame.addComponent('render', { type: 'cone', material: mNitroFlame, castShadows: false, receiveShadows: false });
    flame.setLocalScale(0.22, 1.25, 0.22);
    flame.setLocalPosition(s * 0.46, 0.24, 2.86);
    flame.setLocalEulerAngles(90, 0, 0);
    nitroGroup.addChild(flame);
  }

  // 4 rodas largas de aro cromado ("Roda_*")
  const wheelSpecs: ReadonlyArray<[string, number, number]> = [
    ['Roda_FL', -wheelX, -wheelZ],
    ['Roda_FR', wheelX, -wheelZ],
    ['Roda_RL', -wheelX, wheelZ],
    ['Roda_RR', wheelX, wheelZ],
  ];
  const wheels: Entity[] = [];
  for (const [wName, wx, wz] of wheelSpecs) {
    const wheel = new Entity(wName, app);
    wheel.setLocalPosition(wx, r, wz);
    procedural.addChild(wheel);
    part(`${wName}_tire`, mCarbon, [0, 0, 0], [r * 2, 0.31, r * 2], [0, 0, 90], wheel, 'cylinder');
    part(`${wName}_rim`, mChrome, [0, 0, 0], [r * 1.48, 0.33, r * 1.48], [0, 0, 90], wheel, 'cylinder');
    part(`${wName}_hub`, mCaliper, [0, 0, 0], [r * 0.32, 0.35, r * 0.32], [0, 0, 90], wheel, 'cylinder');
    wheels.push(wheel);
  }

  attachCarHeadlights(app, root, materials, w, 0.64, -2.21, [0.84, 0.95, 1.0]);

  const prop = new Entity('prop', app);
  root.addChild(prop);

  const tipL = new Entity('wingTipL', app);
  const tipR = new Entity('wingTipR', app);
  tipL.setLocalPosition(-w * 0.52, h * 0.5, 0);
  tipR.setLocalPosition(w * 0.52, h * 0.5, 0);
  root.addChild(tipL);
  root.addChild(tipR);

  const hitbox: [number, number, number][] = [];
  for (const x of [-w * 0.5, w * 0.5]) {
    for (const y of [0, h]) {
      for (const z of [-l * 0.5, l * 0.5]) hitbox.push([x, y, z]);
    }
  }

  const model: VehicleModel = {
    root,
    exterior,
    prop,
    wingTips: [tipL, tipR],
    materials,
    hitbox,
    wheels,
  };

  attachAsyncGlb({
    app,
    root,
    procedural,
    model,
    filename: 'carro-tunado.glb',
    trimCarOutliers: true,
    onMounted(glbRoot) {
      const glbWheels = collectNodesByPrefix(glbRoot, 'roda_');
      if (glbWheels.length > 0) {
        wheels.length = 0;
        for (let i = 0; i < glbWheels.length; i++) wheels.push(glbWheels[i]);
      }
    },
  });

  return model;
}

function buildCharacter(app: AppBase, parent: Entity): VehicleModel {
  const mYellow = makeMaterial(0.95, 0.76, 0.1, 0.42);
  const mDark = makeMaterial(0.11, 0.12, 0.14, 0.36);
  const mPants = makeMaterial(0.16, 0.18, 0.21, 0.3);
  const mHelmet = makeMaterial(0.94, 0.95, 0.97, 0.8);
  const mVisor = makeMaterial(0.05, 0.07, 0.12, 0.92);
  const mReflect = makeMaterial(0.82, 0.84, 0.86, 0.65);
  const materials: StandardMaterial[] = [mYellow, mDark, mPants, mHelmet, mVisor, mReflect];

  const root = new Entity('Personagem', app);
  parent.addChild(root);

  const procedural = new Entity('ProceduralPersonagem', app);
  root.addChild(procedural);
  const exterior: Entity[] = [];

  const joint = (name: string, parentNode: Entity, p: [number, number, number]) => {
    const e = new Entity(name, app);
    e.setLocalPosition(...p);
    parentNode.addChild(e);
    return e;
  };

  const part = (
    name: string,
    parentNode: Entity,
    m: StandardMaterial,
    p: [number, number, number],
    s: [number, number, number],
    type: 'box' | 'sphere' | 'cylinder' = 'box',
  ) => {
    const e = new Entity(name, app);
    e.addComponent('render', { type, material: m });
    e.setLocalScale(...s);
    e.setLocalPosition(...p);
    parentNode.addChild(e);
    exterior.push(e);
    return e;
  };

  // Fallback procedural articulado do entregador GoPostal (mesma hierarquia e pivôs do personagem.glb)
  const tronco = joint('Tronco', procedural, [0, 0.9, 0]);
  part('pelvis', tronco, mPants, [0, -0.01, 0], [0.35, 0.12, 0.23]);
  part('belt', tronco, mDark, [0, 0.068, 0], [0.37, 0.05, 0.24]);
  part('jacket', tronco, mYellow, [0, 0.27, -0.008], [0.42, 0.36, 0.26]);
  part('chestBand', tronco, mReflect, [0, 0.25, -0.012], [0.43, 0.045, 0.27]);
  part('yoke', tronco, mDark, [0, 0.48, -0.008], [0.41, 0.09, 0.24]);
  part('collar', tronco, mDark, [0, 0.545, -0.01], [0.18, 0.07, 0.17], 'cylinder');
  // Mochila térmica GoPostal nas costas (+Z local = atrás)
  part('backpack', tronco, mYellow, [0, 0.318, 0.26], [0.365, 0.425, 0.255]);
  part('backpackLid', tronco, mDark, [0, 0.512, 0.26], [0.376, 0.056, 0.266]);
  part('backpackBase', tronco, mDark, [0, 0.116, 0.26], [0.374, 0.042, 0.264]);

  const cabeca = joint('Cabeca', tronco, [0, 0.56, -0.01]);
  part('helmet', cabeca, mHelmet, [0, 0.185, -0.005], [0.29, 0.29, 0.33], 'sphere');
  part('visor', cabeca, mVisor, [0, 0.175, -0.075], [0.26, 0.11, 0.24], 'sphere');
  part('helmetCrest', cabeca, mYellow, [0, 0.33, 0.01], [0.045, 0.025, 0.22]);

  for (const s of [-1, 1] as const) {
    const tag = s < 0 ? 'E' : 'D';
    const braco = joint(`Braco${tag}`, tronco, [s * 0.228, 0.47, -0.004]);
    part(`shoulder_${tag}`, braco, mDark, [0, 0, 0], [0.14, 0.14, 0.14], 'sphere');
    part(`upperArm_${tag}`, braco, mYellow, [s * 0.01, -0.14, 0], [0.115, 0.25, 0.115], 'cylinder');

    const antebraco = joint(`Antebraco${tag}`, braco, [s * 0.02, -0.27, 0]);
    part(`forearm_${tag}`, antebraco, mDark, [0, -0.11, -0.004], [0.092, 0.22, 0.092], 'cylinder');
    part(`glove_${tag}`, antebraco, mDark, [0, -0.265, -0.012], [0.055, 0.09, 0.075]);

    const perna = joint(`Perna${tag}`, procedural, [s * 0.105, 0.88, 0]);
    part(`thigh_${tag}`, perna, mPants, [0, -0.215, 0], [0.15, 0.43, 0.155], 'cylinder');
    part(`kneePad_${tag}`, perna, mYellow, [s * 0.005, -0.422, -0.068], [0.064, 0.074, 0.022]);

    const canela = joint(`Canela${tag}`, perna, [s * 0.005, -0.43, -0.005]);
    part(`shin_${tag}`, canela, mPants, [0, -0.155, 0.004], [0.118, 0.31, 0.124], 'cylinder');
    part(`bootShaft_${tag}`, canela, mDark, [0, -0.355, -0.004], [0.112, 0.13, 0.125], 'cylinder');
    // Sola encostada exatamente em y local = -0.45 -> mundo y = 0.000
    part(`bootSole_${tag}`, canela, mDark, [0, -0.415, -0.046], [0.11, 0.07, 0.23]);
  }

  const prop = new Entity('prop', app);
  root.addChild(prop);
  const tipL = new Entity('wingTipL', app);
  const tipR = new Entity('wingTipR', app);
  tipL.setLocalPosition(-0.36, 1.0, 0);
  tipR.setLocalPosition(0.36, 1.0, 0);
  root.addChild(tipL);
  root.addChild(tipR);

  const hitbox: [number, number, number][] = [];
  for (const x of [-0.35, 0.35]) {
    for (const y of [0, 1.79]) {
      for (const z of [-0.24, 0.39]) hitbox.push([x, y, z]);
    }
  }

  const model: VehicleModel = { root, exterior, prop, wingTips: [tipL, tipR], materials, hitbox };

  attachAsyncGlb({
    app,
    root,
    procedural,
    model,
    filename: 'personagem.glb',
  });

  return model;
}

/**
 * Prédio histórico da Academia de Comércio / UniAcademia (Juiz de Fora).
 * Pivô no centro da base (y = 0) e frente virada para -Z local (pórtico + praça).
 * Carrega `public/models/uniacademia.glb` (ou asset container no Editor) com fallback procedural diurno.
 */
function buildUniAcademia(app: AppBase, parent: Entity): VehicleModel {
  const mStone = makeMaterial(0.8, 0.65, 0.42, 0.22);
  const mTrim = makeMaterial(0.89, 0.8, 0.62, 0.26);
  const mBase = makeMaterial(0.72, 0.56, 0.34, 0.2);
  const mWall = makeMaterial(0.45, 0.36, 0.27, 0.16);
  const mRoof = makeMaterial(0.65, 0.29, 0.16, 0.24);
  const mWin = makeMaterial(0.18, 0.29, 0.35, 0.78);
  const mPatio = makeMaterial(0.67, 0.63, 0.56, 0.16);
  const mTree = makeMaterial(0.2, 0.4, 0.16, 0.18);
  const mTrunk = makeMaterial(0.28, 0.2, 0.15, 0.12);
  const materials: StandardMaterial[] = [mStone, mTrim, mBase, mWall, mRoof, mWin, mPatio, mTree, mTrunk];

  const root = new Entity('UniAcademia', app);
  parent.addChild(root);

  const procedural = new Entity('Procedural_UniAcademia', app);
  root.addChild(procedural);
  const exterior: Entity[] = [];

  const part = (
    name: string,
    m: StandardMaterial,
    p: [number, number, number],
    s: [number, number, number],
    type: 'box' | 'cylinder' | 'sphere' = 'box',
  ) => {
    const e = new Entity(name, app);
    e.addComponent('render', { type, material: m, castShadows: false, receiveShadows: false });
    e.setLocalScale(...s);
    e.setLocalPosition(...p);
    procedural.addChild(e);
    exterior.push(e);
    return e;
  };

  // Frente = -Z local (espelhado em Z em relação ao +Y do Blender)
  // Quadrilátero com pátio interno (alas laterais, ala posterior e fachada frontal recuada)
  part('frontWingBase', mBase, [0, 3.45, -3.75], [27.2, 4.2, 4.7]);
  part('frontWingUpper', mStone, [0, 9.8, -3.7], [27.2, 8.5, 4.6]);
  part('frontRoof', mRoof, [0, 15.8, -3.8], [28.0, 2.4, 5.4]);
  for (const sx of [-18.3, 18.3]) {
    part(`pavBase_${sx}`, mBase, [sx, 3.45, -7.6], [9.4, 4.2, 7.2]);
    part(`pavUpper_${sx}`, mStone, [sx, 9.8, -7.55], [9.2, 8.5, 7.1]);
    part(`wingSide_${sx}`, mStone, [sx > 0 ? 19.7 : -19.7, 7.7, 8.0], [6.6, 12.7, 24.1]);
    part(`wingRoof_${sx}`, mRoof, [sx > 0 ? 19.7 : -19.7, 16.0, 4.6], [7.6, 2.8, 31.6]);
  }
  part('backWing', mStone, [0, 7.7, 17.1], [33.0, 12.7, 5.8]);
  part('backRoof', mRoof, [0, 16.0, 17.1], [34.2, 2.6, 6.6]);

  // Corpo central avançado + pórtico com 4 colunas + torre do relógio
  part('centerBlock', mStone, [0, 8.6, -4.5], [10.0, 14.5, 6.2]);
  part('centerCornice', mTrim, [0, 16.15, -4.7], [10.9, 0.68, 6.7]);
  part('clockGable', mTrim, [0, 17.7, -7.5], [6.6, 2.5, 1.1]);
  part('belfryTower', mTrim, [0, 20.9, -5.7], [3.5, 3.2, 3.1]);
  part('belfryRoof', mRoof, [0, 23.7, -5.7], [4.2, 2.2, 3.8]);
  part('porticoTop', mTrim, [0, 7.95, -9.55], [10.3, 0.95, 3.8]);
  part('stairs', mWall, [0, 1.75, -10.2], [10.4, 0.8, 4.6]);
  for (const cx of [-3.85, -1.7, 1.7, 3.85]) {
    part(`col_${cx}`, mTrim, [cx, 4.95, -10.65], [0.76, 4.8, 0.76], 'cylinder');
  }
  // Janelas diurnas na fachada
  for (const wx of [-11.6, -9.2, -6.8, 6.8, 9.2, 11.6]) {
    for (const wy of [3.4, 7.7, 11.8]) {
      part(`win_${wx}_${wy}`, mWin, [wx, wy, -6.15], [1.4, 2.35, 0.18]);
    }
  }
  // Pátio interno + praça frontal elevada com muro de pedra e árvores
  part('innerCourtyard', mPatio, [0, 1.35, 6.4], [32.8, 0.12, 15.7]);
  part('frontPlaza', mPatio, [0, 0.68, -12.0], [44.8, 1.38, 11.6]);
  part('retainingWall', mWall, [0, 0.7, -17.6], [36.0, 1.5, 0.85]);
  for (const [tx, tz] of [
    [-11.8, -15.0],
    [-15.5, -13.4],
    [10.6, -9.5],
  ] as const) {
    part(`trunk_${tx}`, mTrunk, [tx, 3.4, tz], [0.55, 4.4, 0.55], 'cylinder');
    part(`crown_${tx}`, mTree, [tx, 7.2, tz], [6.4, 5.4, 6.4], 'sphere');
  }

  const prop = new Entity('prop', app);
  root.addChild(prop);
  const tipL = new Entity('wingTipL', app);
  const tipR = new Entity('wingTipR', app);
  tipL.setLocalPosition(-23, 8, 0);
  tipR.setLocalPosition(23, 8, 0);
  root.addChild(tipL);
  root.addChild(tipR);

  const hitbox: [number, number, number][] = [];
  for (const x of [-23.5, 23.5]) {
    for (const y of [0, 27.6]) {
      for (const z of [-21.4, 20.5]) hitbox.push([x, y, z]);
    }
  }

  const model: VehicleModel = { root, exterior, prop, wingTips: [tipL, tipR], materials, hitbox };

  attachAsyncGlb({
    app,
    root,
    procedural,
    model,
    filename: 'uniacademia.glb',
  });

  return model;
}

export function buildLandmark(
  app: AppBase,
  kind: LandmarkKind | string,
  parent: Entity = app.root,
): VehicleModel {
  if (kind.toLowerCase() === 'uniacademia') return buildUniAcademia(app, parent);
  return buildUniAcademia(app, parent);
}

export function buildVehicleModel(
  app: AppBase,
  kind: VehicleKind,
  variant = 0,
  parent: Entity = app.root,
): VehicleModel {
  if (kind === 'a29') return buildAirplane(app, parent);
  if (kind === 'heli') return buildHelicopter(app, parent);
  if (kind === 'tuned') return buildTunedCar(app, parent);
  if (kind === 'car') return buildCar(app, variant, parent);
  return buildCharacter(app, parent);
}
