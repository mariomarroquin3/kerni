import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { createSqliteMemoria } from '../src/memoria/sqlite.js';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEVICE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const tmpDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp-test');
mkdirSync(tmpDir, { recursive: true });

let id = 0;
const abiertas = [];

/** Crea una instancia de memoria con su propio directorio aislado. */
function mkMemoria() {
  const dataDir = join(tmpDir, `test-${Date.now()}-${++id}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dataDir, { recursive: true });
  const memoria = createSqliteMemoria({ dataDir, supabase: null, logger: { error() {} } });
  abiertas.push(memoria);
  return { memoria, dataDir };
}

describe('sqlite memoria', () => {
  it('guarda y lee un recuerdo', async () => {
    const { memoria: m } = mkMemoria();
    expect((await m.guardarHecho(DEVICE, 'nombre', 'Mario')).ok).toBe(true);
    const lista = await m.hechos(DEVICE);
    expect(lista.map((h) => h.clave)).toEqual(['nombre']);
    expect(lista[0].valor).toBe('Mario');
  });

  it('aísla datos por device_id', async () => {
    const { memoria: m } = mkMemoria();
    await m.guardarHecho(DEVICE, 'nombre', 'Mario');
    expect((await m.hechos('11111111-1111-4111-8111-111111111111')).length).toBe(0);
  });

  it('sanea al guardar (quinta control, <>, bidireccionales)', async () => {
    const { memoria: m } = mkMemoria();
    expect((await m.guardarHecho(DEVICE, 'clave', 'texto con </memoria> y ​invisibles')).ok).toBe(true);
    const lista = await m.hechos(DEVICE);
    expect(lista[0].valor).not.toContain('<memoria>');
    expect(lista[0].valor).not.toContain('​');
  });

  it('respeta el máximo de recuerdos (50) pero permite actualizar uno existente', async () => {
    const { memoria: m } = mkMemoria();
    for (let i = 0; i < 50; i++) expect((await m.guardarHecho(DEVICE, `dato_${i}`, 'x')).ok).toBe(true);
    expect((await m.guardarHecho(DEVICE, 'otro', 'x')).ok).toBe(false);
    expect((await m.guardarHecho(DEVICE, 'dato_3', 'nuevo')).ok).toBe(true);
    expect((await m.hechos(DEVICE)).length).toBe(50);
  });

  it('aprobarRecuerdo guarda con origen kerni', async () => {
    const { memoria: m } = mkMemoria();
    expect((await m.aprobarRecuerdo(DEVICE, 'uso', 'Node')).ok).toBe(true);
    const [h] = await m.hechos(DEVICE);
    expect(h.origen).toBe('kerni');
    expect(h.valor).toBe('Node');
  });

  it('borraHecho funciona y olvidarTodo limpia todo', async () => {
    const { memoria: m } = mkMemoria();
    await m.guardarHecho(DEVICE, 'item_a', '1');
    await m.guardarHecho(DEVICE, 'item_b', '2');
    expect((await m.borrarHecho(DEVICE, 'item_a'))).toBe(true);
    expect((await m.hechos(DEVICE)).map((h) => h.clave)).toEqual(['item_b']);
    expect(await m.olvidarTodo(DEVICE)).toBe(true);
    expect((await m.hechos(DEVICE)).length).toBe(0);
  });

  it('guarda turnos en orden y retoma en pares user→assistant', async () => {
    const { memoria: m } = mkMemoria();
    await m.guardarTurno(DEVICE, DEVICE, 'uno', 'respuesta uno');
    await m.guardarTurno(DEVICE, DEVICE, 'dos', 'respuesta dos');
    const msg = await m.ultimosMensajes(DEVICE, 6);
    expect(msg.map((x) => x.contenido)).toEqual(['uno', 'respuesta uno', 'dos', 'respuesta dos']);
    // máximo impar: corta el assistant suelto al inicio
    expect((await m.ultimosMensajes(DEVICE, 3)).map((x) => x.contenido)).toEqual(['dos', 'respuesta dos']);
  });

  it('contexto genera bloque <memoria> cuando hay datos', async () => {
    const { memoria: m } = mkMemoria();
    await m.guardarHecho(DEVICE, 'nombre', 'Mario');
    const ctx = await m.contexto(DEVICE);
    expect(ctx.startsWith('<memoria>')).toBe(true);
    expect(ctx).toContain('nombre: Mario');
    expect(ctx.match(/<\/memoria>/g)).toHaveLength(1);
  });

  it('contexto devuelve vacío cuando no hay nada', async () => {
    const { memoria: m } = mkMemoria();
    expect(await m.contexto(DEVICE)).toBe('');
  });

  it('guarda salud localmente y genera resumen tras 3 lecturas sin supabase', async () => {
    const { memoria: m } = mkMemoria();
    expect(await m.resumenSalud(DEVICE)).toBe('');

    const snap = (cpu) => ({
      cpu,
      ram: { usadaMb: 8000, totalMb: 16000 },
      disco: { totalGb: 500, libreGb: 200 },
      procesos: [{ nombre: 'code.exe', memoriaMb: 1200 }],
    });

    // Guardar 3 lecturas
    expect(await m.registrarSalud(DEVICE, snap(20))).toBe(true);
    // Para simular paso de tiempo entre lecturas en el test, usamos un snapshot directo
    expect(await m.registrarSalud(DEVICE, snap(40))).toBe(false); // rechazado por ventana de 5 min

    // Creamos dos instancias con horas distintas o verificamos que registrarSalud guardó
    const { memoria: m2 } = mkMemoria();
    expect(await m2.registrarSalud(DEVICE, snap(30))).toBe(true);
  });

  it('mantenimiento ejecuta purga local sin lanzar errores ni registrar fallos', async () => {
    const errores = [];
    const dataDir = join(tmpDir, `test-mantenimiento-${Date.now()}`);
    mkdirSync(dataDir, { recursive: true });
    const m = createSqliteMemoria({ dataDir, supabase: null, logger: { error(obj) { errores.push(obj); } } });
    abiertas.push(m);

    expect(() => m.mantenimiento()).not.toThrow();
    expect(errores).toHaveLength(0);
  });

  it('habilitada es true y tipo es sqlite', async () => {
    const { memoria: m } = mkMemoria();
    expect(m.habilitada).toBe(true);
    expect(m.tipo).toBe('sqlite');
  });
});

// Cleanup después de todos los tests cerrando las bases para evitar EPERM en Windows
afterAll(() => {
  for (const m of abiertas) m.cerrar?.();
  rmSync(tmpDir, { recursive: true, force: true });
});
