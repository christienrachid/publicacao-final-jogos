import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createFolder, findMatchingAsset, planModuleAssets, uploadAsset } from './publicar-editor.mjs';
import { moduleFiles, verifyModules } from './verificar-editor-modulos.mjs';

const temporaryDirs = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Assets separados do Editor', () => {
  const assets = [
    { id: 1, name: 'Scripts do jogo', type: 'folder', path: [] },
    { id: 2, name: 'editor', type: 'folder', path: [1] },
    { id: 3, name: 'flight-sim.mjs', type: 'script', path: [1, 2], preload: true },
    { id: 4, name: 'flight-sim.mjs', type: 'script', path: [] },
  ];

  it('reaproveita nome+pasta e mantém a entrada legada independente', () => {
    const plan = planModuleAssets(assets, ['editor/flight-sim.mjs', 'flight/fdm/heli.mjs']);
    expect(plan.folders.slice(0, 2).map((folder) => folder.existing.id)).toEqual([1, 2]);
    expect(plan.modules[0].existing.id).toBe(3);
    expect(plan.folders.slice(2).map((folder) => [folder.path, folder.parentId])).toEqual([
      ['Scripts do jogo/flight', 1], ['Scripts do jogo/flight/fdm', 'new:Scripts do jogo/flight'],
    ]);
    expect(plan.modules[1].existing).toBeNull();
    expect(findMatchingAsset(assets, { name: 'flight-sim.mjs', preferredTypes: ['script'], parentId: null }).id).toBe(4);
  });

  it('uma segunda execução usa todos os ids existentes, sem criar pastas ou scripts', () => {
    const first = planModuleAssets([], ['editor/flight-sim.mjs', 'flight/car.mjs']);
    let id = 10;
    const ids = new Map();
    const published = first.folders.map((folder) => {
      const asset = { id: id++, name: folder.name, type: 'folder', parent: ids.get(folder.parentId) ?? null };
      ids.set(folder.id, asset.id);
      return asset;
    });
    for (const { target } of first.modules) published.push({ id: id++, name: target.name, type: 'script', parent: ids.get(target.parentId), preload: true });
    const second = planModuleAssets(published, ['editor/flight-sim.mjs', 'flight/car.mjs']);
    expect(second.folders.every((folder) => folder.existing)).toBe(true);
    expect(second.modules.every((module) => module.existing)).toBe(true);
  });

  it('bloqueia duplicatas e tipos incorretos em vez de sobrescrever outro asset', () => {
    expect(() => planModuleAssets([...assets, { ...assets[2], id: 5 }], ['editor/flight-sim.mjs'])).toThrow(/ambíguo/);
    expect(() => planModuleAssets([{ ...assets[0], type: 'script' }], ['editor/flight-sim.mjs'])).toThrow(/tipo incorreto/);
  });

  it('cria pastas com parent e envia .mjs com preload, atualizando pelo id', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{"id":99}' });
    vi.stubGlobal('fetch', fetch);
    const config = { projectId: '123', branchId: 'branch', token: 'test-only' };
    await createFolder({ ...config, name: 'flight', parentId: 1 });
    let [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://playcanvas.com/api/assets');
    expect(request.method).toBe('POST');
    expect(Object.fromEntries(request.body)).toEqual({ name: 'flight', projectId: '123', branchId: 'branch', type: 'folder', parent: '1' });
    const target = { name: 'test.mjs', relPath: 'src/editor/flight-sim.ts', mime: 'application/javascript', parentId: 99 };
    await uploadAsset({ ...config, target, existing: null });
    [, request] = fetch.mock.calls[1];
    expect(request.body.get('parent')).toBe('99');
    expect(request.body.get('preload')).toBe('true');
    expect(request.body.get('file').name).toBe('test.mjs');
    await uploadAsset({ ...config, target, existing: { id: 101 } });
    [url, request] = fetch.mock.calls[2];
    expect(url).toBe('https://playcanvas.com/api/assets/101');
    expect(request.method).toBe('PUT');
    expect([...request.body.keys()]).toEqual(['branchId', 'file']);
  });
});

describe('Verificador ESM separado', () => {
  function fixture(source) {
    const base = resolve('dados-locais/tmp');
    mkdirSync(base, { recursive: true });
    const root = mkdtempSync(resolve(base, 'editor-modules-'));
    temporaryDirs.push(root);
    mkdirSync(resolve(root, 'editor'));
    writeFileSync(resolve(root, 'editor/flight-sim.mjs'), source);
    return root;
  }

  it('importa ESM real com PlayCanvas externo e CSS/JSON convertidos', async () => {
    const root = fixture(`import { Script } from 'playcanvas';
      import css from '../style.mjs'; import data from '../data.mjs';
      if (css !== 'body {}' || data.answer !== 42) throw new Error('módulos incorretos');
      export class FlightSim extends Script { static scriptName = 'flightSim'; }`);
    writeFileSync(resolve(root, 'style.mjs'), 'export default "body {}";');
    writeFileSync(resolve(root, 'data.mjs'), 'export default { answer: 42 };');
    expect(moduleFiles(root)).toEqual(['data.mjs', 'editor/flight-sim.mjs', 'style.mjs']);
    expect(await verifyModules(root)).toHaveLength(3);
  }, 20000);

  it.each([
    ["import '../missing.mjs';", /Módulo ausente/],
    ["export * from '../missing.mjs';", /Módulo ausente/],
    ["const deferred = () => import('../missing.mjs');", /Módulo ausente/],
    ["import '../missing';", /sem extensão/],
    ["import 'unwanted-dependency';", /externo inesperado/],
  ])('detecta referência inválida antes de importar: %s', async (source, error) => {
    await expect(verifyModules(fixture(source))).rejects.toThrow(error);
  });
});
