import { defineConfig, type Plugin } from 'vite';

/**
 * O leitor de scripts ESM do Editor do PlayCanvas só reconhece a forma
 * `export class Nome extends Script`. O empacotador gera
 * `var FlightSim = class extends Script` + `export { FlightSim }`, que o Editor ignora
 * (o script não aparecia na lista do componente Script). Reescreve para a forma direta.
 */
export function editorScriptExport(): Plugin {
  return {
    name: 'editor-script-export',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue;
        const before = chunk.code;
        let code = before.replace(/^var FlightSim = class extends Script \{/m, 'export class FlightSim extends Script {');
        code = code.replace(/^export \{ FlightSim \};\s*$/m, '');
        if (code === before || !/^export class FlightSim extends Script \{/m.test(code)) {
          this.error('editor-script-export: não achei a declaração de FlightSim para reescrever');
        }
        chunk.code = code;
      }
    },
  };
}

export default defineConfig({
  plugins: [editorScriptExport()],
  build: {
    target: 'es2022',
    outDir: 'dist-editor',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: 'src/editor/flight-sim.ts',
      formats: ['es'],
      fileName: () => 'flight-sim.mjs',
    },
    rolldownOptions: {
      external: ['playcanvas'],
      output: {
        codeSplitting: false,
      },
    },
  },
});
