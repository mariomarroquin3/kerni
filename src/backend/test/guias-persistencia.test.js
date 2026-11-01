import { describe, expect, it, afterAll } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSqliteMemoria } from '../src/memoria/sqlite.js';
import { createMemoriaNula } from '../src/memoria/memoria.js';

const DEVICE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTRO = '1b4e28ba-2fa3-4d2a-9f3c-5e6f7a8b9c0d';
const callado = { error() {}, warn() {} };
const AHORA = Date.parse('2026-11-01T18:00:00Z');

const tmpDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp-test-guias');
mkdirSync(tmpDir, { recursive: true });
const abiertas = [];
let n = 0;
function dirAislado() {
  const dir = join(tmpDir, `guias-${Date.now()}-${++n}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function abrir(dataDir) {
  const memoria = createSqliteMemoria({ dataDir, supabase: null, logger: callado });
  abiertas.push(memoria);
  return memoria;
}

afterAll(() => {
  for (const m of abiertas) m.cerrar();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('progreso de guías en SQLite', () => {
  it('sin guía iniciada no hay fila', async () => {
    const m = abrir(dirAislado());
    expect(await m.guiaActual(DEVICE)).toBeNull();
  });

  it('iniciar guarda la guía en el paso 0 con fechas', async () => {
    const m = abrir(dirAislado());
    await m.iniciarGuia(DEVICE, 'pc-lenta', AHORA);
    const fila = await m.guiaActual(DEVICE);
    expect(fila).toEqual({ guia_id: 'pc-lenta', paso: 0, iniciada: '2026-11-01T18:00:00.000Z', actualizada: '2026-11-01T18:00:00.000Z' });
  });

  it('avanzar cambia el paso y la fecha de actualización, sin tocar la de inicio', async () => {
    const m = abrir(dirAislado());
    await m.iniciarGuia(DEVICE, 'pc-lenta', AHORA);
    await m.avanzarGuia(DEVICE, 2, AHORA + 60_000);
    const fila = await m.guiaActual(DEVICE);
    expect(fila.paso).toBe(2);
    expect(fila.iniciada).toBe('2026-11-01T18:00:00.000Z');
    expect(fila.actualizada).toBe('2026-11-01T18:01:00.000Z');
  });

  it('iniciar otra guía reemplaza la anterior y vuelve al paso 0', async () => {
    const m = abrir(dirAislado());
    await m.iniciarGuia(DEVICE, 'pc-lenta', AHORA);
    await m.avanzarGuia(DEVICE, 3, AHORA);
    await m.iniciarGuia(DEVICE, 'espacio-en-disco', AHORA + 5_000);
    expect(await m.guiaActual(DEVICE)).toEqual({ guia_id: 'espacio-en-disco', paso: 0, iniciada: '2026-11-01T18:00:05.000Z', actualizada: '2026-11-01T18:00:05.000Z' });
  });

  it('cada PC tiene su propia guía', async () => {
    const m = abrir(dirAislado());
    await m.iniciarGuia(DEVICE, 'pc-lenta', AHORA);
    await m.iniciarGuia(OTRO, 'impresora-fuera-de-linea', AHORA);
    await m.avanzarGuia(OTRO, 1, AHORA);
    expect((await m.guiaActual(DEVICE)).guia_id).toBe('pc-lenta');
    expect((await m.guiaActual(OTRO)).guia_id).toBe('impresora-fuera-de-linea');
    expect((await m.guiaActual(DEVICE)).paso).toBe(0);
  });

  it('borrarGuia quita la guía en curso', async () => {
    const m = abrir(dirAislado());
    await m.iniciarGuia(DEVICE, 'pc-lenta', AHORA);
    await m.borrarGuia(DEVICE);
    expect(await m.guiaActual(DEVICE)).toBeNull();
  });

  it('un paso negativo no entra en la base', async () => {
    const m = abrir(dirAislado());
    await m.iniciarGuia(DEVICE, 'pc-lenta', AHORA);
    await expect(m.avanzarGuia(DEVICE, -1, AHORA)).rejects.toThrow();
  });

  it('la guía sobrevive a cerrar la base y abrirla de nuevo', async () => {
    const dir = dirAislado();
    const primera = createSqliteMemoria({ dataDir: dir, supabase: null, logger: callado });
    await primera.iniciarGuia(DEVICE, 'actualizaciones-pendientes', AHORA);
    await primera.avanzarGuia(DEVICE, 2, AHORA);
    primera.cerrar();
    const segunda = abrir(dir);
    expect(await segunda.guiaActual(DEVICE)).toMatchObject({ guia_id: 'actualizaciones-pendientes', paso: 2 });
  });

  it('olvidar todo también borra la guía en curso', async () => {
    const m = abrir(dirAislado());
    await m.iniciarGuia(DEVICE, 'pc-lenta', AHORA);
    expect(await m.olvidarTodo(DEVICE)).toBe(true);
    expect(await m.guiaActual(DEVICE)).toBeNull();
  });

  it('sin memoria, la interfaz existe y no guarda nada', async () => {
    const nula = createMemoriaNula();
    expect(await nula.guiaActual(DEVICE)).toBeNull();
    expect(await nula.iniciarGuia(DEVICE, 'pc-lenta')).toBe(false);
    expect(await nula.avanzarGuia(DEVICE, 1)).toBe(false);
    expect(await nula.borrarGuia(DEVICE)).toBe(false);
  });
});
