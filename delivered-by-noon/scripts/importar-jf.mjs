// Importa Juiz de Fora (OpenStreetMap + relevo AWS Terrain Tiles) e gera src/flight/jf-mundo.json:
// coordenadas já projetadas em metros do jogo (ESCALA), sem dependências além do Node.
// Uso: node scripts/importar-jf.mjs            (baixa os tiles de relevo que faltarem em dados-locais/dem)
// Dados: © colaboradores do OpenStreetMap (ODbL); relevo: Mapzen/AWS Terrain Tiles (terrarium).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const osmFile = resolve(root, 'dados-locais/osm/jf.json');
const demDir = resolve(root, 'dados-locais/dem');
const outFile = resolve(root, 'src/flight/jf-mundo.json');

const ESCALA = 0.49;                       // metros reais -> metros do jogo
const ORIGEM = { lat: -21.7982816, lon: -43.3867538 }; // cabeceira sul da pista (OSM, SBJF)
const DESLOC = { x: -1380, z: 745 };       // centra a cidade em +-2950 (limite do voo: 2980); pista cobre z=410
const LIMITE = 2950;                       // nada fora de [-LIMITE, LIMITE]
const PASSO = 30;                          // grade do relevo (m do jogo)
const MEIO = 3000;                         // o relevo cobre [-3000, 3000]
const ESC_VERT = 0.6;                      // relevo real x 0,6 (horizontal 0,5): leve exagero
const BASE_Y = 8;                          // altura do Centro (m); o mínimo do terreno é 2 m
const ZOOM = 13;

const mPorGrauLat = 110574, mPorGrauLon = 111320 * Math.cos(ORIGEM.lat * Math.PI / 180);
const osm = JSON.parse(await readFile(osmFile, 'utf8'));
const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry);
// O mapa inteiro gira ~5,4° para a pista (03/21 do SBJF) ficar exatamente norte-sul: o fdm assume pista no eixo Z.
const pistaOsm = ways.find((w) => w.tags?.aeroway === 'runway').geometry;
const ROT = Math.atan2((pistaOsm.at(-1).lon - pistaOsm[0].lon) * mPorGrauLon, (pistaOsm.at(-1).lat - pistaOsm[0].lat) * mPorGrauLat);
const cs = Math.cos(ROT), sn = Math.sin(ROT);
const proj = (lat, lon) => {
  const x = (lon - ORIGEM.lon) * mPorGrauLon * ESCALA, z = -(lat - ORIGEM.lat) * mPorGrauLat * ESCALA;
  return [x * cs + z * sn + DESLOC.x, -x * sn + z * cs + DESLOC.z];
};
const inv = (X, Z) => {
  const x = X - DESLOC.x, z = Z - DESLOC.z, ux = x * cs - z * sn, uz = x * sn + z * cs;
  return [ORIGEM.lat - uz / (mPorGrauLat * ESCALA), ORIGEM.lon + ux / (mPorGrauLon * ESCALA)];
};

function decodePng(buf) {
  let p = 8, w = 0, h = 0, type = 0, depth = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), name = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; if (data[12]) throw new Error('PNG entrelaçado'); }
    else if (name === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6)) throw new Error(`PNG não suportado: depth ${depth} type ${type}`);
  const bpp = type === 2 ? 3 : 4, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[o + i - bpp] : 0, b = y ? out[o - stride + i] : 0, c = i >= bpp && y ? out[o - stride + i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[o + i] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

const tiles = new Map();
async function tile(tx, ty) {
  const key = `${ZOOM}/${tx}/${ty}`;
  if (tiles.has(key)) return tiles.get(key);
  const file = resolve(demDir, `${ZOOM}-${tx}-${ty}.png`);
  if (!existsSync(file)) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    await mkdir(demDir, { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  const t = decodePng(await readFile(file));
  tiles.set(key, t);
  return t;
}
const worldPx = (lat, lon) => {
  const n = 2 ** ZOOM * 256, s = Math.sin(lat * Math.PI / 180);
  return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};
const texel = (px, py) => {
  const t = tiles.get(`${ZOOM}/${Math.floor(px / 256)}/${Math.floor(py / 256)}`);
  const x = Math.floor(px) % 256, y = Math.floor(py) % 256, i = (y * 256 + x) * t.bpp;
  return t.px[i] * 256 + t.px[i + 1] + t.px[i + 2] / 256 - 32768;
};
const elevacao = (lat, lon) => {
  const [px, py] = worldPx(lat, lon), x0 = Math.floor(px - .5), y0 = Math.floor(py - .5), fx = px - .5 - x0, fy = py - .5 - y0;
  const a = texel(x0, y0), b = texel(x0 + 1, y0), c = texel(x0, y0 + 1), d = texel(x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
};

const r1 = (v) => Math.round(v * 10) / 10;
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = 0, at = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    for (let i = a + 1; i < b; i++) {
      const t = len2 ? Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - az) * dz) / len2)) : 0;
      const d = Math.hypot(pts[i][0] - ax - dx * t, pts[i][1] - az - dz * t);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function recorta(pts) {
  const dentro = ([x, z]) => Math.abs(x) <= LIMITE && Math.abs(z) <= LIMITE;
  const partes = []; let atual = [];
  for (const p of pts) {
    if (dentro(p)) atual.push(p);
    else { if (atual.length > 1) partes.push(atual); atual = []; }
  }
  if (atual.length > 1) partes.push(atual);
  return partes;
}
const achata = (pts) => pts.flatMap(([x, z]) => [r1(x), r1(z)]);
const area = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length]; s += x0 * z1 - x1 * z0; } return s / 2; };
const centro = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

const geom = (w) => w.geometry.map((g) => proj(g.lat, g.lon));
const CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];

const vias = Object.fromEntries(CLASSES.map((c) => [c, []]));
let totalVias = 0;
for (const w of ways) {
  const c = w.tags?.highway;
  if (!CLASSES.includes(c) || w.tags.tunnel === 'yes' || w.tags.area === 'yes') continue;
  for (const parte of recorta(geom(w))) {
    const s = simplify(parte, 2.2);
    vias[c].push(achata(s)); totalVias += s.length;
  }
}

const rioWay = ways.find((w) => w.tags?.waterway === 'river');
const rio = rioWay ? recorta(geom(rioWay)).map((p) => achata(simplify(p, 3))) : [];

const poligono = (w, tol, minArea) => {
  const p = geom(w); if (p.length < 4) return null;
  const q = simplify(p.slice(0, -1), tol);
  if (q.length < 3 || Math.abs(area(q)) < minArea) return null;
  if (!q.every(([x, z]) => Math.abs(x) <= LIMITE && Math.abs(z) <= LIMITE)) return null;
  return { pts: achata(q), nome: w.tags?.name ?? '' };
};
const parques = ways.filter((w) => w.tags?.leisure === 'park' && w.tags.landuse !== 'recreation_ground').map((w) => poligono(w, 2, 500)).filter(Boolean);
const estadios = ways.filter((w) => w.tags?.leisure === 'stadium').map((w) => poligono(w, 1.5, 80)).filter(Boolean);
const universidades = ways.filter((w) => w.tags?.amenity === 'university').map((w) => poligono(w, 2, 300)).filter(Boolean);
const aero = ways.find((w) => w.tags?.aeroway === 'aerodrome');
const aeroporto = aero ? poligono(aero, 3, 1000) : null;

const pistaWay = ways.find((w) => w.tags?.aeroway === 'runway');
const pg = geom(pistaWay), pista = {
  a: pg[0].map(r1), b: [r1(pg[0][0]), r1(pg[pg.length - 1][1])], largura: 30, rotacaoGraus: r1(ROT * 180 / Math.PI),
  comprimentoReal: Number(pistaWay.tags.length ?? 1535),
};

const pois = osm.elements.filter((e) => e.type === 'node' && e.tags?.place);
const bairros = pois.map((e) => ({ nome: e.tags.name, x: r1(proj(e.lat, e.lon)[0]), z: r1(proj(e.lat, e.lon)[1]) }))
  .filter((b) => Math.abs(b.x) <= LIMITE && Math.abs(b.z) <= LIMITE);
const todos = pois.map((e) => ({ nome: e.tags.name, x: r1(proj(e.lat, e.lon)[0]), z: r1(proj(e.lat, e.lon)[1]) }));
const bairro = (nome) => { const b = bairros.find((q) => q.nome === nome); if (!b) throw new Error(`bairro ${nome}`); return [b.x, b.z]; };
const polUFJF = ways.find((w) => w.tags?.name === 'Universidade Federal de Juiz de Fora');
const polMario = ways.find((w) => w.tags?.name?.includes('Mario Hel'));

const cantos = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => inv(a * (MEIO + 80), b * (MEIO + 80)));
const latMin = Math.min(...cantos.map((c) => c[0])), latMax = Math.max(...cantos.map((c) => c[0]));
const lonMin = Math.min(...cantos.map((c) => c[1])), lonMax = Math.max(...cantos.map((c) => c[1]));
const [pxa, pya] = worldPx(latMax, lonMin), [pxb, pyb] = worldPx(latMin, lonMax);
for (let ty = Math.floor(pya / 256); ty <= Math.floor(pyb / 256); ty++) for (let tx = Math.floor(pxa / 256); tx <= Math.floor(pxb / 256); tx++) await tile(tx, ty);

const N = (2 * MEIO) / PASSO + 1;
const bruto = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  let s = 0;
  for (const oz of [-10, 0, 10]) for (const ox of [-10, 0, 10]) { const [la, lo] = inv(-MEIO + i * PASSO + ox, -MEIO + j * PASSO + oz); s += elevacao(la, lo); }
  bruto[j * N + i] = s / 9;
}
const suave = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  let s = 0, c = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
    const w = di || dj ? 1 : 2; s += bruto[jj * N + ii] * w; c += w;
  }
  suave[j * N + i] = s / c;
}
const eMin = Math.min(...suave), eMax = Math.max(...suave);
const eCentro = elevacao(-21.7601, -43.3463);
const dem = new Int16Array(N * N);
for (let k = 0; k < dem.length; k++) dem[k] = Math.round(Math.max(2, BASE_Y + (suave[k] - eCentro) * ESC_VERT) * 10);

const [mx, mz] = bairro('Morro do Imperador');
let cristo = [mx, mz], hc = -1;
for (let dz = -225; dz <= 225; dz += 5) for (let dx = -225; dx <= 225; dx += 5) {
  const [la, lo] = inv(mx + dx, mz + dz), e = elevacao(la, lo);
  if (Math.hypot(dx, dz) <= 225 && e > hc) { hc = e; cristo = [mx + dx, mz + dz]; }
}

const ponto = (lat, lon) => proj(lat, lon).map(r1);
const marcos = {
  centro: ponto(-21.7601, -43.3463),
  uniacademia: ponto(-21.7626, -43.3530),
  ufjf: centro(geom(polUFJF)).map(r1),
  cristo: cristo.map(r1),
  estadio: centro(geom(polMario)).map(r1),
  aeroporto: pista.a,
  pocoRico: bairro('Poço Rico'),
  granbery: bairro('Granbery'),
  altoDosPassos: bairro('Alto dos Passos'),
  salvaterra: bairro('Salvaterra'),
  santaHelena: bairro('Jardim Santa Helena'),
  santaCecilia: bairro('Santa Cecília'),
  industrial: bairro('Bairro Industrial'),
  linhares: bairro('Linhares'),
};

const mundo = {
  escala: ESCALA, escalaVertical: ESC_VERT, origem: ORIGEM, deslocamento: DESLOC, limite: LIMITE,
  relevo: { passo: PASSO, meio: MEIO, n: N, elevMinReal: Math.round(eMin), elevMaxReal: Math.round(eMax), dm: Buffer.from(dem.buffer).toString('base64') },
  vias, rio, parques, estadios, universidades, aeroporto, pista, bairros, marcos,
  creditos: '© colaboradores do OpenStreetMap (ODbL); relevo AWS Terrain Tiles',
};
const json = JSON.stringify(mundo);
if (Buffer.byteLength(json) > 1_500_000) throw new Error(`jf-mundo.json passou de 1,5 MB: ${Buffer.byteLength(json)}`);
await writeFile(outFile, json);
console.log(`jf-mundo.json: ${Buffer.byteLength(json)} bytes; vias ${CLASSES.map((c) => `${c}=${vias[c].length}`).join(' ')} (${totalVias} pts); rio ${rio.length}; parques ${parques.length}; estádios ${estadios.length}; universidades ${universidades.length}`);
console.log(`relevo real ${Math.round(eMin)}..${Math.round(eMax)} m (Centro ${Math.round(eCentro)} m); cristo`, marcos.cristo);
