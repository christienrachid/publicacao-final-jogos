// Render de cima (ortográfico, z-buffer em software) do mundo gerado por world-data.ts, para conferência.
// Uso: node scripts/render-topo.mjs [saida.png] [cx cz meia-largura pixels]
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] ?? 'dados-locais/renders/jf-topo.png');
const [cx, cz, half, size] = process.argv.length > 3 ? process.argv.slice(3, 7).map(Number) : [0, 0, 3000, 1800];
const entry = process.env.WORLD_ENTRY ? resolve(process.env.WORLD_ENTRY) : resolve(root, 'src/flight/world-data.ts');
const bundle = await build({ configFile: false, logLevel: 'silent', root, build: { write: false, lib: { entry, formats: ['es'] }, minify: false } });
const data = await import(`data:text/javascript;base64,${Buffer.from((Array.isArray(bundle) ? bundle[0] : bundle).output[0].code).toString('base64')}`);

const color = new Uint8Array(size * size * 3), depth = new Float32Array(size * size).fill(-1e9);
const px = (x) => (x - (cx - half)) / (2 * half) * size, pz = (z) => (z - (cz - half)) / (2 * half) * size;
const L = [-0.45, 0.8, -0.35]; // luz (de cima, de lado)
function tri(a, b, c, shade, mapper) {
  // a,b,c: [x,y,z,r,g,b]
  const ax = px(a[0]), az = pz(a[2]), bx = px(b[0]), bz = pz(b[2]), cx2 = px(c[0]), cz2 = pz(c[2]);
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx2))), maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx2)));
  const minZ = Math.max(0, Math.floor(Math.min(az, bz, cz2))), maxZ = Math.min(size - 1, Math.ceil(Math.max(az, bz, cz2)));
  const d = (bz - cz2) * (ax - cx2) + (cx2 - bx) * (az - cz2);
  if (Math.abs(d) < 1e-9) return;
  for (let j = minZ; j <= maxZ; j++) for (let i = minX; i <= maxX; i++) {
    const x = i + .5, z = j + .5;
    const w0 = ((bz - cz2) * (x - cx2) + (cx2 - bx) * (z - cz2)) / d, w1 = ((cz2 - az) * (x - cx2) + (ax - cx2) * (z - cz2)) / d, w2 = 1 - w0 - w1;
    if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
    const y = w0 * a[1] + w1 * b[1] + w2 * c[1], k = j * size + i;
    if (y < depth[k]) continue;
    depth[k] = y;
    const attr = [0, 1, 2].map((q) => w0 * a[3 + q] + w1 * b[3 + q] + w2 * c[3 + q]);
    const rgb = mapper ? mapper(attr[0], attr[1]) : attr;
    for (let q = 0; q < 3; q++) color[k * 3 + q] = Math.max(0, Math.min(255, rgb[q] * shade));
  }
}
function draw(mesh, colorOf, bias = 0, mapper = null) {
  const { pos, idx, col, uv } = mesh;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [0, 1, 2].map((q) => { const i = idx[t + q]; return [pos[i * 3], pos[i * 3 + 1] + bias, pos[i * 3 + 2], ...(colorOf ? colorOf(i, uv) : [col[i * 4], col[i * 4 + 1], col[i * 4 + 2]])]; });
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...n) || 1; n = n.map((q) => q / len);
    if (n[1] < 0) continue; // só faces voltadas para cima (de cima não se vê o resto) e telhados
    tri(v[0], v[1], v[2], 0.55 + 0.6 * Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]), mapper);
  }
}
// Estrada: asfalto/calçada pela coordenada u da textura
const roadColor = (i, uv) => [uv[i * 2], uv[i * 2 + 1], 0];
const roadMap = (u, v) => (u < .14 || u > .86 ? [163, 166, 170] : (Math.abs(u - .19) < .012 || Math.abs(u - .8) < .012) ? [238, 233, 213] : Math.abs(u - .5) < .03 && (v % 1) > .37 && (v % 1) < .8 ? [238, 233, 213] : [70, 70, 80]);
const city = data.cityData(), details = data.cityDetails(city);
draw(data.terrainData(), null);
draw(details.meshes.ground, null, 0);
draw(details.meshes.roads, roadColor, 0, roadMap);
draw(city.mesh, null);
draw(city.houses, null);
let bairrosCount = 0;
if (data.BAIRROS_MOD && !process.env.WORLD_NO_BAIRROS) {
  draw(data.BAIRROS_MOD.bairrosData(), null);
  bairrosCount = data.BAIRROS_MOD.bairrosLots().length;
}
draw(details.meshes.props, null);
for (const part of data.airportData(city.helipad).parts) draw(part.mesh, null);
for (const part of data.deliveryRampData().parts) draw(part.mesh, null);

function png(w, h, rgb) {
  const stride = w * 3 + 1, raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) { raw[y * stride] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * stride + 1); }
  const chunk = (type, bytes) => {
    const payload = Buffer.concat([Buffer.from(type), bytes]);
    let crc = 0xffffffff;
    for (const byte of payload) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const len = Buffer.alloc(4), chk = Buffer.alloc(4); len.writeUInt32BE(bytes.length); chk.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, payload, chk]);
  };
  const head = Buffer.alloc(13); head.writeUInt32BE(w); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
await mkdir(dirname(out), { recursive: true });
await writeFile(out, png(size, size, color));
console.log(`render: ${out} (${size}x${size}, ${(2 * half / size).toFixed(2)} m/px); casas ${city.houseCount + bairrosCount}, prédios ${city.boxes.length - city.houseCount}`);
