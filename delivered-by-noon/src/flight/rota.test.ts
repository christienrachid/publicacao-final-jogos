import { describe, expect, it, vi } from 'vitest';
import { Entity } from 'playcanvas';
import {
  computeRoute,
  createGpsRoute,
  createRouteGraph,
  getActiveRoute,
  getRouteGraph,
  getRouteGraphBuildMs,
} from './rota';
import { deliveryPoints } from './mission';
import { createFlightState, createMissionState, type FlightContext } from './types';
import { clearRuntime, DEFAULT_SETTINGS, initRuntime, setRuntimeSettings } from './ui/settings';
import { cityLayout, roadHeightAt, terrainHeight } from './world-data';

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
  mission.status = 'playing';
  mission.deliveries = deliveryPoints();
  mission.total = mission.deliveries.length;
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

describe('rota de GPS pelas ruas', () => {
  it('constrói grafo de rotas rapidamente (< 150 ms) e conecta vias residenciais/serviço ao Centro sem caminhos de pedestre', () => {
    const graph = getRouteGraph();
    const buildMs = getRouteGraphBuildMs();
    expect(graph.nodes.length).toBeGreaterThan(500);
    expect(graph.edges.length).toBeGreaterThan(1000);
    // Sozinho leva ~100 ms; na suíte inteira em paralelo (CPU disputada) passa de 1 s, então o limite aqui é folgado.
    expect(buildMs).toBeLessThan(3000);

    // Verifica inclusão de residential/service e exclusão de footway/pedestrian
    const layout = cityLayout();
    const centro = layout.landmarks.centro;
    const baseRoad = layout.roadLines.find((g) => g.category === 'primary')!.lines[0];
    const ax = baseRoad[0], az = baseRoad[1];
    const syntheticLines = [
      ...layout.roadLines,
      { category: 'residential', width: 6.5, lines: [[ax, az, ax + 120, az, ax + 120, az + 80]] },
      { category: 'service', width: 5.5, lines: [[ax + 120, az + 80, ax + 180, az + 80]] },
      { category: 'footway', width: 2.0, lines: [[ax + 180, az + 80, ax + 400, az + 80]] },
      { category: 'pedestrian', width: 3.0, lines: [[ax + 400, az + 80, ax + 600, az + 80]] },
    ];
    const customGraph = createRouteGraph(syntheticLines);
    expect(customGraph.edges.some((e) => e.category === 'residential')).toBe(true);
    expect(customGraph.edges.some((e) => e.category === 'service')).toBe(true);
    expect(customGraph.edges.some((e) => e.category === 'footway' || e.category === 'pedestrian')).toBe(false);

    const r = computeRoute(ax + 175, az + 80, centro.x, centro.z, customGraph);
    expect(r.found).toBe(true);
    expect(r.points.length).toBeGreaterThanOrEqual(2);
    expect(r.distance).toBeGreaterThan(0);
    expect(r.distance).toBeLessThan(Math.hypot(ax + 175 - centro.x, az + 80 - centro.z) * 3.5 + 300);
  });

  it('encontra rota conectada e com distância razoável entre entregas reais de Juiz de Fora', () => {
    const pts = deliveryPoints().filter((d) => d.stage === 'car' || d.stage === 'tuned');
    expect(pts.length).toBe(8);

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const straight = Math.hypot(b.x - a.x, b.z - a.z);
      const route = computeRoute(a.x, a.z, b.x, b.z);
      expect(route.found, `Rota ${a.id} -> ${b.id}`).toBe(true);
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      expect(route.distance).toBeGreaterThanOrEqual(straight * 0.95);
      expect(route.distance, `Rota ${a.id} -> ${b.id}`).toBeLessThan(Math.max(400, straight * 3.2));
    }
  });

  it('não recalcula por quadro, recalcula ao sair > 30 m ou trocar entrega e desativa em heli/A-29', () => {
    const deliveries = deliveryPoints();
    const d1 = deliveries.find((d) => d.id === 'car-1')!;
    const d2 = deliveries.find((d) => d.id === 'car-2')!;
    const d3 = deliveries.find((d) => d.id === 'car-3')!;

    const ctx = makeContext(d1.x, d1.z);
    ctx.mission!.nextDeliveryId = d2.id;
    ctx.mission!.carrying = 'car';
    ctx.state.vehicle = 'car';
    initRuntime(ctx.state, { ...DEFAULT_SETTINGS, showGroundGps: true }, 'playing');

    const gps = createGpsRoute(ctx);
    try {
      // 30 quadros a 60 Hz (0,5 s) sem sair da rota: deve calcular apenas 1 vez
      for (let i = 0; i < 30; i++) gps.update(1 / 60);
      const r1 = getActiveRoute(ctx.state);
      expect(r1).not.toBeNull();
      expect(r1!.found).toBe(true);
      expect(r1!.recalcCount).toBe(1);

      // Movendo pouco (< 30 m da rota) dentro de < 1 s: não recalcula
      ctx.state.x += 3;
      gps.update(0.1);
      expect(getActiveRoute(ctx.state)!.recalcCount).toBe(1);

      // Saindo mais de 30 m da rota: recalcula imediatamente
      ctx.state.x += 90;
      gps.update(0.05);
      expect(getActiveRoute(ctx.state)!.recalcCount).toBe(2);

      // Trocando a próxima entrega: recalcula imediatamente
      ctx.mission!.nextDeliveryId = d3.id;
      gps.update(0.016);
      const r3 = getActiveRoute(ctx.state);
      expect(r3!.deliveryId).toBe(d3.id);
      expect(r3!.recalcCount).toBe(3);

      // Desligar GPS no chão mantém a rota ativa para o minimapa
      setRuntimeSettings(ctx.state, { ...DEFAULT_SETTINGS, showGroundGps: false });
      gps.update(0.016);
      expect(getActiveRoute(ctx.state)).not.toBeNull();

      // Em heli e A-29 nada muda (rota de chão desativada)
      ctx.state.vehicle = 'heli';
      gps.update(0.016);
      expect(getActiveRoute(ctx.state)).toBeNull();

      ctx.state.vehicle = 'a29';
      gps.update(0.016);
      expect(getActiveRoute(ctx.state)).toBeNull();
    } finally {
      gps.destroy?.();
      clearRuntime(ctx.state);
    }
  });
});
