import { defineConfig } from 'vite';

// Script clássico do Editor: um único .js (IIFE) que usa o `pc` global que o Editor já carrega.
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist-editor',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    lib: {
      entry: 'src/editor/flight-sim-classic.ts',
      formats: ['iife'],
      name: 'SimuladorVooBundle',
      fileName: () => 'flight-sim.js',
    },
    rolldownOptions: {
      external: ['playcanvas'],
      output: { globals: { playcanvas: 'pc' }, codeSplitting: false },
    },
  },
});
