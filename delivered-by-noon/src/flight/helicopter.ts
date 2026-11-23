import { type AppBase, Entity, type StandardMaterial } from 'playcanvas';
import type { AirplaneModel } from './airplane';
import { attachAsyncGlb, makeMaterial } from './models/glb';

/**
 * Helicóptero leve utilitário inspirado no MD 500 Defender (genérico, sem armas,
 * com compartimentos de carga laterais para entregas, cabine em gota preto fosco,
 * rotor principal de 5 pás "Rotor", rotor de cauda "TailRotor" e piloto de capacete branco).
 * Carrega `models/helicoptero.glb` de forma assíncrona com fallback procedural imediato.
 */
export function buildHelicopter(app: AppBase, parent: Entity = app.root): AirplaneModel {
  const matte = makeMaterial(0.08, 0.085, 0.095, 0.26);
  const darkMetal = makeMaterial(0.14, 0.15, 0.17, 0.55);
  const glass = makeMaterial(0.1, 0.22, 0.32, 0.92, 0.42);
  const cargoOrange = makeMaterial(0.95, 0.54, 0.08, 0.55);
  const helmetWhite = makeMaterial(0.96, 0.97, 0.99, 0.78);
  const tipYellow = makeMaterial(0.95, 0.82, 0.14, 0.5);
  const materials: StandardMaterial[] = [matte, darkMetal, glass, cargoOrange, helmetWhite, tipYellow];

  const root = new Entity('Helicopter', app);
  parent.addChild(root);

  const procedural = new Entity('ProceduralHeli', app);
  root.addChild(procedural);
  const exterior: Entity[] = [];

  const part = (
    name: string,
    m: StandardMaterial,
    p: [number, number, number],
    s: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    targetParent: Entity = procedural,
    type: 'box' | 'cylinder' | 'sphere' = 'box',
  ) => {
    const e = new Entity(name, app);
    e.addComponent('render', { type, material: m, castShadows: false, receiveShadows: false });
    e.setLocalScale(...s);
    e.setLocalPosition(...p);
    e.setLocalEulerAngles(...rot);
    targetParent.addChild(e);
    exterior.push(e);
    return e;
  };

  // Fuselagem em gota preto fosco (frente = -Z) + piloto de capacete branco a bordo
  part('heliBelly', matte, [0, 1.18, -0.15], [1.62, 1.12, 2.7], [0, 0, 0], procedural, 'sphere');
  part('heliRearPod', matte, [0, 1.48, 0.62], [1.46, 1.34, 2.06], [0, 0, 0], procedural, 'sphere');
  part('heliEngineCowling', matte, [0, 2.08, 0.38], [0.62, 0.36, 1.24]);
  part('heliMast', darkMetal, [0, 2.38, 0.1], [0.18, 0.56, 0.18], [0, 0, 0], procedural, 'cylinder');

  // Piloto de capacete branco visível dentro da bolha de vidro
  part('pilotTorso', darkMetal, [-0.24, 1.34, -0.44], [0.34, 0.38, 0.22]);
  part('pilotHelmet', helmetWhite, [-0.24, 1.68, -0.46], [0.28, 0.3, 0.3], [0, 0, 0], procedural, 'sphere');
  part('heliCanopy', glass, [0, 1.44, -0.48], [1.62, 1.36, 2.7], [0, 0, 0], procedural, 'sphere');

  // Cauda fina e estabilizador em T (+Z)
  part('heliTailBoom', matte, [0, 1.66, 3.1], [0.28, 0.28, 3.45], [85, 0, 0], procedural, 'cylinder');
  part('heliVFin', matte, [0, 1.98, 4.78], [0.1, 0.98, 0.62], [20, 0, 0]);
  part('heliVentralFin', matte, [0, 1.38, 4.64], [0.09, 0.52, 0.42], [-18, 0, 0]);
  part('heliTStab', matte, [0, 2.46, 4.92], [1.68, 0.065, 0.36]);
  for (const s of [-1, 1] as const) {
    part(`heliTPlate_${s < 0 ? 'L' : 'R'}`, matte, [s * 0.84, 2.38, 4.92], [0.05, 0.34, 0.38], [12, 0, 0]);
  }

  // Esquis de pouso (base em y = 0)
  for (const s of [-1, 1] as const) {
    part(`skid_${s < 0 ? 'L' : 'R'}`, darkMetal, [s * 0.96, 0.045, -0.15], [0.09, 0.09, 2.9]);
    part(`strutF_${s < 0 ? 'L' : 'R'}`, darkMetal, [s * 0.72, 0.44, -0.82], [0.07, 0.88, 0.07], [0, 0, s * -32]);
    part(`strutR_${s < 0 ? 'L' : 'R'}`, darkMetal, [s * 0.72, 0.44, 0.56], [0.07, 0.88, 0.07], [0, 0, s * -32]);
  }

  // Compartimentos de carga laterais de entregas (SEM armas)
  for (const s of [-1, 1] as const) {
    part(`cargoRack_${s < 0 ? 'L' : 'R'}`, darkMetal, [s * 0.88, 0.88, 0.15], [0.44, 0.08, 0.22]);
    part(`cargoPod_${s < 0 ? 'L' : 'R'}`, matte, [s * 1.12, 0.88, 0.15], [0.38, 0.36, 1.24]);
    part(`cargoStripe_${s < 0 ? 'L' : 'R'}`, cargoOrange, [s * 1.32, 0.88, 0.15], [0.02, 0.07, 0.92]);
  }

  // Rotor principal de 5 pás ("Rotor") — gira em torno de Y
  const rotor = new Entity('Rotor', app);
  rotor.setLocalPosition(0, 2.68, 0.1);
  procedural.addChild(rotor);
  part('rotorHub', matte, [0, 0, 0], [0.44, 0.14, 0.44], [0, 0, 0], rotor, 'cylinder');
  for (let i = 0; i < 5; i++) {
    const deg = i * 72;
    const rad = (deg * Math.PI) / 180;
    const sx = Math.sin(rad);
    const cz = -Math.cos(rad);
    part(`rotorBlade${i}`, matte, [sx * 2.1, 0.02, cz * 2.1], [0.18, 0.032, 3.85], [0, -deg, 0], rotor);
    part(`rotorTip${i}`, tipYellow, [sx * 3.96, 0.02, cz * 3.96], [0.184, 0.034, 0.26], [0, -deg, 0], rotor);
  }

  // Rotor de cauda ("TailRotor") — gira em torno de X
  const tailRotor = new Entity('TailRotor', app);
  tailRotor.setLocalPosition(-0.15, 1.88, 4.74);
  procedural.addChild(tailRotor);
  part('tailRotorHub', matte, [0, 0, 0], [0.16, 0.16, 0.16], [0, 0, 90], tailRotor, 'cylinder');
  part('tailBladeA', matte, [-0.06, 0, 0], [0.028, 1.32, 0.11], [0, 0, 0], tailRotor);
  part('tailBladeTipA', tipYellow, [-0.06, 0.62, 0], [0.03, 0.12, 0.114], [0, 0, 0], tailRotor);
  part('tailBladeTipB', tipYellow, [-0.06, -0.62, 0], [0.03, 0.12, 0.114], [0, 0, 0], tailRotor);

  const tipL = new Entity('wingTipL', app);
  tipL.setLocalPosition(-1.32, 1.0, 0);
  const tipR = new Entity('wingTipR', app);
  tipR.setLocalPosition(1.32, 1.0, 0);
  root.addChild(tipL);
  root.addChild(tipR);

  const hitbox: [number, number, number][] = [
    [-1.32, 0, -1.88],
    [1.32, 0, -1.88],
    [-1.32, 0, 1.3],
    [1.32, 0, 1.3],
    [-1.32, 2.25, -1.88],
    [1.32, 2.25, -1.88],
    [-1.32, 2.25, 1.5],
    [1.32, 2.25, 1.5],
    [0, 1.44, -1.9],
    [0, 1.88, 5.12],
    [0, 2.72, 0.1],
    [0, 2.52, 5.1],
  ];

  const model: AirplaneModel = {
    root,
    exterior,
    prop: rotor,
    tailRotor,
    wingTips: [tipL, tipR],
    materials,
    hitbox,
  };

  attachAsyncGlb({
    app,
    root,
    procedural,
    model,
    filename: 'helicoptero.glb',
    onMounted(glbRoot) {
      const glbRotor =
        (glbRoot.findByName('Rotor') as Entity | null) ??
        (glbRoot.findByName('rotor') as Entity | null);
      if (glbRotor) {
        glbRotor.setLocalEulerAngles(model.prop.getLocalEulerAngles());
        model.prop = glbRotor;
      } else {
        const empty = new Entity('Rotor', app);
        empty.setLocalPosition(0, 2.68, 0.1);
        glbRoot.addChild(empty);
        model.prop = empty;
      }

      const glbTail =
        (glbRoot.findByName('TailRotor') as Entity | null) ??
        (glbRoot.findByName('tailRotor') as Entity | null);
      if (glbTail) {
        model.tailRotor = glbTail;
      }
    },
  });

  return model;
}
