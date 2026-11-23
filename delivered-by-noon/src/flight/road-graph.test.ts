import { describe, expect, it } from 'vitest';
import { buildNodeGraph, degreeHistogram, MIN_EDGE, NODE_MERGE } from './road-graph';
import { roadGraph, roadJunctions } from './world-data';

const len = (p: number[]) => { let s = 0; for (let i = 0; i + 3 < p.length; i += 2) s += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); return s; };

describe('grafo viário por nós', () => {
  it('cruza duas vias num nó de grau 4 e emenda por nó de grau 2', () => {
    const g = buildNodeGraph([{ cls: 0, pts: [0, 0, 100, 0] }, { cls: 0, pts: [50, -50, 50, 50] }, { cls: 0, pts: [100, 0, 160, 0] }]);
    expect(degreeHistogram(g)).toEqual({ 1: 4, 4: 1 });
    expect(g.edges.length).toBe(4);
  });
  it('funde nós a < 12 m e remove arestas < 15 m', () => {
    const g = buildNodeGraph([{ cls: 0, pts: [0, 0, 100, 0] }, { cls: 0, pts: [50, 0, 50, 60] }, { cls: 0, pts: [58, 0, 58, -60] }]);
    for (const e of g.edges) expect(len(e.pts)).toBeGreaterThanOrEqual(MIN_EDGE - 1e-6);
    expect(g.nodes.filter((n, i) => g.nodes.some((o, k) => k > i && Math.hypot(o.x - n.x, o.z - n.z) < NODE_MERGE - 1e-6))).toHaveLength(0);
  });
  it('no mundo real: toda aresta termina nas coordenadas do nó, >= 15 m, grau <= 6 e poucos cruzamentos de reserva', () => {
    const g = roadGraph();
    expect(g.nodes.length).toBeGreaterThan(200);
    for (const e of g.edges) {
      const a = g.nodes[e.a], b = g.nodes[e.b];
      expect(e.pts[0]).toBeCloseTo(a.x, 6); expect(e.pts[1]).toBeCloseTo(a.z, 6);
      expect(e.pts[e.pts.length - 2]).toBeCloseTo(b.x, 6); expect(e.pts[e.pts.length - 1]).toBeCloseTo(b.z, 6);
      expect(len(e.pts)).toBeGreaterThanOrEqual(MIN_EDGE - .01);
      expect(e.width).toBe(7);
    }
    const h = degreeHistogram(g);
    expect(Math.max(...Object.keys(h).map(Number))).toBeLessThanOrEqual(6);
    expect((h[3] ?? 0) + (h[4] ?? 0)).toBeGreaterThan((h[5] ?? 0) * 8);
    const j = roadJunctions();
    expect(j.filter((q) => q.fallback).length / j.length, 'fração de cruzamentos de reserva (era 75% antes do grafo)').toBeLessThan(.35);
  });
  it('é determinístico', () => {
    expect(roadGraph().edges.length).toBe(roadGraph().edges.length);
  });
});
