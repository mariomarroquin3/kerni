import { describe, expect, it, afterAll } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calcularEvento, diaLocal, TOPE_DIARIO_XP, XP_POR_EVENTO } from '../src/progreso.js';
import { createSqliteMemoria } from '../src/memoria/sqlite.js';
import { createMemoriaNula } from '../src/memoria/memoria.js';
import { buildApp } from '../src/app.js';

const DEVICE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTRO = '1b4e28ba-2fa3-4d2a-9f3c-5e6f7a8b9c0d';
const callado = { error() {}, warn() {} };

const tmpDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp-test');
mkdirSync(tmpDir, { recursive: true });

const abiertas = [];
let n = 0;
function dirAislado() {
  const dir = join(tmpDir, `progreso-${Date.now()}-${++n}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function mkMemoria(dataDir = dirAislado()) {
  const memoria = createSqliteMemoria({ dataDir, supabase: null, logger: callado });
  abiertas.push(memoria);
  return { memoria, dataDir };
}

// Un día civil en El Salvador: 12:00 hora local = 18:00 UTC.
const DIA_1 = Date.parse('2026-11-01T18:00:00Z');
const DIA_2 = Date.parse('2026-11-02T18:00:00Z');

afterAll(() => {
  for (const m of abiertas) m.cerrar();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('reglas de progreso (puras)', () => {
  it('el día se cuenta en hora de El Salvador (UTC-6)', () => {
    expect(diaLocal(Date.parse('2026-11-01T05:59:59Z'))).toBe('2026-10-31');
    expect(diaLocal(Date.parse('2026-11-01T06:00:00Z'))).toBe('2026-11-01');
  });

  it('los valores de XP son los del diseño y el tope es 20', () => {
    expect(XP_POR_EVENTO).toEqual({ ayuda_leida: 3, consejo_visto: 2, leccion_completa: 5 });
    expect(TOPE_DIARIO_XP).toBe(20);
  });

  it('un evento desconocido no suma nada', () => {
    expect(calcularEvento({ evento: 'terminar_proceso' })).toMatchObject({ aplicado: false, puntos: 0, motivo: 'evento_desconocido' });
  });

  it('al llegar al tope no entra más, y lo que cabe entra parcial', () => {
    expect(calcularEvento({ evento: 'ayuda_leida', xpHoy: 18 })).toMatchObject({ aplicado: true, puntos: 2 });
    expect(calcularEvento({ evento: 'ayuda_leida', xpHoy: 20 })).toMatchObject({ aplicado: false, motivo: 'tope_diario' });
  });

  it('la lección cuenta una sola vez por día', () => {
    expect(calcularEvento({ evento: 'leccion_completa', leccionHoy: true })).toMatchObject({ aplicado: false, motivo: 'ya_hoy' });
    expect(calcularEvento({ evento: 'leccion_completa', leccionHoy: false })).toMatchObject({ aplicado: true, puntos: 5, leccionHoy: true });
  });
});

describe('progreso en SQLite', () => {
  it('suma ayuda y consejo, y el total sobrevive a cerrar y reabrir la base', async () => {
    const { memoria, dataDir } = mkMemoria();
    await memoria.sumarEvento(DEVICE, 'ayuda_leida', DIA_1);
    const r = await memoria.sumarEvento(DEVICE, 'consejo_visto', DIA_1);
    expect(r).toMatchObject({ aplicado: true, xp: 5, xpHoy: 5, topeDiario: 20 });
    memoria.cerrar();

    const reabierta = mkMemoria(dataDir).memoria;
    expect(await reabierta.progreso(DEVICE, DIA_1)).toMatchObject({ xp: 5, xpHoy: 5, leccionHoy: false });
  });

  it('el tope diario se aplica en la base, no solo en la interfaz', async () => {
    const { memoria } = mkMemoria();
    for (let i = 0; i < 6; i++) await memoria.sumarEvento(DEVICE, 'ayuda_leida', DIA_1);
    expect(await memoria.progreso(DEVICE, DIA_1)).toMatchObject({ xpHoy: 18 });
    expect(await memoria.sumarEvento(DEVICE, 'ayuda_leida', DIA_1)).toMatchObject({ aplicado: true, puntos: 2, xpHoy: 20 });
    const tope = await memoria.sumarEvento(DEVICE, 'ayuda_leida', DIA_1);
    expect(tope).toMatchObject({ aplicado: false, motivo: 'tope_diario', xp: 20, xpHoy: 20 });
  });

  it('al cambiar el día el contador de hoy vuelve a cero y el XP total sigue', async () => {
    const { memoria } = mkMemoria();
    for (let i = 0; i < 7; i++) await memoria.sumarEvento(DEVICE, 'ayuda_leida', DIA_1);
    const otroDia = await memoria.sumarEvento(DEVICE, 'ayuda_leida', DIA_2);
    expect(otroDia).toMatchObject({ aplicado: true, puntos: 3, xp: 20 + 3, xpHoy: 3 });
  });

  it('la lección se da una vez por día y vuelve a estar disponible al día siguiente', async () => {
    const { memoria } = mkMemoria();
    expect(await memoria.sumarEvento(DEVICE, 'leccion_completa', DIA_1)).toMatchObject({ aplicado: true, puntos: 5 });
    expect(await memoria.sumarEvento(DEVICE, 'leccion_completa', DIA_1)).toMatchObject({ aplicado: false, motivo: 'ya_hoy' });
    expect(await memoria.sumarEvento(DEVICE, 'leccion_completa', DIA_2)).toMatchObject({ aplicado: true, puntos: 5, xp: 10 });
  });

  it('cada PC tiene su propio progreso', async () => {
    const { memoria } = mkMemoria();
    await memoria.sumarEvento(DEVICE, 'ayuda_leida', DIA_1);
    expect(await memoria.progreso(OTRO, DIA_1)).toMatchObject({ xp: 0, xpHoy: 0 });
  });

  it('olvidar todo también borra el progreso', async () => {
    const { memoria } = mkMemoria();
    await memoria.sumarEvento(DEVICE, 'ayuda_leida', DIA_1);
    await memoria.olvidarTodo(DEVICE);
    expect(await memoria.progreso(DEVICE, DIA_1)).toMatchObject({ xp: 0, xpHoy: 0 });
  });
});

describe('rutas /progreso', () => {
  function appCon(memoria) {
    return buildApp({ config: {}, memoria });
  }

  it('GET y POST rechazan un device_id que no es UUID', async () => {
    const app = appCon(mkMemoria().memoria);
    expect((await app.inject({ method: 'GET', url: '/progreso?device_id=hola' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/progreso' })).statusCode).toBe(400);
    const post = await app.inject({ method: 'POST', url: '/progreso/evento', payload: { device_id: 'x', evento: 'ayuda_leida' } });
    expect(post.statusCode).toBe(400);
    await app.close();
  });

  it('POST rechaza un evento que no está en la lista cerrada', async () => {
    const app = appCon(mkMemoria().memoria);
    for (const evento of ['terminar_proceso', 'vaciar_papelera', 'ayuda_leida ', undefined]) {
      const r = await app.inject({ method: 'POST', url: '/progreso/evento', payload: { device_id: DEVICE, evento } });
      expect(r.statusCode, String(evento)).toBe(400);
    }
    await app.close();
  });

  it('POST suma XP y el tope se cumple aunque la interfaz mande de más', async () => {
    const app = appCon(mkMemoria().memoria);
    let ultimo;
    for (let i = 0; i < 10; i++) {
      ultimo = await app.inject({ method: 'POST', url: '/progreso/evento', payload: { device_id: DEVICE, evento: 'ayuda_leida' } });
      expect(ultimo.statusCode).toBe(200);
    }
    const cuerpo = ultimo.json();
    expect(cuerpo).toMatchObject({ ok: true, aplicado: false, motivo: 'tope_diario', xpHoy: 20, topeDiario: 20 });
    const get = await app.inject({ method: 'GET', url: `/progreso?device_id=${DEVICE}` });
    expect(get.json()).toMatchObject({ habilitado: true, xp: 20, xpHoy: 20, topeDiario: 20 });
    await app.close();
  });

  it('con la memoria apagada responde 503 con un mensaje claro', async () => {
    const app = appCon(createMemoriaNula());
    const get = await app.inject({ method: 'GET', url: `/progreso?device_id=${DEVICE}` });
    expect(get.statusCode).toBe(503);
    expect(get.json().error).toMatch(/memoria local está apagada/);
    const post = await app.inject({ method: 'POST', url: '/progreso/evento', payload: { device_id: DEVICE, evento: 'ayuda_leida' } });
    expect(post.statusCode).toBe(503);
    await app.close();
  });
});
