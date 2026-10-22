import { defineConfig } from 'vitest/config';

// El primer test de una corrida en frío puede tardar más de 5 s en cargar módulos (visto en Windows).
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
