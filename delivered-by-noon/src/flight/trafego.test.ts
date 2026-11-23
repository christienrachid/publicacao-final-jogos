import { afterEach, describe, expect, it, vi } from 'vitest';
import { Entity } from 'playcanvas';
import { createTraffic, getRoadGraph, getTrafficObstacles, MAX_TRAFFIC_CARS } from './trafego';
import { createFlightState, createMissionState, type FlightContext } from './types';
import { clearRuntime, DEFAULT_SETTINGS, initRuntime, setRuntimeSettings } from './ui/settings';
import { cityData, cityLayout, nearestRoad, roadHeightAt, terrainHeight } from './world-data';

vi.mock('playcanvas', async (importOriginal) => {
  const pc = await importOriginal<typeof import('playcanvas')>();
  const app = { _entityIndex: {}, systems: {} } as unknown as FlightContext['app'];
  class TestEntity extends pc.Entity {
    constructor(name = 'Entity') {
      super(name, app);
    }
    addComponent(type: string, data: unknown) {
      if (type === 'render') Object.defineProperty(this, 'render', { value: data, writable: true, configurable: true });
      return null;
    }
  }
  return { ...pc, Entity: TestEntity };
});

function makeContext(x: number, z: number): FlightContext {
  const root = new Entity('root');
  Object.assign(root, { _enabledInHierarchy: true });
  const app = { root } as unknown as FlightContext['app'];
  const state = createFlightState();
  state.x = x;
  state.z = z;
  state.y = Math.max(terrainHeight(x, z), roadHeightAt(x, z));
  const mission = createMissionState();
  const planeRoot = new Entity('PlayerCar');
  root.addChild(planeRoot);
  return {
    app,
    world: {
      sky: new Entity('Sky'),
      groundAt: (gx, gz) => Math.max(terrainHeight(gx, gz), roadHeightAt(gx, gz), 0),
      materials: [],
      textures: [],
    },
    plane: {
      root: planeRoot,
      exterior: [],
      prop: new Entity('prop'),
      wingTips: [new Entity('L'), new Entity('R')],
      materials: [],
      hitbox: [],
    },
    camera: new Entity('Camera'),
    state,
    mission,
  };
}

describe('tráfego urbano de Juiz de Fora', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('monta grafo conectado com cruzamentos ligando as vias reais de cityLayout()', () => {
    const graph = getRoadGraph();
    expect(graph.nodes.length).toBeGreaterThan(500);
    expect(graph.edges.length).toBeGreaterThan(1000);

    // mão única: só as arestas no sentido da via (ids pares) saem dos nós; cruzamento = nó com 3+ vias incidentes (entram ou saem)
    // mão dupla: os dois sentidos de cada via são usados (arestas pares = ida, ímpares = volta)
    let ida = 0, volta = 0; for (const n of graph.nodes) for (const id of n.outEdges) { if (id % 2) volta++; else ida++; }
    expect(ida).toBeGreaterThan(0); expect(volta).toBeGreaterThan(0);
    const degree = new Map<number, number>();
    for (const e of graph.edges) if (e.id % 2 === 0) { degree.set(e.from, (degree.get(e.from) ?? 0) + 1); degree.set(e.to, (degree.get(e.to) ?? 0) + 1); }
    const junctions = [...degree.values()].filter((d) => d >= 3);
    expect(junctions.length).toBeGreaterThan(100);

    // Cada aresta tem seu par inverso válido (mão dupla)
    for (const edge of graph.edges.slice(0, 400)) {
      const rev = graph.edges[edge.reverseId];
      expect(rev).toBeDefined();
      expect(rev.from).toBe(edge.to);
      expect(rev.to).toBe(edge.from);
      expect(edge.baseSpeed).toBeGreaterThanOrEqual(8);
      expect(edge.baseSpeed).toBeLessThanOrEqual(16);
    }
  });

  it('mantém pool <= 40, remove carros longe do jogador e segue vias sem atravessar prédios', () => {
    const centro = cityLayout().landmarks.centro;
    const ctx = makeContext(centro.x, centro.z);
    initRuntime(ctx.state, { ...DEFAULT_SETTINGS, quality: 'high', traffic: 'normal' }, 'playing');
    const traffic = createTraffic(ctx);

    try {
      // Aquece o pool em vários quadros
      for (let i = 0; i < 40; i++) traffic.update(0.05);

      const obstacles = getTrafficObstacles();
      expect(obstacles.length).toBeGreaterThan(10);
      expect(obstacles.length).toBeLessThanOrEqual(MAX_TRAFFIC_CARS);

      const buildingBoxes = cityData().boxes;
      let buildingHits = 0;
      let offRoad = 0;
      for (const car of obstacles) {
        const dist = Math.hypot(car.x - ctx.state.x, car.z - ctx.state.z);
        expect(dist).toBeLessThanOrEqual(800);
        // Perto de uma via real (faixa direita dentro do asfalto)
        const road = nearestRoad(car.x, car.z, 4);
        if (!road || road.distance > 12) offRoad++;
        // Nenhum carro dentro do volume de prédios
        for (let b = 0; b < buildingBoxes.length; b++) {
          const box = buildingBoxes[b];
          if (car.x > box.x0 && car.x < box.x1 && car.z > box.z0 && car.z < box.z1) {
            buildingHits++;
            break;
          }
        }
      }
      expect(offRoad).toBe(0);
      expect(buildingHits).toBe(0);

      // Continua dirigindo por 6 segundos e garante que carros se movem e não atravessam prédios
      const before = obstacles.map((o) => ({ x: o.x, z: o.z }));
      for (let i = 0; i < 120; i++) traffic.update(0.05);
      const after = getTrafficObstacles();
      expect(after.length).toBeLessThanOrEqual(MAX_TRAFFIC_CARS);

      let moved = 0;
      for (let i = 0; i < Math.min(before.length, after.length); i++) {
        if (Math.hypot(after[i].x - before[i].x, after[i].z - before[i].z) > 1) moved++;
      }
      expect(moved).toBeGreaterThan(5);

      // Teleporta jogador para longe (> 1500 m): nenhum carro pode permanecer além de 800 m
      ctx.state.x = -1380;
      ctx.state.z = 370;
      traffic.update(0.05);
      for (const car of getTrafficObstacles()) {
        expect(Math.hypot(car.x - ctx.state.x, car.z - ctx.state.z)).toBeLessThanOrEqual(800);
      }
    } finally {
      traffic.destroy?.();
      clearRuntime(ctx.state);
    }

    expect(getTrafficObstacles()).toEqual([]);
  });

  it('respeita configuração de tráfego (desligado/pouco/normal e qualidade baixa) e evita entregas ativas', () => {
    const centro = cityLayout().landmarks.centro;
    const ctx = makeContext(centro.x, centro.z);
    // Coloca entrega ativa perto do Centro
    ctx.mission!.deliveries = [
      {
        id: 'd-test',
        stage: 'car',
        name: 'Entrega Centro',
        x: centro.x + 220,
        y: terrainHeight(centro.x + 220, centro.z),
        z: centro.z,
        radius: 35,
        delivered: false,
      },
    ];

    initRuntime(ctx.state, { ...DEFAULT_SETTINGS, quality: 'high', traffic: 'normal' }, 'playing');
    const traffic = createTraffic(ctx);

    try {
      for (let i = 0; i < 30; i++) traffic.update(0.05);
      const normalCount = getTrafficObstacles().length;
      expect(normalCount).toBeGreaterThan(15);

      // Nenhum carro dentro do raio ativo da entrega
      for (const car of getTrafficObstacles()) {
        const d = Math.hypot(car.x - (centro.x + 220), car.z - centro.z);
        expect(d).toBeGreaterThan(35);
      }

      // Qualidade baixa limita o tráfego para "pouco" (<= 14)
      setRuntimeSettings(ctx.state, { ...DEFAULT_SETTINGS, quality: 'low', traffic: 'normal' });
      traffic.update(0.05);
      expect(getTrafficObstacles().length).toBeLessThanOrEqual(14);

      // Tráfego desligado zera ativos imediatamente
      setRuntimeSettings(ctx.state, { ...DEFAULT_SETTINGS, quality: 'high', traffic: 'off' });
      traffic.update(0.05);
      expect(getTrafficObstacles()).toHaveLength(0);
    } finally {
      traffic.destroy?.();
      clearRuntime(ctx.state);
    }
  });

  it('freia quando o jogador está à frente e mantém faróis desligados de dia sem luzes dinâmicas', () => {
    const centro = cityLayout().landmarks.centro;
    const ctx = makeContext(centro.x, centro.z);
    ctx.mission!.clockMinutes = 660; // 11:00 (manhã)
    initRuntime(ctx.state, { ...DEFAULT_SETTINGS, quality: 'high', traffic: 'normal' }, 'playing');
    const traffic = createTraffic(ctx);

    try {
      for (let i = 0; i < 20; i++) traffic.update(0.05);
      const list = getTrafficObstacles();
      expect(list.length).toBeGreaterThan(5);

      // Sempre de dia: faróis desligados e nenhuma luz dinâmica criada no tráfego
      const root = ctx.app.root.findByName('TrafegoRoot') as Entity;
      expect(root).toBeDefined();
      expect(root.findComponents('light')).toHaveLength(0);
      const activeCar = root.children.find((c) => (c as Entity).enabled) as Entity | undefined;
      expect(activeCar).toBeDefined();
      expect((activeCar!.findByName('CarHeadlights') as Entity | null)?.enabled).toBe(false);
      expect(activeCar!.findByName('TrafficLights')).toBeNull();

      // Posiciona o jogador 6 m à frente de um carro ativo para confirmar frenagem
      const obs = list[0];
      const p0 = { x: obs.x, z: obs.z };
      traffic.update(0.05);
      const p1 = getTrafficObstacles()[0];
      const dx = p1.x - p0.x, dz = p1.z - p0.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) {
        ctx.state.x = p1.x + (dx / len) * 6;
        ctx.state.z = p1.z + (dz / len) * 6;
        ctx.state.y = Math.max(terrainHeight(ctx.state.x, ctx.state.z), roadHeightAt(ctx.state.x, ctx.state.z));
        for (let i = 0; i < 30; i++) traffic.update(0.05);
        const stoppedA = getTrafficObstacles()[0];
        traffic.update(0.05);
        const stoppedB = getTrafficObstacles()[0];
        expect(Math.hypot(stoppedB.x - stoppedA.x, stoppedB.z - stoppedA.z)).toBeLessThan(0.2);
      }
    } finally {
      traffic.destroy?.();
      clearRuntime(ctx.state);
    }
  });
});
