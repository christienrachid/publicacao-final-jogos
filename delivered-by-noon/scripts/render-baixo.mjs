// Render em perspectiva (z-buffer em software, duas faces) da torre do heliponto e da rampa, de um ponto de vista dado.
// Uso: node scripts/render-baixo.mjs saida.png ex ey ez  alvoX alvoY alvoZ [pixels] [fov]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { build } from 'vite';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2]);
const [ex, ey, ez, tx, ty, tz] = process.argv.slice(3, 9).map(Number), size = Number(process.argv[9] ?? 900), fov = Number(process.argv[10] ?? 70);
const bundle = await build({ configFile: false, logLevel: 'silent', root, build: { write: false, lib: { entry: resolve(root, 'src/flight/world-data.ts'), formats: ['es'] }, minify: false } });
const data = await import(`data:text/javascript;base64,${Buffer.from((Array.isArray(bundle) ? bundle[0] : bundle).output[0].code).toString('base64')}`);
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((q) => q / l); };
const sub = (a, b) => a.map((q, i) => q - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const f = norm(sub([tx, ty, tz], [ex, ey, ez])), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), k = 1 / Math.tan(fov * Math.PI / 360);
const color = new Uint8Array(size * size * 3), depth = new Float32Array(size * size).fill(1e9);
for (let i = 0; i < size * size; i++) { color[i * 3] = 150; color[i * 3 + 1] = 190; color[i * 3 + 2] = 235; }
const proj = (p) => { const q = sub(p, [ex, ey, ez]), z = dot(q, f); return [size / 2 + dot(q, r) / z * k * size / 2, size / 2 - dot(q, u) / z * k * size / 2, z]; };
function tri(a, b, c, rgb) {
  const A = proj(a), B = proj(b), C = proj(c);
  if (A[2] < .3 || B[2] < .3 || C[2] < .3) return;
  const n = norm(cross(sub(b, a), sub(c, a))), toEye = norm(sub([ex, ey, ez], a)), shade = .45 + .55 * Math.abs(n[1] * .7 + n[0] * .3 - n[2] * .2) * (dot(n, toEye) < 0 ? .85 : 1);
  const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), maxX = Math.min(size - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
  const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), maxY = Math.min(size - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
  const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(d) < 1e-9) return;
  for (let j = minY; j <= maxY; j++) for (let i = minX; i <= maxX; i++) {
    const x = i + .5, y = j + .5, w0 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / d, w1 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / d, w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    const z = w0 * A[2] + w1 * B[2] + w2 * C[2], q = j * size + i; if (z >= depth[q]) continue; depth[q] = z;
    for (let t = 0; t < 3; t++) color[q * 3 + t] = Math.min(255, rgb[t] * shade);
  }
}
function draw(mesh, flat) {
  const { pos, idx, col } = mesh;
  for (let t = 0; t < idx.length; t += 3) { const v = [0, 1, 2].map((q) => [pos[idx[t + q] * 3], pos[idx[t + q] * 3 + 1], pos[idx[t + q] * 3 + 2]]); const i = idx[t]; tri(v[0], v[1], v[2], flat ?? [col[i * 4], col[i * 4 + 1], col[i * 4 + 2]]); }
}
const city = data.cityData();
draw(data.terrainData(), [120, 160, 95]);
draw(city.mesh); draw(city.houses);
for (const p of data.airportData(city.helipad).parts) if (/ampa|Patamar|Ponte|Guarda|Estrutura|Pilar/.test(p.name)) draw(p.mesh);
const stride = size * 3 + 1, raw = Buffer.alloc(stride * size);
for (let y = 0; y < size; y++) Buffer.from(color.buffer, y * size * 3, size * 3).copy(raw, y * stride + 1);
const chunk = (type, bytes) => { const payload = Buffer.concat([Buffer.from(type), bytes]); let crc = 0xffffffff; for (const byte of payload) { crc ^= byte; for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } const l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(bytes.length); c.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([l, payload, c]); };
const head = Buffer.alloc(13); head.writeUInt32BE(size); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('ok', out, 'helipad', JSON.stringify(city.helipad));
