import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleFiles, MODULE_DIR } from './verificar-editor-modulos.mjs';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = 'https://playcanvas.com/api';
const DEFAULT_PROJECT_ID = '1606932';
const SCRIPT_FOLDER = 'Scripts do jogo';

const TARGET_ASSETS = [
  ...['terreno', 'cidade', 'mar', 'nuvens', 'ceu', 'aeroporto'].map((part) => ({
    name: `mundo-${part}.glb`,
    relPath: `public/models/mundo-${part}.glb`,
    mime: 'model/gltf-binary',
    preferredTypes: ['container', 'scene', 'model'],
  })),
  ...['a29', 'helicoptero', 'carro', 'carro-compacto', 'carro-picape', 'carro-esportivo', 'carro-tunado', 'personagem', 'uniacademia'].map((slug) => ({
    name: `${slug}.glb`,
    relPath: `public/models/${slug}.glb`,
    mime: 'model/gltf-binary',
    preferredTypes: ['container', 'scene', 'model'],
  })),
  // Cópias binárias (.glb.bin): os .glb viram assets "scene" no Editor e não existem no Launch;
  // o jogo carrega estas cópias como container (ver glbUrl em src/flight/models/glb.ts).
  ...['mundo-terreno', 'mundo-cidade', 'mundo-mar', 'mundo-nuvens', 'mundo-ceu', 'mundo-aeroporto',
    'a29', 'helicoptero', 'carro', 'carro-compacto', 'carro-picape', 'carro-esportivo', 'carro-tunado', 'personagem', 'uniacademia'].map((slug) => ({
    name: `${slug}.glb.bin`,
    relPath: `public/models/${slug}.glb`,
    mime: 'application/octet-stream',
    preferredTypes: ['binary'],
  })),
  {
    name: 'flight-sim.mjs',
    relPath: 'dist-editor/flight-sim.mjs',
    mime: 'application/javascript',
    preferredTypes: ['script'],
  },
  {
    // Versão clássica (pc.createScript, script "simuladorVoo"): o Editor do usuário não listou o .mjs.
    name: 'flight-sim.js',
    relPath: 'dist-editor/flight-sim.js',
    mime: 'application/javascript',
    preferredTypes: ['script'],
  },
];

function loadDotEnv(filePath) {
  const vars = {};
  if (!existsSync(filePath)) return vars;
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function readConfig() {
  const envFile = loadDotEnv(resolve(ROOT_DIR, '.env'));
  const get = (key, fallback = '') => (process.env[key] ?? envFile[key] ?? fallback).trim();

  const token = get('PLAYCANVAS_API_TOKEN');
  const projectId = get('PLAYCANVAS_PROJECT_ID', DEFAULT_PROJECT_ID);
  const branchId = get('PLAYCANVAS_BRANCH_ID', '');

  if (!token) {
    throw new Error('PLAYCANVAS_API_TOKEN não encontrado no ambiente nem em .env.');
  }
  if (!/^\d+$/.test(projectId)) {
    throw new Error(`PLAYCANVAS_PROJECT_ID inválido: "${projectId}".`);
  }

  return { token, projectId, branchId };
}

function redact(text, secret) {
  if (!secret || !text) return text;
  return text.replaceAll(secret, '[REDACTED]');
}

async function apiRequest(method, path, token, body) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  });

  const rawText = await response.text();
  let parsed = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const serverMsg =
      (parsed && typeof parsed === 'object' && (parsed.error || parsed.message || JSON.stringify(parsed))) ||
      rawText.trim() ||
      response.statusText ||
      'sem detalhes';
    const safeMsg = redact(String(serverMsg), token);
    throw new Error(`HTTP ${response.status} (${method} ${path}): ${safeMsg}`);
  }

  return parsed;
}

async function listBranches(projectId, token) {
  const branches = [];
  let skip = '';
  for (let page = 0; page < 20; page++) {
    const query = skip ? `?skip=${encodeURIComponent(skip)}` : '';
    const data = await apiRequest('GET', `/projects/${projectId}/branches${query}`, token);
    const items = Array.isArray(data?.result) ? data.result : Array.isArray(data) ? data : [];
    branches.push(...items);
    if (!data?.pagination?.hasMore || items.length === 0) break;
    const lastId = items[items.length - 1]?.id;
    if (!lastId || lastId === skip) break;
    skip = lastId;
  }
  return branches;
}

async function resolveBranch(projectId, preferredBranchId, token) {
  const branches = await listBranches(projectId, token);
  if (preferredBranchId) {
    const found = branches.find((b) => b.id === preferredBranchId);
    return {
      id: preferredBranchId,
      name: found?.name ?? '(definido via PLAYCANVAS_BRANCH_ID)',
    };
  }

  const openBranches = branches.filter((b) => !b.closed);
  const pool = openBranches.length > 0 ? openBranches : branches;
  const mainBranch =
    pool.find((b) => /^(main|master)$/i.test(String(b.name ?? ''))) ??
    pool[0];

  if (!mainBranch?.id) {
    throw new Error(`Nenhum branch encontrado no projeto ${projectId}.`);
  }
  return { id: mainBranch.id, name: mainBranch.name ?? mainBranch.id };
}

async function listAssets(projectId, branchId, token) {
  const assets = [];
  const limit = 1000;
  let skip = 0;

  for (let page = 0; page < 50; page++) {
    const query = `?branchId=${encodeURIComponent(branchId)}&skip=${skip}&limit=${limit}`;
    const data = await apiRequest('GET', `/projects/${projectId}/assets${query}`, token);
    const items = Array.isArray(data?.result) ? data.result : Array.isArray(data) ? data : [];
    assets.push(...items);

    const total = typeof data?.pagination?.total === 'number' ? data.pagination.total : null;
    if (items.length < limit || (total !== null && assets.length >= total)) break;
    skip += items.length;
  }

  return assets;
}

export function findMatchingAsset(assets, target) {
  const lowerName = target.name.toLowerCase();
  const candidates = assets.filter((a) => {
    if ('parentId' in target && assetParentId(a) !== String(target.parentId ?? '')) return false;
    const aName = String(a?.name ?? '').toLowerCase();
    const fName = String(a?.file?.filename ?? '').toLowerCase();
    return aName === lowerName || fName === lowerName;
  });
  if (candidates.length === 0) return null;

  if ('parentId' in target) {
    if (candidates.length > 1 || !target.preferredTypes.includes(candidates[0].type)) {
      throw new Error(`Nome ambíguo ou tipo incorreto na pasta: ${target.folderPath}/${target.name}`);
    }
    return candidates[0];
  }

  for (const preferredType of target.preferredTypes) {
    const match = candidates.find((a) => String(a?.type ?? '').toLowerCase() === preferredType);
    if (match) return match;
  }
  return candidates[0];
}

function assetParentId(asset) {
  return String(asset.parent ?? asset.path?.at(-1) ?? '');
}

export function planModuleAssets(assets, files = moduleFiles()) {
  const folders = [];
  const folderByPath = new Map();
  function folder(path) {
    if (folderByPath.has(path)) return folderByPath.get(path);
    const parentPath = posix.dirname(path);
    const parentId = parentPath === '.' ? null : folder(parentPath).id;
    const target = { name: posix.basename(path), preferredTypes: ['folder'], parentId, folderPath: parentPath };
    const existing = findMatchingAsset(assets, target);
    const entry = { ...target, path, existing, id: existing?.id ?? `new:${path}` };
    folders.push(entry);
    folderByPath.set(path, entry);
    return entry;
  }
  const modules = files.map((file) => {
    const path = posix.join(SCRIPT_FOLDER, posix.dirname(file));
    const target = {
      name: posix.basename(file), relPath: `dist-editor/modules/${file}`,
      mime: 'application/javascript', preferredTypes: ['script'],
      folderPath: path, parentId: folder(path).id,
    };
    return { target, existing: findMatchingAsset(assets, target) };
  });
  return { folders, modules };
}

export async function createFolder({ projectId, branchId, token, name, parentId }) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name, projectId, branchId, type: 'folder', parent: parentId })) {
    if (value != null) form.append(key, String(value));
  }
  const result = await apiRequest('POST', '/assets', token, form);
  if (!result?.id) throw new Error(`A API não retornou o id da pasta ${name}.`);
  return result;
}

export async function uploadAsset({ projectId, branchId, token, target, existing }) {
  const fullPath = resolve(ROOT_DIR, target.relPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Arquivo local ausente: ${target.relPath}`);
  }

  const bytes = readFileSync(fullPath);
  const file = new Blob([bytes], { type: target.mime });

  if (existing) {
    // Atualização: a API só aceita arquivo e branch ("preload: not supported field" em 2026-11-19).
    const update = new FormData();
    update.append('branchId', branchId);
    update.append('file', file, target.name);
    return apiRequest('PUT', `/assets/${existing.id}`, token, update);
  }

  const form = new FormData();
  form.append('name', target.name);
  form.append('projectId', projectId);
  form.append('branchId', branchId);
  form.append('preload', 'true');
  if (target.parentId != null) form.append('parent', String(target.parentId));
  form.append('file', file, target.name);
  return apiRequest('POST', '/assets', token, form);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const files = moduleFiles();
  if (!files.includes('editor/flight-sim.mjs')) throw new Error(`Entrada separada ausente em ${MODULE_DIR}. Rode npm run build:editor.`);
  const { token, projectId, branchId: envBranchId } = readConfig();

  const branch = await resolveBranch(projectId, envBranchId, token);
  const assets = await listAssets(projectId, branch.id, token);

  console.log(`Projeto: ${projectId}`);
  console.log(`Branch: ${branch.name} (${branch.id})`);
  console.log(`Assets listados no branch: ${assets.length}`);

  const separated = planModuleAssets(assets, files);
  const moduleFolderIds = new Set(separated.folders.map((folder) => String(folder.id)));
  // O bundle legado e a entrada modular têm o mesmo nome em pastas diferentes.
  const legacyAssets = assets.filter((asset) => !moduleFolderIds.has(assetParentId(asset)));
  const plan = [...TARGET_ASSETS.map((target) => ({ target, existing: findMatchingAsset(legacyAssets, target) })), ...separated.modules].map(({ target, existing }) => {
    const fullPath = resolve(ROOT_DIR, target.relPath);
    const fileExists = existsSync(fullPath);
    const sizeKb = fileExists ? (statSync(fullPath).size / 1024).toFixed(1) : null;
    return { target, existing, fileExists, sizeKb };
  });

  if (dryRun) {
    console.log('Modo: --dry-run (somente leitura, nada enviado)');
    for (const folder of separated.folders) {
      console.log(`- Pasta ${folder.path}: ${folder.existing ? `REUTILIZADA (id=${folder.id})` : 'SERIA CRIADA'} (parent=${folder.parentId ?? 'raiz'})`);
    }
    for (const item of plan) {
      const action = item.existing
        ? `ATUALIZADO (id=${item.existing.id}, tipo=${item.existing.type ?? 'desconhecido'})`
        : 'CRIADO';
      const localInfo = item.fileExists
        ? `${item.target.relPath} (${item.sizeKb} kB)`
        : `${item.target.relPath} [AUSENTE]`;
      const label = item.target.folderPath ? `${item.target.folderPath}/${item.target.name}` : item.target.name;
      console.log(`- ${label}: será ${action} | preload=${item.existing?.preload ?? true} | local: ${localInfo}`);
    }
    return;
  }

  for (const item of plan) {
    if (!item.fileExists) throw new Error(`Arquivo local ausente: ${item.target.relPath}`);
    if (item.target.folderPath && item.existing?.preload === false) {
      throw new Error(`Ative Preload no Editor antes de atualizar ${item.target.folderPath}/${item.target.name}; a API REST de atualização não aceita preload.`);
    }
  }
  console.log('Publicando assets no PlayCanvas Editor...');
  const folderIds = new Map();
  for (const folder of separated.folders) {
    const result = folder.existing ?? await createFolder({
      projectId, branchId: branch.id, token, name: folder.name,
      parentId: folderIds.get(String(folder.parentId)) ?? folder.parentId,
    });
    folderIds.set(String(folder.id), result.id);
  }
  for (const item of plan) {
    const result = await uploadAsset({
      projectId,
      branchId: branch.id,
      token,
      target: { ...item.target, parentId: folderIds.get(String(item.target.parentId)) ?? item.target.parentId },
      existing: item.existing,
    });
    const verb = item.existing ? 'ATUALIZADO' : 'CRIADO';
    const resultId = result?.id ?? item.existing?.id ?? '?';
    const resultType = result?.type ?? item.existing?.type ?? 'desconhecido';
    console.log(`- ${item.target.folderPath ? `${item.target.folderPath}/` : ''}${item.target.name}: ${verb} (id=${resultId}, tipo=${resultType}, preload=${result?.preload ?? item.existing?.preload ?? true})`);
  }

  console.log(`Editor: https://playcanvas.com/editor/project/${projectId}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Falha na publicação: ${msg}`);
  process.exit(1);
});
