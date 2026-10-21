import { defineConfig } from 'vitest/config';

// El primer test de una corrida en frío puede tardar más de 5 s en cargar módulos (visto en Windows).
export default defineConfig({ test: { testTimeout: 20_000 } });
