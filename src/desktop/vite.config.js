import { defineConfig } from 'vite';

// El front vive en ./web. Tauri lo sirve en dev desde Vite y en producción
// desde su protocolo interno (sin navegador y sin servidor local).
// Puerto 1421 para no chocar con Bitoo (1420).
export default defineConfig({
  root: 'web',
  clearScreen: false,
  server: { port: 1421, strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
});
