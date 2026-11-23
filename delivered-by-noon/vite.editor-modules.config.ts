import { defineConfig } from 'vite';
import { editorScriptExport } from './vite.editor.config.ts';

export default defineConfig({
  plugins: [editorScriptExport()],
  build: {
    target: 'es2022',
    outDir: 'dist-editor/modules',
    emptyOutDir: true,
    copyPublicDir: false,
    minify: false,
    sourcemap: false,
    lib: { entry: 'src/editor/flight-sim.ts', formats: ['es'] },
    rolldownOptions: {
      external: ['playcanvas'],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].mjs',
        chunkFileNames: '[name].mjs',
        minifyInternalExports: false,
      },
    },
  },
});
