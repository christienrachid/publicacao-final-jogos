// Grafo viário por NÓS (ideia do QuickRoad, código próprio): nós + arestas entre nós, construído a partir das polilinhas do OSM já simplificadas.
// Funde nós a < NODE_MERGE m, remove arestas < MIN_EDGE m, junta arestas por nós de grau 2 (junção contínua) e entrega polilinhas que
// terminam EXATAMENTE nas coordenadas dos nós. Módulo puro: não conhece terreno nem malha.

export interface RoadNode { id: number; x: number; z: number; y: number }
export interface RoadEdge { a: number; b: number; width: number; cls: number; pts: number[] }
export interface RoadGraph { nodes: RoadNode[]; edges: RoadEdge[] }
export interface GraphLine { cls: number; pts: number[] }
export interface GraphOptions {
  width?: number;
  /** nós mais próximos que isto são fundidos (m) */
  nodeMerge?: number;
  /** arestas mais curtas que isto somem (m) */
  minEdge?: number;
  /** distância máxima para uma ponta solta encostar numa via (T) */
  tSnap?: number;
  /** altura do nó */
  heightAt?: (x: number, z: number) => number;
  /** suavização de cada aresta (mantém as pontas) */
  smooth?: (pts: number[]) => number[];
}
export const NODE_MERGE = 12, MIN_EDGE = 15;

const key = (gx: number, gz: number) => gx * 8192 + gz;
const polyLen = (p: number[]) => { let s = 0; for (let i = 0; i + 3 < p.length; i += 2) s += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); return s; };

interface Vtx { x: number; z: number; node: boolean; cluster: number }

export function buildNodeGraph(input: GraphLine[], opts: GraphOptions = {}): RoadGraph {
  const MERGE = opts.nodeMerge ?? NODE_MERGE, MIN = opts.minEdge ?? MIN_EDGE, TSNAP = opts.tSnap ?? 6, WIDTH = opts.width ?? 7;
  const lines = input.filter((l) => l.pts.length >= 4).map((l) => ({ cls: l.cls, v: [] as Vtx[], src: l.pts }));
  // ---- 1. vértices (pontas são nós) ----
  for (const l of lines) for (let i = 0; i + 1 < l.src.length; i += 2) l.v.push({ x: l.src[i], z: l.src[i + 1], node: i === 0 || i + 2 >= l.src.length, cluster: -1 });
  // ---- 2. cruzamentos entre vias diferentes e pontas soltas que encostam (T): inserem vértice-nó nas duas vias ----
  const CELL = 64, grid = new Map<number, [number, number][]>();
  lines.forEach((l, li) => { for (let i = 0; i + 1 < l.v.length; i++) {
    const a = l.v[i], b = l.v[i + 1];
    for (let gx = Math.floor((Math.min(a.x, b.x) - TSNAP) / CELL); gx <= Math.floor((Math.max(a.x, b.x) + TSNAP) / CELL); gx++) for (let gz = Math.floor((Math.min(a.z, b.z) - TSNAP) / CELL); gz <= Math.floor((Math.max(a.z, b.z) + TSNAP) / CELL); gz++) {
      const k = key(gx, gz); let list = grid.get(k); if (!list) grid.set(k, list = []); list.push([li, i]);
    }
  } });
  const inserts = lines.map(() => new Map<number, { t: number; x: number; z: number }[]>());
  const addInsert = (li: number, seg: number, t: number, x: number, z: number) => { let m = inserts[li].get(seg); if (!m) inserts[li].set(seg, m = []); m.push({ t, x, z }); };
  const seen = new Set<string>();
  for (const [cellKey, list] of grid) {
    void cellKey;
    for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      const [la, sa] = list[p], [lb, sb] = list[q];
      if (la === lb) continue;
      const id = la < lb ? `${la}.${sa}.${lb}.${sb}` : `${lb}.${sb}.${la}.${sa}`;
      if (seen.has(id)) continue; seen.add(id);
      const A = lines[la].v[sa], B = lines[la].v[sa + 1], C = lines[lb].v[sb], D = lines[lb].v[sb + 1];
      const rx = B.x - A.x, rz = B.z - A.z, sx = D.x - C.x, sz = D.z - C.z, den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((C.x - A.x) * sz - (C.z - A.z) * sx) / den, u = ((C.x - A.x) * rz - (C.z - A.z) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const x = A.x + rx * t, z = A.z + rz * t;
      addInsert(la, sa, t, x, z); addInsert(lb, sb, u, x, z);
    }
  }
  // ponta solta perto do meio de outra via: o ponto projetado vira nó nela
  lines.forEach((l, li) => {
    for (const end of [0, l.v.length - 1]) {
      const e = l.v[end];
      let best: { d: number; lj: number; sj: number; t: number; x: number; z: number } | undefined;
      for (const [lj, sj] of grid.get(key(Math.floor(e.x / CELL), Math.floor(e.z / CELL))) ?? []) {
        if (lj === li) continue;
        const A = lines[lj].v[sj], B = lines[lj].v[sj + 1], dx = B.x - A.x, dz = B.z - A.z, len2 = dx * dx + dz * dz;
        const t = len2 ? Math.max(0, Math.min(1, ((e.x - A.x) * dx + (e.z - A.z) * dz) / len2)) : 0, x = A.x + dx * t, z = A.z + dz * t, d = Math.hypot(e.x - x, e.z - z);
        if (d <= TSNAP && (!best || d < best.d)) best = { d, lj, sj, t, x, z };
      }
      if (best) addInsert(best.lj, best.sj, best.t, best.x, best.z);
    }
  });
  for (let li = 0; li < lines.length; li++) {
    const old = lines[li].v, out: Vtx[] = [];
    const push = (v: Vtx) => { const prev = out[out.length - 1]; if (prev && Math.hypot(prev.x - v.x, prev.z - v.z) < .5) { prev.node ||= v.node; } else out.push(v); };
    for (let i = 0; i < old.length; i++) {
      push({ ...old[i] });
      const ins = inserts[li].get(i);
      if (ins && i + 1 < old.length) for (const s of ins.sort((p, q) => p.t - q.t)) push({ x: s.x, z: s.z, node: true, cluster: -1 });
    }
    lines[li].v = out;
  }
  // ---- 3. agrupa os nós a < MERGE m (guloso, centro = média corrente) ----
  const clusters: { x: number; z: number; n: number }[] = [], cgrid = new Map<number, number[]>();
  const cadd = (c: number) => { const k = key(Math.floor(clusters[c].x / MERGE), Math.floor(clusters[c].z / MERGE)); let l = cgrid.get(k); if (!l) cgrid.set(k, l = []); l.push(c); };
  const cremove = (c: number) => { const k = key(Math.floor(clusters[c].x / MERGE), Math.floor(clusters[c].z / MERGE)), l = cgrid.get(k)!; l.splice(l.indexOf(c), 1); };
  for (const l of lines) for (const v of l.v) {
    if (!v.node) continue;
    let best = -1, bd = MERGE;
    const gx = Math.floor(v.x / MERGE), gz = Math.floor(v.z / MERGE);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const c of cgrid.get(key(gx + a, gz + b)) ?? []) { const d = Math.hypot(clusters[c].x - v.x, clusters[c].z - v.z); if (d < bd) { bd = d; best = c; } }
    if (best < 0) { clusters.push({ x: v.x, z: v.z, n: 1 }); v.cluster = clusters.length - 1; cadd(v.cluster); } else {
      cremove(best); const c = clusters[best]; c.x = (c.x * c.n + v.x) / (c.n + 1); c.z = (c.z * c.n + v.z) / (c.n + 1); c.n++; cadd(best); v.cluster = best;
    }
  }
  // ---- 4. arestas: corta cada via nos nós; vértices comuns muito perto de um nó somem (sem dobra) ----
  interface E { a: number; b: number; cls: number; pts: number[]; alive: boolean }
  let edges: E[] = [];
  const nearNode = (x: number, z: number, r: number) => {
    const gx = Math.floor(x / MERGE), gz = Math.floor(z / MERGE), reach = Math.ceil(r / MERGE);
    for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) for (const c of cgrid.get(key(gx + a, gz + b)) ?? []) if (Math.hypot(clusters[c].x - x, clusters[c].z - z) < r) return true;
    return false;
  };
  for (const l of lines) {
    let cur: number[] | undefined, curNode = -1;
    for (const v of l.v) {
      if (v.node) {
        const c = clusters[v.cluster];
        if (cur && v.cluster === curNode && cur.length === 2) continue; // vértices-nó repetidos no mesmo nó
        if (cur) { cur.push(c.x, c.z); if (v.cluster !== curNode || cur.length > 4) edges.push({ a: curNode, b: v.cluster, cls: l.cls, pts: cur, alive: true }); }
        cur = [c.x, c.z]; curNode = v.cluster;
      } else if (cur && !nearNode(v.x, v.z, MERGE * .75)) cur.push(v.x, v.z);
    }
  }
  // ---- 5. arestas curtas: ponta solta some; entre dois nós, os nós se fundem; repete até estabilizar ----
  const parent = clusters.map((_, i) => i), nx = clusters.map((c) => c.x), nz = clusters.map((c) => c.z);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const deg = new Array<number>(clusters.length).fill(0);
  const eLen = (e: E) => { const p = e.pts, ra = find(e.a), rb = find(e.b); let s = 0, px = nx[ra], pz = nz[ra]; for (let i = 2; i + 1 < p.length - 2; i += 2) { s += Math.hypot(p[i] - px, p[i + 1] - pz); px = p[i]; pz = p[i + 1]; } return s + Math.hypot(nx[rb] - px, nz[rb] - pz); };
  for (const e of edges) { deg[e.a]++; deg[e.b]++; }
  const collapse = () => {
    let any = false;
    for (let pass = 0; pass < 12; pass++) {
      const short = edges.filter((e) => e.alive).map((e) => ({ e, len: eLen(e) })).filter((q) => q.len < MIN).sort((p, q) => p.len - q.len);
      if (!short.length) break;
      for (const { e } of short) {
        if (!e.alive) continue;
        const ra = find(e.a), rb = find(e.b);
        if (eLen(e) >= MIN) continue;
        any = true;
        if (ra === rb) { e.alive = false; deg[ra] -= 2; continue; }
        if (deg[ra] <= 1 || deg[rb] <= 1) { e.alive = false; deg[ra]--; deg[rb]--; continue; }
        parent[rb] = ra; nx[ra] = (nx[ra] + nx[rb]) / 2; nz[ra] = (nz[ra] + nz[rb]) / 2; deg[ra] += deg[rb] - 2; e.alive = false;
      }
    }
    return any;
  };
  /** pontos da aresta com as pontas nos nós atuais */
  const fullPts = (e: E) => { const p = e.pts.slice(), ra = find(e.a), rb = find(e.b); p[0] = nx[ra]; p[1] = nz[ra]; p[p.length - 2] = nx[rb]; p[p.length - 1] = nz[rb]; return p; };
  /** direção de saída da aresta a partir do nó `n` (ponto a ~10 m) */
  const dirFrom = (e: E, n: number) => {
    let p = fullPts(e); if (find(e.a) !== n) p = reversePts(p);
    let acc = 0, k = 2;
    for (; k + 1 < p.length; k += 2) { acc += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]); if (acc >= 10) break; }
    k = Math.min(k, p.length - 2);
    return Math.atan2(p[k + 1] - p[1], p[k] - p[0]);
  };
  /** duas arestas que saem do mesmo nó na mesma direção e correm lado a lado (vias sobrepostas no OSM): fica só a mais importante, pontas distantes se fundem */
  const dedupeOverlaps = () => {
    let any = false;
    const inc = new Map<number, E[]>();
    for (const e of edges) { if (!e.alive) continue; const ra = find(e.a), rb = find(e.b); for (const n of ra === rb ? [ra] : [ra, rb]) { let l = inc.get(n); if (!l) inc.set(n, l = []); l.push(e); } }
    const alongside = (s: E, l: E, thr: number) => {
      const ps = fullPts(s), pl = fullPts(l); let hit = 0, tot = 0;
      for (let i = 0; i + 3 < ps.length; i += 2) {
        const dx = ps[i + 2] - ps[i], dz = ps[i + 3] - ps[i + 1], n = Math.max(1, Math.round(Math.hypot(dx, dz) / 4));
        for (let k = 0; k <= n; k++) {
          const x = ps[i] + dx * k / n, z = ps[i + 1] + dz * k / n; let best = Infinity;
          for (let j = 0; j + 3 < pl.length; j += 2) { const ex = pl[j + 2] - pl[j], ez = pl[j + 3] - pl[j + 1], l2 = ex * ex + ez * ez, t = l2 ? Math.max(0, Math.min(1, ((x - pl[j]) * ex + (z - pl[j + 1]) * ez) / l2)) : 0; best = Math.min(best, Math.hypot(x - pl[j] - ex * t, z - pl[j + 1] - ez * t)); }
          tot++; if (best < thr) hit++;
        }
      }
      return tot > 0 && hit / tot >= .8;
    };
    for (const [n, list] of inc) {
      if (list.length < 2) continue;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (!A.alive || !B.alive || find(A.a) === find(A.b) || find(B.a) === find(B.b)) continue;
        let d = Math.abs(dirFrom(A, n) - dirFrom(B, n)) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > .45) continue;
        const lenA = eLen(A), lenB = eLen(B), keep = A.cls !== B.cls ? (A.cls < B.cls ? A : B) : (lenA >= lenB ? A : B), gone = keep === A ? B : A;
        const fk = find(keep.a) === n ? find(keep.b) : find(keep.a), fg = find(gone.a) === n ? find(gone.b) : find(gone.a), rn = n;
        // ponta solta (grau 1) paralela a outra via: duplicata OSM mais afastada (até 16 m) também some
        const thr = deg[fg] <= 1 ? 16 : 7;
        if (!alongside(gone, keep, thr) && !alongside(keep, gone, thr)) continue;
        gone.alive = false; deg[rn]--; deg[fg]--; any = true;
        if (fg !== fk && Math.hypot(nx[fg] - nx[fk], nz[fg] - nz[fk]) < 45) { parent[fg] = fk; deg[fk] += deg[fg]; }
      }
    }
    return any;
  };
  for (let round = 0; round < 5; round++) { const c = collapse(), o = dedupeOverlaps(); if (!c && !o) break; }
  collapse();
  edges = edges.filter((e) => e.alive);
  for (const e of edges) { e.a = find(e.a); e.b = find(e.b); }
  edges = edges.filter((e) => e.a !== e.b || polyLen(e.pts) >= 40);
  // arestas duplicadas (mesmos nós, formas parecidas) depois das fusões
  {
    const byPair = new Map<string, E[]>(), drop = new Set<E>();
    for (const e of edges) { const k = e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`; let l = byPair.get(k); if (!l) byPair.set(k, l = []); l.push(e); }
    for (const l of byPair.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      if (drop.has(l[i]) || drop.has(l[j]) || l[i].a === l[i].b) continue;
      // mesmas pontas: some se a mais curta nunca se afasta mais de 20 m da outra (lente / volta duplicada)
      const dist = (a: number[], b: number[]) => {
        let worst = 0;
        for (let i = 0; i + 1 < a.length; i += 2) {
          let best = Infinity;
          for (let j = 0; j + 3 < b.length; j += 2) { const ex = b[j + 2] - b[j], ez = b[j + 3] - b[j + 1], l2 = ex * ex + ez * ez, t = l2 ? Math.max(0, Math.min(1, ((a[i] - b[j]) * ex + (a[i + 1] - b[j + 1]) * ez) / l2)) : 0; best = Math.min(best, Math.hypot(a[i] - b[j] - ex * t, a[i + 1] - b[j + 1] - ez * t)); }
          worst = Math.max(worst, best);
        }
        return worst;
      };
      const short = polyLen(l[i].pts) >= polyLen(l[j].pts) ? l[j] : l[i], long = short === l[i] ? l[j] : l[i];
      if (dist(short.pts, long.pts) < 20) drop.add(short);
    }
    edges = edges.filter((e) => !drop.has(e));
  }
  // pontas soltas (grau 1) coladas a outra via (<= 16 m em 80% do comprimento): sobras de pistas paralelas do OSM
  for (let round = 0; round < 3; round++) {
    const dg = new Map<number, number>();
    for (const e of edges) { dg.set(e.a, (dg.get(e.a) ?? 0) + 1); dg.set(e.b, (dg.get(e.b) ?? 0) + 1); }
    const drop = new Set<E>();
    for (const e of edges) {
      if (e.a === e.b || (dg.get(e.a)! > 1 && dg.get(e.b)! > 1) || polyLen(e.pts) > 220) continue;
      let hit = 0, tot = 0;
      for (let i = 0; i + 1 < e.pts.length; i += 2) {
        let best = Infinity;
        for (const o of edges) {
          if (o === e || drop.has(o) || o.cls > e.cls) continue;
          for (let j = 0; j + 3 < o.pts.length; j += 2) { const ex = o.pts[j + 2] - o.pts[j], ez = o.pts[j + 3] - o.pts[j + 1], l2 = ex * ex + ez * ez, t = l2 ? Math.max(0, Math.min(1, ((e.pts[i] - o.pts[j]) * ex + (e.pts[i + 1] - o.pts[j + 1]) * ez) / l2)) : 0; best = Math.min(best, Math.hypot(e.pts[i] - o.pts[j] - ex * t, e.pts[i + 1] - o.pts[j + 1] - ez * t)); }
        }
        tot++; if (best < 16) hit++;
      }
      if (tot > 0 && hit / tot >= .8) drop.add(e);
    }
    if (!drop.size) break;
    edges = edges.filter((e) => !drop.has(e));
  }
  // coordenadas finais dos nós nas pontas
  const setEnds = (e: E) => { e.pts[0] = nx[e.a]; e.pts[1] = nz[e.a]; e.pts[e.pts.length - 2] = nx[e.b]; e.pts[e.pts.length - 1] = nz[e.b]; };
  for (const e of edges) setEnds(e);
  // ---- 6. nós de grau 2 (mesma categoria) viram junção contínua: as duas arestas viram uma ----
  for (let guard = 0; guard < 100000; guard++) {
    const inc = new Map<number, E[]>();
    for (const e of edges) { for (const n of e.a === e.b ? [e.a, e.a] : [e.a, e.b]) { let l = inc.get(n); if (!l) inc.set(n, l = []); l.push(e); } }
    let changed = false;
    for (const [n, l] of inc) {
      if (l.length !== 2 || l[0] === l[1] || l[0].cls !== l[1].cls) continue;
      const [e1, e2] = l;
      // e1 termina em n, e2 começa em n
      const p1 = e1.b === n ? e1.pts : reversePts(e1.pts), a = e1.b === n ? e1.a : e1.b;
      const p2 = e2.a === n ? e2.pts : reversePts(e2.pts), b = e2.a === n ? e2.b : e2.a;
      if (a === b) continue;
      const merged: E = { a, b, cls: e1.cls, pts: [...p1, ...p2.slice(2)], alive: true };
      edges = edges.filter((e) => e !== e1 && e !== e2); edges.push(merged); changed = true; break;
    }
    if (!changed) break;
  }
  // ---- 7. saída compacta ----
  const used = new Map<number, number>(), nodes: RoadNode[] = [];
  const idOf = (n: number) => { let i = used.get(n); if (i === undefined) { i = nodes.length; used.set(n, i); nodes.push({ id: i, x: nx[n], z: nz[n], y: opts.heightAt ? opts.heightAt(nx[n], nz[n]) : 0 }); } return i; };
  const out: RoadEdge[] = edges.map((e) => {
    const a = idOf(e.a), b = idOf(e.b), pts = opts.smooth ? opts.smooth(e.pts) : e.pts;
    return { a, b, width: WIDTH, cls: e.cls, pts };
  });
  return { nodes, edges: out };
}
function reversePts(p: number[]) { const r: number[] = []; for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]); return r; }

/** Histograma de graus dos nós (para testes e diagnóstico). */
export function degreeHistogram(g: RoadGraph) {
  const deg = new Array<number>(g.nodes.length).fill(0);
  for (const e of g.edges) { deg[e.a]++; deg[e.b]++; }
  const h: Record<number, number> = {};
  for (const d of deg) h[d] = (h[d] ?? 0) + 1;
  return h;
}
