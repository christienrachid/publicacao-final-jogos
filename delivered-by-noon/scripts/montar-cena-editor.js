// ============================================================================
// Monta a cena de "Delivered by Midnight" no PlayCanvas Editor.
//
// COMO USAR (UMA VEZ):
// 1. Abra a cena do projeto no PlayCanvas Editor (playcanvas.com/editor/...).
// 2. Pressione F12 e abra a aba "Console".
// 3. Cole este arquivo inteiro no Console e pressione Enter.
// 4. Confira as entidades criadas na Hierarchy e no Viewport; depois clique em Launch.
//
// Compatível com os dois modos de importação de GLB do Editor:
// - Novo (useModelV2 = true): assets `template` / `render`
// - Legado (useModelV2 = false): assets `model`
//
// Nota: o carro tunado (estágio 2), os marcadores 3D de entrega e o ciclo de dia/noite
// são gerados em tempo de execução pelo script `simuladorVoo` / `flightSim` no Launch.
//
// Segurança: 100% local no navegador usando apenas a Editor API oficial (`editor`).
// Não envia dados para fora e pode ser executado novamente sem duplicar entidades.
// ============================================================================
(async function montarCenaHorizonteDourado() {
  if (typeof editor === 'undefined') {
    console.error('[Horizonte Dourado] Global `editor` não encontrado. Execute este snippet na aba do PlayCanvas Editor.');
    return;
  }

  const globals = editor.api && editor.api.globals ? editor.api.globals : editor;
  const entitiesApi = globals.entities || editor.entities;
  const assetsApi = globals.assets || editor.assets;
  const settingsApi = globals.settings || editor.settings;

  if (!entitiesApi || !assetsApi || !entitiesApi.root) {
    console.error('[Horizonte Dourado] Editor API indisponível (aguarde a cena terminar de carregar e tente novamente).');
    return;
  }

  const root = entitiesApi.root;
  const allAssets = typeof assetsApi.list === 'function' ? assetsApi.list() : [];

  // --- Helpers da Editor API ---
  const getVal = (obj, path) => (obj && typeof obj.get === 'function' ? obj.get(path) : undefined);

  function listEntities() {
    return typeof entitiesApi.list === 'function' ? entitiesApi.list() : [];
  }

  function findDirectChildByName(parent, name) {
    const parentId = getVal(parent, 'resource_id');
    return (
      listEntities().find(
        (e) => getVal(e, 'name') === name && getVal(e, 'parent') === parentId,
      ) || null
    );
  }

  function findChildren(parent) {
    const parentId = getVal(parent, 'resource_id');
    return listEntities().filter((e) => getVal(e, 'parent') === parentId);
  }

  async function ensureEntity(name, opts) {
    let entity = findDirectChildByName(root, name);
    if (!entity) {
      entity = await entitiesApi.create(
        {
          name,
          parent: root,
          position: opts.position || [0, 0, 0],
          rotation: opts.rotation || [0, 0, 0],
          scale: opts.scale || [1, 1, 1],
          enabled: true,
        },
        { history: true },
      );
      console.log(`[Horizonte Dourado] Entidade criada: ${name}`);
    } else {
      entity.set('enabled', true);
      if (opts.position) entity.set('position', opts.position);
      if (opts.rotation) entity.set('rotation', opts.rotation);
      if (opts.scale) entity.set('scale', opts.scale);
      console.log(`[Horizonte Dourado] Entidade atualizada: ${name}`);
    }
    return entity;
  }

  function ensureComponent(entity, type, props) {
    if (!getVal(entity, `components.${type}`)) {
      entity.addComponent(type, props);
    } else {
      for (const [k, v] of Object.entries(props)) {
        entity.set(`components.${type}.${k}`, v);
      }
    }
  }

  function assetFileName(asset) {
    const file = getVal(asset, 'file');
    const fn = file && typeof file === 'object' ? file.filename : getVal(asset, 'file.filename');
    return String(fn || getVal(asset, 'name') || '');
  }

  function normalizeBaseName(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\.(glb|json|fbx)$/i, '');
  }

  function describeAsset(a) {
    const id = getVal(a, 'id');
    const name = getVal(a, 'name');
    const type = getVal(a, 'type');
    const isSrc = getVal(a, 'source') === true;
    return `${name} [type=${type}, id=${id}${isSrc ? ', source' : ''}]`;
  }

  // Agrupa os assets derivados de cada GLB: template, render (novo) e model (legado)
  function resolveGlbGroups(matcherFn) {
    const groups = new Map();
    const ensureGroup = (base, label) => {
      if (!groups.has(base)) {
        groups.set(base, { base, label, template: null, renders: [], models: [] });
      }
      return groups.get(base);
    };

    // 1) Procura pelos assets source (.glb) e coleta seus derivados via source_asset_id
    const matchedSources = allAssets.filter(
      (a) => getVal(a, 'source') === true && matcherFn(assetFileName(a), String(getVal(a, 'name') || '')),
    );
    for (const src of matchedSources) {
      const srcId = String(getVal(src, 'id'));
      const label = String(getVal(src, 'name') || assetFileName(src));
      const base = normalizeBaseName(assetFileName(src) || label);
      const g = ensureGroup(base, label);

      for (const a of allAssets) {
        if (String(getVal(a, 'source_asset_id') || '') !== srcId) continue;
        const type = String(getVal(a, 'type') || '');
        if (type === 'template' && !g.template) g.template = a;
        else if (type === 'render' && !g.renders.includes(a)) g.renders.push(a);
        else if (type === 'model' && !g.models.includes(a)) g.models.push(a);
      }
    }

    // 2) Fallback: caso o asset derivado (template/render/model) tenha o nome direto sem source_asset_id casado
    for (const a of allAssets) {
      if (getVal(a, 'source') === true) continue;
      const type = String(getVal(a, 'type') || '');
      if (type !== 'template' && type !== 'render' && type !== 'model') continue;
      const name = String(getVal(a, 'name') || '');
      const file = assetFileName(a);
      if (!matcherFn(file, name)) continue;
      const base = normalizeBaseName(name || file);
      const g = ensureGroup(base, name || file);
      if (type === 'template' && !g.template) g.template = a;
      else if (type === 'render' && !g.renders.includes(a)) g.renders.push(a);
      else if (type === 'model' && !g.models.includes(a)) g.models.push(a);
    }

    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  // Verifica se o parent já possui um filho montado para este grupo (idempotência sem duplicar)
  function findExistingChildForGroup(parentEntity, group) {
    const children = findChildren(parentEntity);
    const tplId = group.template ? Number(getVal(group.template, 'id')) : null;
    const renderIds = new Set(group.renders.map((a) => Number(getVal(a, 'id'))));
    const modelIds = new Set(group.models.map((a) => Number(getVal(a, 'id'))));

    for (const child of children) {
      const childBase = normalizeBaseName(getVal(child, 'name'));
      const childTpl = Number(getVal(child, 'template_id') || 0);
      const childModel = Number(getVal(child, 'components.model.asset') || 0);
      const childRender = Number(getVal(child, 'components.render.asset') || 0);

      if (tplId && childTpl === tplId) return child;
      if (childModel && modelIds.has(childModel)) return child;
      if (childRender && renderIds.has(childRender)) return child;
      if (childBase === group.base) return child;
    }
    return null;
  }

  async function mountGlbGroup(group, parentEntity) {
    const existing = findExistingChildForGroup(parentEntity, group);
    if (existing) {
      existing.set('enabled', true);
      return { status: 'mantido', detail: `"${group.label}" (já montado em ${getVal(existing, 'name')})` };
    }

    // 1) Formato novo: template gerado do GLB
    if (group.template) {
      if (typeof group.template.instantiateTemplate === 'function') {
        const inst = await group.template.instantiateTemplate(parentEntity, { history: true });
        if (inst) {
          inst.set('name', group.label);
          inst.set('position', [0, 0, 0]);
          inst.set('rotation', [0, 0, 0]);
          inst.set('scale', [1, 1, 1]);
          return { status: 'montado', detail: `template "${group.label}" (id=${getVal(group.template, 'id')})` };
        }
      }
      if (typeof assetsApi.instantiateTemplates === 'function') {
        const list = await assetsApi.instantiateTemplates([group.template], parentEntity, { history: true });
        const inst = Array.isArray(list) ? list[0] : list;
        if (inst) {
          inst.set('name', group.label);
          inst.set('position', [0, 0, 0]);
          inst.set('rotation', [0, 0, 0]);
          inst.set('scale', [1, 1, 1]);
          return { status: 'montado', detail: `template "${group.label}" (id=${getVal(group.template, 'id')})` };
        }
      }
    }

    // 2) Formato novo sem template: render asset(s)
    if (group.renders.length > 0) {
      for (const renderAsset of group.renders) {
        const renderId = Number(getVal(renderAsset, 'id'));
        const renderName = String(getVal(renderAsset, 'name') || group.label);
        await entitiesApi.create(
          {
            name: renderName,
            parent: parentEntity,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            enabled: true,
            components: {
              render: {
                enabled: true,
                type: 'asset',
                asset: renderId,
                castShadows: false,
                receiveShadows: false,
              },
            },
          },
          { history: true },
        );
      }
      return { status: 'montado', detail: `${group.renders.length} render(s) de "${group.label}"` };
    }

    // 3) Formato legado (useModelV2: false): asset do tipo "model"
    if (group.models.length > 0) {
      const modelAsset = group.models[0];
      const modelId = Number(getVal(modelAsset, 'id'));
      const childName = String(getVal(modelAsset, 'name') || group.label);
      const child = await entitiesApi.create(
        {
          name: childName,
          parent: parentEntity,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          enabled: true,
          components: {
            model: {
              enabled: true,
              type: 'asset',
              asset: modelId,
              castShadows: false,
              receiveShadows: false,
            },
          },
        },
        { history: true },
      );
      // Garante atribuição do componente model caso o Editor ignore `components` no create
      if (child && !getVal(child, 'components.model')) {
        child.addComponent('model', {
          enabled: true,
          type: 'asset',
          asset: modelId,
          castShadows: false,
          receiveShadows: false,
        });
      }
      return { status: 'montado', detail: `model "${group.label}" (id=${modelId})` };
    }

    return { status: 'ausente', detail: `"${group.label}" (nenhum asset derivado template/render/model encontrado)` };
  }

  // --- 1. Desativar entidades padrão e antigas do projeto ---
  const LEGACY_NAMES = new Set(['Camera', 'Light', 'Player', 'Ground', 'Plane']);
  const LEGACY_SCRIPTS = ['playerMovement', 'cameraFollow', 'gunController'];
  const VEHICLE_SLOTS = [
    { name: 'A29', slug: 'a29', position: [1400, 5.4, 410], rotation: [0, 0, 0] },
    { name: 'Heli', slug: 'helicoptero', position: [-5, 189.4, -63], rotation: [0, 0, 0] },
    { name: 'Carro_Inicial', slug: 'carro', position: [38, 3, -622], rotation: [0, -90, 0] },
    { name: 'Carro_1', slug: 'carro-compacto', position: [-650, 3, -450], rotation: [0, 0, 0] },
    { name: 'Carro_2', slug: 'carro-picape', position: [-392, 3, -360], rotation: [0, 0, 0] },
    { name: 'Carro_3', slug: 'carro-esportivo', position: [-134, 3, -270], rotation: [0, 0, 0] },
    { name: 'Carro_4', slug: 'carro-compacto', position: [124, 3, -180], rotation: [0, 0, 0] },
    { name: 'Carro_5', slug: 'carro-picape', position: [382, 3, -90], rotation: [0, 0, 0] },
    { name: 'Carro_Tunado', slug: 'carro-tunado', position: [729, 3, 410], rotation: [0, -90, 0] },
    { name: 'Personagem', slug: 'personagem', position: [38, 3, -618.8], rotation: [0, 0, 0] },
    { name: 'UniAcademia', slug: 'uniacademia', position: [0, 3, -110], rotation: [0, 0, 0] },
  ];
  const OUR_NAMES = new Set(['Jogo', 'Mundo', 'CameraJogo', 'Sol', ...VEHICLE_SLOTS.map((v) => v.name)]);
  const disabledNames = [];

  for (const entity of listEntities()) {
    const name = String(getVal(entity, 'name') || '');
    if (OUR_NAMES.has(name)) continue;

    if (LEGACY_NAMES.has(name) && getVal(entity, 'enabled') !== false) {
      entity.set('enabled', false);
      disabledNames.push(name);
    }

    const scriptsObj = getVal(entity, 'components.script.scripts');
    if (scriptsObj && typeof scriptsObj === 'object') {
      for (const oldScript of LEGACY_SCRIPTS) {
        if (scriptsObj[oldScript] && scriptsObj[oldScript].enabled !== false) {
          entity.set(`components.script.scripts.${oldScript}.enabled`, false);
          disabledNames.push(`${name}.${oldScript}`);
        }
      }
    }
  }

  // --- 2. Entidade "Jogo" com o script clássico "simuladorVoo" ---
  const jogo = await ensureEntity('Jogo', { position: [0, 0, 0], rotation: [0, 0, 0] });
  const scriptOrder = getVal(jogo, 'components.script.order') || [];
  let scriptInfo = 'já anexado (mantido)';
  if (!scriptOrder.includes('simuladorVoo') && !scriptOrder.includes('flightSim')) {
    const hasClassic = allAssets.some((a) => {
      const scripts = getVal(a, 'data.scripts');
      return scripts && typeof scripts === 'object' && 'simuladorVoo' in scripts;
    });
    const hasEsm = allAssets.some((a) => String(getVal(a, 'name') || '').toLowerCase() === 'flight-sim.mjs');
    const scriptName = hasClassic ? 'simuladorVoo' : hasEsm ? 'flightSim' : 'simuladorVoo';
    let attached = false;
    try {
      if (typeof jogo.addScript === 'function') {
        await jogo.addScript(scriptName, { history: true });
        attached = true;
      } else if (typeof entitiesApi.addScript === 'function') {
        await entitiesApi.addScript([jogo], scriptName, { history: true });
        attached = true;
      }
    } catch (err) {
      console.warn(`[Horizonte Dourado] Aviso ao anexar script "${scriptName}" via addScript:`, err);
    }
    if (!attached) {
      ensureComponent(jogo, 'script', {
        enabled: true,
        order: [scriptName],
        scripts: { [scriptName]: { enabled: true, attributes: {} } },
      });
    }
    scriptInfo = `"${scriptName}" anexado`;
  }

  // --- 3. Entidade "Sol" (luz direcional de fim de tarde) ---
  const sol = await ensureEntity('Sol', { position: [0, 300, 0], rotation: [58, 125, 0] });
  ensureComponent(sol, 'light', {
    enabled: true,
    type: 'directional',
    color: [1, 0.8, 0.6],
    intensity: 1.7,
    castShadows: false,
  });

  // --- 4. Entidade "CameraJogo" (enquadramento inicial atrás do carro na cidade) ---
  const cam = await ensureEntity('CameraJogo', { position: [29.6, 5.85, -622], rotation: [-14, -90, 0] });
  ensureComponent(cam, 'camera', {
    enabled: true,
    clearColor: [0.98, 0.72, 0.55, 1],
    fov: 65,
    nearClip: 1,
    farClip: 6000,
    toneMapping: 3, // TONEMAP_ACES
  });

  // --- 5. Veículos estacionados e personagem (posições oficiais do mundo aberto) ---
  const mountedList = [];
  const missingList = [];

  for (const slot of VEHICLE_SLOTS) {
    const ent = await ensureEntity(slot.name, {
      position: slot.position,
      rotation: slot.rotation,
      scale: [1, 1, 1],
    });
    const re = new RegExp(`^${slot.slug}(\\.(glb|json))?$`, 'i');
    const groups = resolveGlbGroups((file, name) => re.test(file) || re.test(name));
    if (groups.length === 0) {
      missingList.push(`${slot.name}: nenhum asset "${slot.slug}.glb" encontrado no projeto`);
    } else {
      const res = await mountGlbGroup(groups[0], ent);
      if (res.status === 'ausente') missingList.push(`${slot.name}: ${res.detail}`);
      else mountedList.push(`${slot.name} (${res.status}): ${res.detail}`);
    }
  }

  // --- 6. Entidade "Mundo" (filhos visuais de todos os mundo-*.glb, incluindo mundo-aeroporto.glb) ---
  const mundo = await ensureEntity('Mundo', { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  const worldGroups = resolveGlbGroups(
    (file, name) => /^mundo-/i.test(file) || /^mundo-/i.test(name),
  );
  if (worldGroups.length === 0) {
    missingList.push('Mundo: nenhum asset "mundo-*.glb" encontrado no projeto');
  } else {
    for (const g of worldGroups) {
      const res = await mountGlbGroup(g, mundo);
      if (res.status === 'ausente') missingList.push(`Mundo: ${res.detail}`);
      else mountedList.push(`Mundo (${res.status}): ${res.detail}`);
    }
  }

  // --- 7. Iluminação ambiente, névoa da cena e Settings -> Input -> Keyboard ---
  try {
    const sceneSettings = settingsApi && settingsApi.scene ? settingsApi.scene : null;
    if (sceneSettings && typeof sceneSettings.set === 'function') {
      sceneSettings.set('render.global_ambient', [0.55, 0.48, 0.55]);
      sceneSettings.set('render.fog', 'linear');
      sceneSettings.set('render.fog_color', [0.98, 0.72, 0.55]);
      sceneSettings.set('render.fog_start', 900);
      sceneSettings.set('render.fog_end', 4200);
    }
  } catch {
    // Opcional: o script do jogo também aplica luz ambiente e névoa no Launch
  }

  let keyboardConfigured = false;
  try {
    const projectSettings =
      (settingsApi && settingsApi.project) ||
      (typeof editor.call === 'function' ? editor.call('settings:project') : null);
    if (projectSettings && typeof projectSettings.set === 'function') {
      projectSettings.set('useKeyboard', true);
      keyboardConfigured = true;
    }
  } catch {
    keyboardConfigured = false;
  }

  // --- Diagnóstico detalhado no Console ---
  const relevantAssets = allAssets
    .filter((a) => {
      const n = String(getVal(a, 'name') || '');
      const f = assetFileName(a);
      return /^(a29|helicoptero|carro|personagem|uniacademia|mundo-)/i.test(n) || /^(a29|helicoptero|carro|personagem|uniacademia|mundo-)/i.test(f);
    })
    .map(describeAsset);

  console.log('=== [Horizonte Dourado] Resumo da montagem da cena ===');
  console.log(`Entidades: Jogo (${scriptInfo}), Sol, CameraJogo, Mundo, ${VEHICLE_SLOTS.map((v) => v.name).join(', ')}`);
  console.log(`Montados (${mountedList.length}):`);
  for (const line of mountedList) console.log(`  + ${line}`);
  if (missingList.length > 0) {
    console.warn(`Não encontrados (${missingList.length}):`);
    for (const line of missingList) console.warn(`  ! ${line}`);
  } else {
    console.log('Não encontrados: nenhum (todos os modelos encontrados foram montados).');
  }
  console.log(`Assets a29/mundo-* detectados no projeto (${relevantAssets.length}):`);
  for (const desc of relevantAssets) console.log(`  · ${desc}`);
  console.log(`Desativados: ${disabledNames.length > 0 ? disabledNames.join(', ') : 'nenhum item antigo ativo'}`);
  console.log(
    keyboardConfigured
      ? 'Settings → Input → Keyboard: ativado automaticamente.'
      : 'Settings → Input → Keyboard: confirme manualmente em Settings → Input → Keyboard.',
  );
  console.log('Dica: selecione "A29" na Hierarchy e pressione F no Viewport para focar o avião. Depois clique em Launch!');
})();
