import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROCESOS_PROTEGIDOS, esProtegido } from '../src/telemetria.js';

// Regla 3 de AGENTS.md: la lista vive en telemetria.js y en sistema.rs, y tienen que coincidir.
const RUST = new URL('../../desktop/src-tauri/src/sistema.rs', import.meta.url);

function listaRust() {
  const fuente = readFileSync(RUST, 'utf8');
  const bloque = /const PROTEGIDOS: &\[&str\] = &\[([\s\S]*?)\];/.exec(fuente)?.[1];
  if (!bloque) throw new Error('no encontré PROTEGIDOS en sistema.rs');
  return [...bloque.replace(/\/\/.*$/gm, '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('procesos protegidos', () => {
  it('la lista del backend y la de Rust son iguales', () => {
    expect([...listaRust()].sort()).toEqual([...PROCESOS_PROTEGIDOS].sort());
  });

  it.each(['ctfmon.exe', 'TextInputHost.exe', 'SearchHost.exe', 'StartMenuExperienceHost.exe', 'RuntimeBroker.exe'])('%s está protegido', (n) => {
    expect(esProtegido(n)).toBe(true);
  });
});
