import {
  type AppBase,
  type Asset,
  BLEND_NORMAL,
  BoundingBox,
  Color,
  type ContainerResource,
  Entity,
  type GraphNode,
  Mat4,
  type MeshInstance,
  StandardMaterial,
  Vec3,
} from 'playcanvas';
import type { AirplaneModel } from '../airplane';

export function makeMaterial(r: number, g: number, b: number, gloss = 0.5, opacity = 1): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse = new Color(r, g, b);
  m.gloss = gloss;
  if (opacity < 1) {
    m.opacity = opacity;
    m.blendType = BLEND_NORMAL;
    m.depthWrite = false;
  }
  m.update();
  return m;
}

function isDescendantOrSelf(node: GraphNode, ancestor: GraphNode): boolean {
  let cur: GraphNode | null = node;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}

function relativeLocalMatrix(node: GraphNode, ancestor: GraphNode, out: Mat4): Mat4 {
  const chain: GraphNode[] = [];
  let cur: GraphNode | null = node;
  while (cur && cur !== ancestor) {
    chain.push(cur);
    cur = cur.parent;
  }
  out.setIdentity();
  const step = new Mat4();
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = chain[i];
    step.setTRS(n.getLocalPosition(), n.getLocalRotation(), n.getLocalScale());
    out.mul(step);
  }
  return out;
}

export function collectVisualEntities(rootNode: Entity, out: Entity[] = []): Entity[] {
  if (rootNode.render || rootNode.model) out.push(rootNode);
  const children = rootNode.children;
  for (let i = 0; i < children.length; i++) {
    collectVisualEntities(children[i] as Entity, out);
  }
  return out;
}


/**
 * Desliga refração/transmissão dos materiais de um GLB (vidros de modelos baixados).
 * Refração exige o mapa de cor da cena (uSceneColorMap), que a câmera do jogo não tem: no WebGPU isso
 * gerava erro a cada quadro e derrubava o navegador no heli e no A-29. Vidro vira transparência simples.
 */
export function sanitizeGlbMaterials(rootEntity: Entity): void {
  const seen = new Set<StandardMaterial>();
  const renders = rootEntity.findComponents('render') as unknown as Array<{ meshInstances?: ReadonlyArray<{ material: unknown }> }>;
  for (const r of renders) {
    for (const mi of r.meshInstances ?? []) {
      const m = mi.material;
      if (!(m instanceof StandardMaterial) || seen.has(m)) continue;
      seen.add(m);
      const anyM = m as StandardMaterial & { refraction?: number; useDynamicRefraction?: boolean; refractionMap?: unknown };
      if ((anyM.refraction ?? 0) > 0 || anyM.useDynamicRefraction || anyM.refractionMap) {
        anyM.refraction = 0;
        anyM.useDynamicRefraction = false;
        anyM.refractionMap = null;
        m.opacity = Math.min(m.opacity, 0.45);
        m.blendType = BLEND_NORMAL;
        m.depthWrite = false;
        m.update();
      }
    }
  }
}

export function collectNodesByPrefix(rootNode: Entity, prefixLower: string, out: Entity[] = []): Entity[] {
  if (rootNode.name.toLowerCase().startsWith(prefixLower)) out.push(rootNode);
  const children = rootNode.children;
  for (let i = 0; i < children.length; i++) {
    collectNodesByPrefix(children[i] as Entity, prefixLower, out);
  }
  return out;
}

export interface HitboxFootprint {
  halfWidth: number;
  halfLength: number;
  height: number;
  centerX: number;
  centerZ: number;
}

export interface CarWheelBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface ComputeAabbOptions {
  /** Recorta outliers finos de carroceria (retrovisores/antena) mantendo rodas e para-choques com folga <= 5 cm. */
  trimCarOutliers?: boolean;
}

function quantileSorted(sorted: readonly number[], q: number): number {
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  return sorted[idx];
}

/**
 * Calcula o AABB justo da carroceria de um carro a partir dos vértices locais (já transformados
 * para o espaço do modelo), descartando retrovisores laterais e antena de teto enquanto preserva
 * integralmente para-lamas, para-choques e rodas, com folga máxima de 2 cm (<= 5 cm).
 */
export function computeCarBodyAabbFromPoints(
  bodyXs: number[],
  bodyYs: number[],
  bodyZs: number[],
  wheelBounds?: CarWheelBounds | null,
  margin = 0.02,
): BoundingBox | null {
  if (bodyXs.length === 0 || bodyYs.length === 0 || bodyZs.length === 0) return null;
  const xs = bodyXs.slice().sort((a, b) => a - b);
  const ys = bodyYs.slice().sort((a, b) => a - b);
  const zs = bodyZs.slice().sort((a, b) => a - b);

  const safeMargin = Math.max(0, Math.min(0.05, margin));
  let minX = quantileSorted(xs, 0.015);
  let maxX = quantileSorted(xs, 0.985);
  let minY = quantileSorted(ys, 0.002);
  let maxY = quantileSorted(ys, 0.995);
  let minZ = quantileSorted(zs, 0.002);
  let maxZ = quantileSorted(zs, 0.998);

  if (wheelBounds) {
    if (wheelBounds.minX < minX) minX = wheelBounds.minX;
    if (wheelBounds.maxX > maxX) maxX = wheelBounds.maxX;
    if (wheelBounds.minY < minY) minY = wheelBounds.minY;
    if (wheelBounds.maxY > maxY) maxY = wheelBounds.maxY;
    if (wheelBounds.minZ < minZ) minZ = wheelBounds.minZ;
    if (wheelBounds.maxZ > maxZ) maxZ = wheelBounds.maxZ;
  }

  minX -= safeMargin;
  maxX += safeMargin;
  minY = Math.max(0, minY);
  maxY += safeMargin;
  minZ -= safeMargin;
  maxZ += safeMargin;

  if (!(maxX > minX && maxY > minY && maxZ > minZ)) return null;
  return new BoundingBox(
    new Vec3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5),
    new Vec3((maxX - minX) * 0.5, (maxY - minY) * 0.5, (maxZ - minZ) * 0.5),
  );
}

/** Extrai largura, comprimento e altura da hitbox local sem alocar quando `out` é fornecido. */
export function extractHitboxFootprint(
  hitbox: ReadonlyArray<[number, number, number]> | null | undefined,
  out?: HitboxFootprint,
): HitboxFootprint | null {
  if (!hitbox || hitbox.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < hitbox.length; i++) {
    const p = hitbox[i];
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[2] > maxZ) maxZ = p[2];
  }
  const halfWidth = (maxX - minX) * 0.5;
  const halfLength = (maxZ - minZ) * 0.5;
  const height = Math.max(0.5, maxY - Math.max(0, minY));
  if (!(halfWidth > 0.05 && halfLength > 0.05)) return null;
  const target = out ?? { halfWidth: 0, halfLength: 0, height: 0, centerX: 0, centerZ: 0 };
  target.halfWidth = halfWidth;
  target.halfLength = halfLength;
  target.height = height;
  target.centerX = (minX + maxX) * 0.5;
  target.centerZ = (minZ + maxZ) * 0.5;
  return target;
}

export function computeLocalAabb(rootNode: Entity, options?: ComputeAabbOptions): BoundingBox | null {
  const visualEntities = collectVisualEntities(rootNode);
  const relMat = new Mat4();
  const tmpBox = new BoundingBox();
  const trimCar = Boolean(options?.trimCarOutliers);
  let total: BoundingBox | null = null;

  const bodyXs: number[] = [];
  const bodyYs: number[] = [];
  const bodyZs: number[] = [];
  let wheelBounds: CarWheelBounds | null = null;
  const posBuf: number[] = [];
  const vIn = new Vec3();
  const vOut = new Vec3();

  const accumulate = (entity: Entity, meshInstances: ReadonlyArray<MeshInstance> | null | undefined) => {
    if (!meshInstances || meshInstances.length === 0) return;
    for (let j = 0; j < meshInstances.length; j++) {
      const mi = meshInstances[j];
      const mesh = mi?.mesh;
      if (!mesh) continue;
      const refNode: GraphNode = mi.node && isDescendantOrSelf(mi.node, rootNode) ? mi.node : entity;
      relativeLocalMatrix(refNode, rootNode, relMat);

      if (trimCar && typeof (mesh as { getPositions?: (out: number[]) => number }).getPositions === 'function') {
        posBuf.length = 0;
        const count = (mesh as { getPositions: (out: number[]) => number }).getPositions(posBuf);
        const floats = Math.min(posBuf.length, count > 0 ? count * 3 : posBuf.length);
        if (floats >= 9) {
          const isWheel = /^roda_/i.test(refNode.name || '') || /^roda_/i.test(entity.name || '');
          for (let k = 0; k + 2 < floats; k += 3) {
            vIn.set(posBuf[k], posBuf[k + 1], posBuf[k + 2]);
            relMat.transformPoint(vIn, vOut);
            if (!Number.isFinite(vOut.x) || !Number.isFinite(vOut.y) || !Number.isFinite(vOut.z)) continue;
            if (isWheel) {
              if (!wheelBounds) {
                wheelBounds = {
                  minX: vOut.x,
                  maxX: vOut.x,
                  minY: vOut.y,
                  maxY: vOut.y,
                  minZ: vOut.z,
                  maxZ: vOut.z,
                };
              } else {
                if (vOut.x < wheelBounds.minX) wheelBounds.minX = vOut.x;
                if (vOut.x > wheelBounds.maxX) wheelBounds.maxX = vOut.x;
                if (vOut.y < wheelBounds.minY) wheelBounds.minY = vOut.y;
                if (vOut.y > wheelBounds.maxY) wheelBounds.maxY = vOut.y;
                if (vOut.z < wheelBounds.minZ) wheelBounds.minZ = vOut.z;
                if (vOut.z > wheelBounds.maxZ) wheelBounds.maxZ = vOut.z;
              }
            } else {
              bodyXs.push(vOut.x);
              bodyYs.push(vOut.y);
              bodyZs.push(vOut.z);
            }
          }
        }
      }

      const meshAabb = mesh.aabb;
      if (!meshAabb) continue;
      tmpBox.setFromTransformedAabb(meshAabb, relMat);
      if (!total) {
        total = new BoundingBox(tmpBox.center.clone(), tmpBox.halfExtents.clone());
      } else {
        total.add(tmpBox);
      }
    }
  };

  for (let i = 0; i < visualEntities.length; i++) {
    const entity = visualEntities[i];
    accumulate(entity, entity.render?.meshInstances);
    accumulate(entity, entity.model?.meshInstances);
  }

  if (trimCar) {
    const trimmed = computeCarBodyAabbFromPoints(bodyXs, bodyYs, bodyZs, wheelBounds);
    if (trimmed) return trimmed;
    if (total) {
      const box = total as BoundingBox;
      const min = box.getMin();
      const max = box.getMax();
      if (min.y < 0 && max.y > 0) {
        const clampedMinY = 0;
        return new BoundingBox(
          new Vec3((min.x + max.x) * 0.5, (clampedMinY + max.y) * 0.5, (min.z + max.z) * 0.5),
          new Vec3((max.x - min.x) * 0.5, (max.y - clampedMinY) * 0.5, (max.z - min.z) * 0.5),
        );
      }
    }
  }
  return total;
}

export function cornersHitboxFromAabb(aabb: BoundingBox): [number, number, number][] {
  const min = aabb.getMin();
  const max = aabb.getMax();
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  return [
    [min.x, min.y, min.z],
    [max.x, min.y, min.z],
    [min.x, min.y, max.z],
    [max.x, min.y, max.z],
    [min.x, max.y, min.z],
    [max.x, max.y, min.z],
    [min.x, max.y, max.z],
    [max.x, max.y, max.z],
    [cx, min.y, cz],
    [cx, max.y, cz],
    [cx, cy, min.z],
    [cx, cy, max.z],
  ];
}

/**
 * URL de um GLB para `loadFromUrl(..., 'container')`.
 * No Editor online os .glb viram assets "scene" (fonte, fora do runtime); o publicador envia
 * uma cópia binária `<arquivo>.glb.bin` que existe no Launch/Publish, e o parser GLB é o padrão.
 * Localmente cai em `${BASE_URL}models/<arquivo>`.
 */
export function glbUrl(app: AppBase, filename: string): string {
  const bin = app.assets?.find?.(`${filename}.bin`, 'binary') as Asset | null | undefined;
  const fileUrl = bin?.getFileUrl?.();
  // A URL precisa ser diferente da do asset binário: loadFromUrl reaproveita o asset já registrado
  // com a mesma URL (getByUrl) e devolveria o ArrayBuffer cru em vez do container (carro antigo no Launch).
  if (fileUrl) return `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}as=container`;
  const rawBase = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return `${base}models/${filename}`;
}

export function findGlbContainerAsset(app: AppBase, filename: string): Asset | null {
  const assets = app.assets;
  if (!assets) return null;
  const direct = assets.find?.(filename, 'container');
  if (direct) return direct;
  const lower = filename.toLowerCase();
  const base = lower.replace(/\.glb$/i, '');
  const matches = assets.filter?.((a) => {
    if (a.type !== 'container') return false;
    const name = (a.name ?? '').toLowerCase();
    const file = ((a.file as { filename?: string } | null)?.filename ?? '').toLowerCase();
    return name === lower || name === base || file.endsWith(lower);
  });
  return matches?.[0] ?? null;
}

export interface GlbLoadItem {
  id: string;
  filename: string;
  done: boolean;
}

type GlbLoadListener = (items: ReadonlyArray<GlbLoadItem>) => void;

interface GlbLoadRegistry {
  items: Map<string, GlbLoadItem>;
  listeners: Set<GlbLoadListener>;
  seq: number;
}

const glbRegistries = new WeakMap<AppBase, GlbLoadRegistry>();

function getGlbRegistry(app: AppBase): GlbLoadRegistry {
  let reg = glbRegistries.get(app);
  if (!reg) {
    reg = { items: new Map(), listeners: new Set(), seq: 0 };
    glbRegistries.set(app, reg);
  }
  return reg;
}

function notifyGlbRegistry(reg: GlbLoadRegistry): void {
  if (reg.listeners.size === 0) return;
  const snap = [...reg.items.values()];
  for (const cb of reg.listeners) cb(snap);
}

/** Permite à tela de carregamento acompanhar em tempo real os GLBs iniciados por `attachAsyncGlb`. */
export function subscribeGlbLoads(app: AppBase, listener: GlbLoadListener): () => void {
  const reg = getGlbRegistry(app);
  reg.listeners.add(listener);
  listener([...reg.items.values()]);
  return () => {
    reg.listeners.delete(listener);
  };
}

function registerGlbTask(app: AppBase, filename: string): () => void {
  const reg = getGlbRegistry(app);
  const id = `${filename}#${++reg.seq}`;
  reg.items.set(id, { id, filename, done: false });
  notifyGlbRegistry(reg);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    const item = reg.items.get(id);
    if (item) item.done = true;
    notifyGlbRegistry(reg);
  };
}

/** Garante frustum culling ativo em todas as entidades e mesh instances sob `rootNode`. */
export function enableFrustumCulling(rootNode: Entity): void {
  if (rootNode.render?.meshInstances) {
    const mis = rootNode.render.meshInstances;
    for (let i = 0; i < mis.length; i++) {
      if (mis[i]) mis[i].cull = true;
    }
  }
  if (rootNode.model?.meshInstances) {
    const mis = rootNode.model.meshInstances;
    for (let i = 0; i < mis.length; i++) {
      if (mis[i]) mis[i].cull = true;
    }
  }
  const children = rootNode.children;
  for (let i = 0; i < children.length; i++) {
    enableFrustumCulling(children[i] as Entity);
  }
}

export interface AttachGlbOptions {
  app: AppBase;
  root: Entity;
  procedural: Entity;
  model: AirplaneModel;
  filename: string;
  trimCarOutliers?: boolean;
  onMounted?: (glbRoot: Entity, aabb: BoundingBox | null) => void;
}

/**
 * Carrega um GLB (asset container no Editor ou `${BASE_URL}models/${filename}` local)
 * e substitui o modelo procedural in-place, mantendo o contrato `AirplaneModel`.
 */
export function attachAsyncGlb({
  app,
  root,
  procedural,
  model,
  filename,
  trimCarOutliers,
  onMounted,
}: AttachGlbOptions): void {
  if (!app.assets) return;

  let destroyed = false;
  let applied = false;
  const finishLoad = registerGlbTask(app, filename);

  root.once('destroy', () => {
    destroyed = true;
    finishLoad();
  });

  function applyResource(resource: ContainerResource) {
    if (destroyed || applied || !root.parent || typeof resource.instantiateRenderEntity !== 'function') return;
    const glbRoot = resource.instantiateRenderEntity({ castShadows: false, receiveShadows: false });
    if (!glbRoot) return;
    sanitizeGlbMaterials(glbRoot);
    applied = true;

    const showExterior = model.exterior.length === 0 ? true : (model.exterior[0].render?.enabled ?? true);
    root.addChild(glbRoot);
    enableFrustumCulling(glbRoot);

    const glbExterior = collectVisualEntities(glbRoot);
    for (let i = 0; i < glbExterior.length; i++) {
      const r = glbExterior[i].render;
      if (r) r.enabled = showExterior;
      const m = glbExterior[i].model;
      if (m) m.enabled = showExterior;
    }

    const aabb = computeLocalAabb(glbRoot, trimCarOutliers ? { trimCarOutliers: true } : undefined);
    if (aabb && aabb.halfExtents.x > 0.05 && aabb.halfExtents.y > 0.05 && aabb.halfExtents.z > 0.05) {
      const nextHitbox = cornersHitboxFromAabb(aabb);
      model.hitbox.length = 0;
      for (let i = 0; i < nextHitbox.length; i++) model.hitbox.push(nextHitbox[i]);
      const min = aabb.getMin();
      const max = aabb.getMax();
      const midY = (min.y + max.y) * 0.5;
      const midZ = (min.z + max.z) * 0.5;
      model.wingTips[0].setLocalPosition(min.x, midY, midZ);
      model.wingTips[1].setLocalPosition(max.x, midY, midZ);
    }

    onMounted?.(glbRoot, aabb);

    const resMats = (resource as { materials?: Asset[] }).materials;
    if (Array.isArray(resMats)) {
      for (let i = 0; i < resMats.length; i++) {
        const resMat = resMats[i]?.resource;
        if (resMat instanceof StandardMaterial && !model.materials.includes(resMat)) {
          model.materials.push(resMat);
        }
      }
    }

    model.exterior.length = 0;
    for (let i = 0; i < glbExterior.length; i++) model.exterior.push(glbExterior[i]);
    procedural.destroy();
  }

  // No Editor o container importado fica velho (o Editor não reimporta o GLB); a cópia binária
  // `<arquivo>.glb.bin` enviada pelo publicador é sempre a versão atual, igual à local.
  const hasFreshBinary = !!app.assets.find?.(`${filename}.bin`, 'binary');
  const editorAsset = hasFreshBinary ? null : findGlbContainerAsset(app, filename);
  if (editorAsset) {
    if (editorAsset.resource) {
      applyResource(editorAsset.resource as ContainerResource);
      finishLoad();
    } else {
      editorAsset.ready((loaded) => {
        if (loaded.resource) applyResource(loaded.resource as ContainerResource);
        finishLoad();
      });
      editorAsset.once?.('error', () => finishLoad());
      app.assets.load(editorAsset);
    }
    return;
  }

  if (typeof app.assets.loadFromUrl === 'function') {
    const url = glbUrl(app, filename);
    try {
      app.assets.loadFromUrl(url, 'container', (err, asset) => {
        if (!err && asset?.resource) {
          applyResource(asset.resource as ContainerResource);
        } else {
          console.warn(`[Delivered by Noon] não carregou ${filename} (${url}):`, err);
        }
        finishLoad();
      });
    } catch {
      // Sem arquivo ou loader: mantém o fallback procedural
      finishLoad();
    }
  } else {
    finishLoad();
  }
}
