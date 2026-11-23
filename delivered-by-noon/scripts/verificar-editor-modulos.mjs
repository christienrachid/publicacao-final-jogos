import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSync } from 'rolldown/utils';

export const MODULE_DIR = fileURLToPath(new URL('../dist-editor/modules/', import.meta.url));

export function moduleFiles(root = MODULE_DIR) {
  assert(existsSync(root), `Build separado ausente: ${root}. Rode npm run build:editor.`);
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((file) => file.isFile() && file.name.endsWith('.mjs'))
    .map((file) => relative(root, resolve(file.parentPath, file.name)).replaceAll('\\', '/'))
    .sort();
}

export async function verifyModules(root = MODULE_DIR) {
  const files = moduleFiles(root);
  assert(files.includes('editor/flight-sim.mjs'), 'Entrada editor/flight-sim.mjs ausente.');
  const emitted = new Set(files);
  for (const file of files) {
    const fullPath = resolve(root, file);
    const parsed = parseSync(file, readFileSync(fullPath, 'utf8'));
    assert.equal(parsed.errors.length, 0, `ESM inválido: ${file}`);
    const imports = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) && node.source) {
        imports.push(node.source.value);
      }
      for (const child of Object.values(node)) {
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child === 'object') visit(child);
      }
    }
    visit(parsed.program);
    for (const specifier of imports) {
      assert(specifier, `Import dinâmico não literal em ${file}.`);
      if (specifier === 'playcanvas') continue;
      assert(specifier.startsWith('./') || specifier.startsWith('../'), `Import externo inesperado: ${file} → ${specifier}`);
      assert(specifier.endsWith('.mjs'), `Import sem extensão .mjs: ${file} → ${specifier}`);
      const target = relative(root, resolve(dirname(fullPath), specifier)).replaceAll('\\', '/');
      assert(emitted.has(target), `Módulo ausente: ${file} → ${specifier}`);
    }
  }
  // Import nativo executa inclusive ciclos entre módulos e resolve o playcanvas real.
  const { FlightSim } = await import(pathToFileURL(resolve(root, 'editor/flight-sim.mjs')).href);
  const { Script } = await import('playcanvas');
  assert(FlightSim?.prototype instanceof Script, 'FlightSim não estende Script do PlayCanvas.');
  assert.equal(FlightSim.scriptName, 'flightSim');
  for (const file of files) {
    const namespace = await import(pathToFileURL(resolve(root, file)).href);
    // O loader de scripts do engine inspeciona .prototype de cada export.
    assert(Object.values(namespace).every((value) => value != null), `Export nulo incompatível com preload: ${file}`);
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyModules().then((files) => console.log(`ESM separado: ${files.length} módulos importados; FlightSim e imports verificados.`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
