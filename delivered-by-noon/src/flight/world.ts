import {
  type AppBase,
  ADDRESS_CLAMP_TO_EDGE,
  CULLFACE_FRONT,
  CULLFACE_NONE,
  Color,
  Entity,
  Mesh,
  MeshInstance,
  PIXELFORMAT_SRGBA8,
  StandardMaterial,
  Texture,
} from 'playcanvas';
import { WORLD_SIZE, UNIACADEMIA, airportData, deliveryRampData, landmarkBoxes, buildingColliders, createWorldPhysics, terrainData, cityData, cityDetails, cityStreetImages, cloudData, windowImages, skyImage, type Box, type MeshData, type ImageData } from './world-data';
import { buildLandmark } from './models';
export { WORLD_SIZE, terrainHeight, type Box } from './world-data';

// ---------------------------------------------------------------------------
// Utilitários de malha
// ---------------------------------------------------------------------------
function buildMesh(app: AppBase, { pos, normals, idx, col, uv }: MeshData) {
  const mesh = new Mesh(app.graphicsDevice);
  mesh.setPositions(pos);
  mesh.setNormals(normals);
  mesh.setColors32(col);
  if (uv) mesh.setUvs(0, uv);
  mesh.setIndices(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx));
  mesh.update();
  return mesh;
}

function imageCanvas(data: ImageData) {
  const c = document.createElement('canvas');
  c.width = data.width;
  c.height = data.height;
  const g = c.getContext('2d')!;
  if (data.gradient.length) {
    const grad = g.createLinearGradient(0, 0, 0, data.height);
    for (const [offset, color] of data.gradient) grad.addColorStop(offset, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, data.width, data.height);
  }
  for (const rect of data.rectangles) {
    g.fillStyle = rect.color;
    g.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  return c;
}

function meshEntity(parent: Entity, name: string, mesh: Mesh, material: StandardMaterial) {
  const e = new Entity(name);
  e.addComponent('render', { meshInstances: [new MeshInstance(mesh, material)] });
  parent.addChild(e);
  return e;
}

function buildTerrain(app: AppBase, parent: Entity, materials: StandardMaterial[]) {
  const m = new StandardMaterial();
  m.diffuseVertexColor = true;
  m.gloss = 0.1;
  m.update();
  materials.push(m);
  meshEntity(parent, 'Terrain', buildMesh(app, terrainData()), m);
}

// ---------------------------------------------------------------------------
// Mar
// ---------------------------------------------------------------------------
function buildSea(parent: Entity, materials: StandardMaterial[]) {
  const m = new StandardMaterial();
  m.diffuse = new Color(0.12, 0.52, 0.62);
  m.specular = new Color(0.9, 0.75, 0.6);
  m.gloss = 0.85;
  m.update();
  materials.push(m);
  const e = new Entity('Sea');
  e.addComponent('render', { type: 'plane', material: m, castShadows: false });
  e.setLocalScale(WORLD_SIZE * 3, 1, WORLD_SIZE * 3);
  e.setPosition(0, 0, 0);
  parent.addChild(e);
}

// ---------------------------------------------------------------------------
// Cidade: todos os prédios numa única malha (1 draw call), janelas emissivas
// ---------------------------------------------------------------------------
function windowTextures(app: AppBase) {
  const { diffuse, emissive } = windowImages();
  const size = diffuse.width;
  const make = (c: HTMLCanvasElement) => {
    const t = new Texture(app.graphicsDevice, {
      width: size,
      height: size,
      format: PIXELFORMAT_SRGBA8,
      mipmaps: true,
      anisotropy: 4,
    });
    t.setSource(c);
    return t;
  };
  return { diffuse: make(imageCanvas(diffuse)), emissive: make(imageCanvas(emissive)) };
}

function buildCity(
  app: AppBase,
  parent: Entity,
  boxes: Box[],
  materials: StandardMaterial[],
  textures: Texture[],
) {
  const city=cityData();
  const { mesh, houses, boxes: buildings } = city;
  const details=cityDetails(city);
  boxes.push(...buildings,...details.boxes);
  const { diffuse, emissive } = windowTextures(app);
  textures.push(diffuse, emissive);
  const m = new StandardMaterial();
  m.diffuseMap = diffuse;
  m.diffuseVertexColor = true;
  m.emissiveMap = emissive;
  m.emissive = new Color(1, 1, 1);
  m.emissiveIntensity = 1.6;
  m.gloss = 0.3;
  m.update();
  materials.push(m);
  meshEntity(parent, 'City', buildMesh(app, mesh), m);
  const houseMaterial = new StandardMaterial();
  houseMaterial.diffuseVertexColor = true;
  houseMaterial.gloss = 0.15;
  houseMaterial.update();
  materials.push(houseMaterial);
  if (houses.pos.length) meshEntity(parent, 'Casas', buildMesh(app, houses), houseMaterial);
  // Edificação dos bairros (módulo opcional bairros.ts): compartilha o mesmo atlas/material dos prédios (sem draw call extra)
  const bairros = Object.values(import.meta.glob<{ bairrosData: () => MeshData }>('./bairros.ts', { eager: true }))[0];
  if (bairros) meshEntity(parent, 'Bairros', buildMesh(app, bairros.bairrosData()), m);

  const images=cityStreetImages();
  const makeTexture=(data:ImageData)=>{
    const texture=new Texture(app.graphicsDevice,{width:data.width,height:data.height,format:PIXELFORMAT_SRGBA8,mipmaps:true,anisotropy:4});
    texture.setSource(imageCanvas(data));textures.push(texture);return texture;
  };
  for(const name of ['roads','ground','props'] as const) {
    const material=new StandardMaterial();material.diffuseVertexColor=true;material.gloss=.1;
    if(name==='roads')material.diffuseMap=makeTexture(images.road);
    material.update();materials.push(material);
    const entity=meshEntity(parent,`Cidade - ${name}`,buildMesh(app,details.meshes[name]),material);
    entity.render!.castShadows=false;
  }
  const lamps=new StandardMaterial();
  lamps.name='Lampadas dos postes';lamps.diffuse=new Color(1,.82,.48);lamps.emissive=new Color(1,.82,.48);
  lamps.emissiveIntensity=1.8;lamps.cull=CULLFACE_NONE;lamps.update();materials.push(lamps);
  meshEntity(parent,'Lampadas dos postes',buildMesh(app,details.meshes.lamps),lamps).render!.castShadows=false;
  return lamps;
}

export const SKY_HORIZON = new Color(0.98, 0.72, 0.55);

function buildSky(
  app: AppBase,
  parent: Entity,
  materials: StandardMaterial[],
  textures: Texture[],
) {
  const c = imageCanvas(skyImage());
  const tex = new Texture(app.graphicsDevice, {
    width: 4,
    height: 256,
    format: PIXELFORMAT_SRGBA8,
    mipmaps: false,
    addressU: ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
  });
  tex.setSource(c);
  textures.push(tex);

  const m = new StandardMaterial();
  m.useLighting = false;
  m.useFog = false;
  m.diffuse = new Color(0, 0, 0);
  m.emissiveMap = tex;
  m.emissive = new Color(1, 1, 1);
  m.cull = CULLFACE_FRONT;
  m.depthWrite = false;
  m.update();
  materials.push(m);
  const sky = new Entity('Sky');
  sky.addComponent('render', { type: 'sphere', material: m, castShadows: false });
  sky.setLocalScale(9000, 9000, 9000);
  parent.addChild(sky);
  return sky;
}

function buildClouds(parent: Entity, materials: StandardMaterial[]) {
  const m = new StandardMaterial();
  m.diffuse = new Color(0.95, 0.86, 0.92);
  m.emissive = new Color(0.45, 0.32, 0.42);
  m.gloss = 0;
  m.update();
  const shade = new StandardMaterial();
  shade.diffuse = new Color(0.62, 0.52, 0.78);
  shade.emissive = new Color(0.2, 0.16, 0.3);
  shade.update();
  materials.push(m, shade);

  for (const cloud of cloudData()) {
    const g = new Entity('Cloud');
    parent.addChild(g);
    g.setPosition(...cloud.position);
    for (const puff of cloud.puffs) {
      const e = new Entity('puff');
      e.addComponent('render', { type: 'sphere', material: puff.shade ? shade : m, castShadows: false });
      e.setLocalScale(...puff.scale);
      e.setLocalPosition(...puff.position);
      g.addChild(e);
    }
  }
}

// ---------------------------------------------------------------------------

export type World = Partial<ReturnType<typeof createWorldPhysics>> & {
  sky: Entity;
  /** Altura do obstáculo mais alto em (x, z): terreno, mar (0) ou prédio. */
  groundAt: (x: number, z: number) => number;
  streetLightMaterial?: StandardMaterial;
  materials: StandardMaterial[];
  textures: Texture[];
};

/** O modelo da UniAcademia (models/, Gemini) fica no lote plano; sem GPU/assets (testes) o mundo segue sem ele. */
function placeUniAcademia(app: AppBase, parent: Entity) {
  if (!app.assets) return;
  try {
    const model = buildLandmark(app, 'uniacademia', parent);
    model.root.setPosition(UNIACADEMIA.x, UNIACADEMIA.y, UNIACADEMIA.z);
    model.root.setLocalEulerAngles(0, -UNIACADEMIA.heading, 0);
  } catch (error) {
    console.warn('UniAcademia indisponível:', error);
  }
}

export function buildWorld(app: AppBase, parent: Entity = app.root): World {
  const boxes: Box[] = [];
  const materials: StandardMaterial[] = [];
  const textures: Texture[] = [];
  buildTerrain(app, parent, materials);
  buildSea(parent, materials);
  const streetLightMaterial=buildCity(app, parent, boxes, materials, textures);
  buildClouds(parent, materials);
  const sky = buildSky(app, parent, materials, textures);

  const airport = airportData();
  const deliveryRamps=deliveryRampData();
  boxes.push(...airport.boxes,...deliveryRamps.boxes);
  const airportMaterial = new StandardMaterial();
  airportMaterial.diffuseVertexColor = true;
  airportMaterial.update();
  materials.push(airportMaterial);
  for (const part of [...airport.parts,...deliveryRamps.parts]) meshEntity(parent, part.name, buildMesh(app, part.mesh), airportMaterial);
  boxes.push(...landmarkBoxes(), ...buildingColliders());
  placeUniAcademia(app, parent);
  const physics = createWorldPhysics(boxes);
  return { sky, ...physics, streetLightMaterial, materials, textures };
}
