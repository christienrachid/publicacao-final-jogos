import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { Document, NodeIO } from '@gltf-transform/core';
import { PlaneGeometry, SphereGeometry } from 'playcanvas';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Bundle the same TypeScript generator used by the game, without writing intermediate files.
const bundle = await build({
  configFile: false, logLevel: 'silent', root,
  build: { write: false, lib: { entry: resolve(root, 'src/flight/world-data.ts'), formats: ['es'] }, minify: false },
});
const data = await import(`data:text/javascript;base64,${Buffer.from((Array.isArray(bundle) ? bundle[0] : bundle).output[0].code).toString('base64')}`);

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function png(image) {
  const { width, height, rectangles, gradient } = image;
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const t = (y + 0.5) / height;
    const end = gradient.findIndex(([offset]) => offset >= t);
    const stops = gradient.length ? [gradient[Math.max(0, end - 1)], gradient[end < 0 ? gradient.length - 1 : end]] : null;
    const a = stops && rgb(stops[0][1]);
    const b = stops && rgb(stops[1][1]);
    const mix = stops && stops[0][0] !== stops[1][0] ? (t - stops[0][0]) / (stops[1][0] - stops[0][0]) : 0;
    for (let x = 0; x < width; x++) {
      let color = a ? a.map((v, i) => Math.round(v + (b[i] - v) * mix)) : [0, 0, 0];
      for (const r of rectangles) {
        if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) color = rgb(r.color);
      }
      pixels.set([...color, 255], y * stride + x * 4 + 1);
    }
  }
  function chunk(type, bytes) {
    const payload = Buffer.concat([Buffer.from(type), bytes]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4), check = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length); check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, payload, check]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

// Standard material extensions need no extra dependency or binary resources.
function materialExtensions(bytes, extensions) {
  const source = Buffer.from(bytes);
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  for (const [name, value] of extensions) {
    const material = json.materials.find((m) => m.name === name);
    assert(material, `Missing material: ${name}`);
    material.extensions = value;
  }
  json.extensionsUsed = [...new Set(extensions.flatMap(([, value]) => Object.keys(value)))];
  if (json.extensionsUsed.includes('KHR_materials_unlit')) json.extensionsRequired = ['KHR_materials_unlit'];
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(padded);
  const header = Buffer.from(source.subarray(0, 20));
  header.writeUInt32LE(20 + padded.length + source.length - 20 - jsonLength, 8);
  header.writeUInt32LE(padded.length, 12);
  return Buffer.concat([header, padded, source.subarray(20 + jsonLength)]);
}

const plane = new PlaneGeometry();
const sphere = new SphereGeometry();
const primitiveData = (g) => ({ pos: g.positions, normals: g.normals, idx: g.indices, uv: g.uvs });
const linear = (v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const io = new NodeIO();
const outputs = [];
function scene(name) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const rootNode = doc.createNode(name);
  doc.createScene(name).addChild(rootNode);
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  function mesh(name, geometry, material, inward = false) {
    const { pos, normals, idx, col, uv } = geometry;
    assert.equal(pos.length % 3, 0); if(normals)assert.equal(normals.length, pos.length);
    assert.equal(idx.length % 3, 0);
    assert(pos.every(Number.isFinite) && (!normals||normals.every(Number.isFinite)));
    assert(idx.every((i) => Number.isInteger(i) && i >= 0 && i < pos.length / 3));
    const indices = inward ? idx.flatMap((_, i) => i % 3 ? [] : [idx[i], idx[i + 2], idx[i + 1]]) : idx;
    const primitive = doc.createPrimitive().setMaterial(material)
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(pos)))
      .setIndices(accessor('SCALAR', pos.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)));
    if(normals)primitive.setAttribute('NORMAL', accessor('VEC3', new Float32Array(inward ? normals.map((v) => -v) : normals)));
    if (col) {
      assert.equal(col.length, pos.length / 3 * 4);
      primitive.setAttribute('COLOR_0', accessor('VEC4', new Uint8Array(col)).setNormalized(true));
    }
    if (uv) {
      assert.equal(uv.length, pos.length / 3 * 2);
      primitive.setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uv)));
    }
    return doc.createMesh(name).addPrimitive(primitive);
  }
  function material(name, color = [1, 1, 1], gloss = 0.25, emissive = [0, 0, 0]) {
    return doc.createMaterial(name).setBaseColorFactor([...color.map(linear), 1])
      .setMetallicFactor(0).setRoughnessFactor(1 - gloss).setEmissiveFactor(emissive.map(linear));
  }
  function texture(name, image) {
    return doc.createTexture(name).setMimeType('image/png').setImage(png(image));
  }
  function node(parent, name, mesh, translation = [0, 0, 0], scale = [1, 1, 1]) {
    const n = doc.createNode(name).setTranslation(translation).setScale(scale);
    if (mesh) n.setMesh(mesh);
    parent.addChild(n);
    return n;
  }
  async function output(file, extensions = []) {
    const overrides = new Map(extensions);
    extensions = doc.getRoot().listMaterials().map((m) => {
      const extra = overrides.get(m.getName()) ?? {};
      // StandardMaterial defaults to black specular; glTF defaults to a dielectric highlight.
      return [m.getName(), extra.KHR_materials_unlit || extra.KHR_materials_pbrSpecularGlossiness
        ? extra : { KHR_materials_specular: { specularFactor: 0 }, ...extra }];
    });
    let bytes = await io.writeBinary(doc);
    if (extensions.length) bytes = materialExtensions(bytes, extensions);
    // Decode the finished container and verify all resources are embedded and buffer views fit.
    const { json } = await io.binaryToJSON(bytes);
    assert.equal(json.asset.version, '2.0');
    assert(json.nodes.some((n) => n.name === name));
    assert(json.buffers.every((b) => !b.uri));
    assert((json.images ?? []).every((i) => i.bufferView !== undefined && !i.uri));
    for (const view of json.bufferViews) assert((view.byteOffset ?? 0) + view.byteLength <= json.buffers[view.buffer].byteLength);
    if(file==='mundo-cidade.glb')assert(bytes.length<2_700_000,`City exceeds 2.7 MB: ${bytes.length} bytes`);
    outputs.push({ file: resolve(root, 'public/models', file), bytes });
  }
  return { rootNode, mesh, material, texture, node, output };
}

const terrain = data.terrainData();
const city = data.cityData();
assert.deepEqual(terrain, data.terrainData(), 'Terrain must be deterministic');
assert.deepEqual(city, data.cityData(), 'City/collision boxes must be deterministic');
assert.deepEqual(data.cloudData(), data.cloudData(), 'Clouds must be deterministic');
assert.deepEqual(data.windowImages(), data.windowImages(), 'Windows must be deterministic');

{
  const s = scene('Terreno');
  // Sem NORMAL: a engine calcula as normais suaves do índice (economiza ~0,5 MB).
  s.node(s.rootNode, 'Relevo', s.mesh('Terreno', { ...terrain, normals: null }, s.material('Terreno', [1, 1, 1], 0.1)));
  await s.output('mundo-terreno.glb');
}
{
  const s = scene('Cidade');
  const images = data.windowImages();
  const facade = s.material('Fachadas', [1, 1, 1], 0.3, [1, 1, 1])
    .setBaseColorTexture(s.texture('Janelas - difuso', images.diffuse))
    .setEmissiveTexture(s.texture('Janelas - emissivo', images.emissive));
  s.node(s.rootNode, 'Predios', s.mesh('Predios', { ...city.mesh, normals: null }, facade));
  if (city.houses.pos.length) s.node(s.rootNode, 'Casas', s.mesh('Casas', { ...city.houses, normals: null }, s.material('Casas', [1, 1, 1], 0.15)));
  const details=data.cityDetails(city),streetImages=data.cityStreetImages();
  // shortcut: PlayCanvas regenerates detail normals; export them if another viewer needs authored smoothing.
  for(const name of ['roads','ground','props','lamps']) {
    const material=s.material(name==='lamps'?'Lampadas dos postes':name,name==='lamps'?[1,.82,.48]:[1,1,1],.1,name==='lamps'?[1,.82,.48]:[0,0,0]);
    if(name==='roads')material.setBaseColorTexture(s.texture('Asfalto e faixas',streetImages.road));
    if(name==='lamps')material.setDoubleSided(true);
    s.node(s.rootNode,name,s.mesh(name,{...details.meshes[name],normals:null,col:name==='roads'?null:details.meshes[name].col},material));
  }
  await s.output('mundo-cidade.glb', [['Fachadas', { KHR_materials_emissive_strength: { emissiveStrength: 1.6 } }],['Lampadas dos postes',{KHR_materials_emissive_strength:{emissiveStrength:1.8}}]]);
}
// Módulo opcional dos bairros (Gemini): exporta bairrosData() como mundo-bairros.glb usando o mesmo atlas de fachadas
if (data.BAIRROS_MOD) {
  const s = scene('Bairros');
  const images = data.windowImages();
  const bairrosMat = s.material('Fachadas bairros', [1, 1, 1], 0.25, [1, 1, 1])
    .setBaseColorTexture(s.texture('Janelas bairros - difuso', images.diffuse))
    .setEmissiveTexture(s.texture('Janelas bairros - emissivo', images.emissive));
  s.node(s.rootNode, 'Bairros', s.mesh('Bairros', { ...data.BAIRROS_MOD.bairrosData(), normals: null }, bairrosMat));
  await s.output('mundo-bairros.glb', [['Fachadas bairros', { KHR_materials_emissive_strength: { emissiveStrength: 1.6 } }]]);
}
{
  const s = scene('Mar');
  s.node(s.rootNode, 'Agua', s.mesh('Mar', primitiveData(plane), s.material('Agua', [0.12, 0.52, 0.62], 0.85)), [0, 0, 0], [data.WORLD_SIZE * 3, 1, data.WORLD_SIZE * 3]);
  // shortcut: PC 2.24 leaves glossInvert on for this extension; set it false on import in that engine version.
  await s.output('mundo-mar.glb', [['Agua', { KHR_materials_pbrSpecularGlossiness: {
    diffuseFactor: [...[0.12, 0.52, 0.62].map(linear), 1],
    specularFactor: [0.9, 0.75, 0.6].map(linear), glossinessFactor: 0.85,
  } }]]);
}
{
  const s = scene('Nuvens');
  const puff = s.mesh('Nuvem clara', primitiveData(sphere), s.material('Nuvem clara', [0.95, 0.86, 0.92], 0, [0.45, 0.32, 0.42]));
  const shade = s.mesh('Nuvem sombreada', primitiveData(sphere), s.material('Nuvem sombreada', [0.62, 0.52, 0.78], 0.25, [0.2, 0.16, 0.3]));
  for (const [i, cloud] of data.cloudData().entries()) {
    const parent = s.node(s.rootNode, `Nuvem ${i + 1}`, null, cloud.position);
    for (const [k, p] of cloud.puffs.entries()) s.node(parent, `Volume ${k + 1}`, p.shade ? shade : puff, p.position, p.scale);
  }
  await s.output('mundo-nuvens.glb');
}
{
  const s = scene('Ceu');
  // shortcut: glTF has no fog/depth-write flags; disable fog and depth writing on this material in the Editor.
  const sky = s.material('Degrade do ceu').setBaseColorTexture(s.texture('Por do sol', data.skyImage()));
  sky.getBaseColorTextureInfo().setWrapS(33071).setWrapT(33071).setMinFilter(9729).setMagFilter(9729);
  s.node(s.rootNode, 'Domo', s.mesh('Domo interior', primitiveData(sphere), sky, true), [0, 0, 0], [9000, 9000, 9000]);
  await s.output('mundo-ceu.glb', [['Degrade do ceu', { KHR_materials_unlit: {} }]]);
}
{
  const s = scene('Aeroporto');
  const material = s.material('Asfalto e marcacoes');
  for (const part of [...data.airportData(city.helipad).parts,...data.deliveryRampData().parts]) s.node(s.rootNode, part.name, s.mesh(part.name, { ...part.mesh, normals: null }, material));
  await s.output('mundo-aeroporto.glb');
}
const total = outputs.reduce((sum, { bytes }) => sum + bytes.length, 0);
assert(total < 5_100_000, `World exceeds 5.1 MB: ${total} bytes`);
await mkdir(resolve(root, 'public/models'), { recursive: true });
for (const { file, bytes } of outputs) {
  await writeFile(file, bytes);
  console.log(`${file}: ${bytes.length} bytes`);
}
console.log(`Total: ${total} bytes (< 5.1 MB)`);

