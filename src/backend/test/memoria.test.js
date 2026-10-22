import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSupabase } from '../src/memoria/supabase.js';
import { createMemoriaNula } from '../src/memoria/memoria.js';
import { createSqliteMemoria } from '../src/memoria/sqlite.js';
import { validarRecuerdo } from '../src/memoria/recuerdos.js';
import { buildApp } from '../src/app.js';
import { createAgent } from '../src/agent/agent.js';
import { createAnthropicProvider } from '../src/llm/anthropic.js';
import { fakeAnthropic, SNAPSHOT, texto, usarTool } from './helpers.js';

const DEVICE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const callado = { error() {}, warn() {} };

const abiertas = [];
const carpetas = [];
afterAll(() => {
  for (const m of abiertas) { try { m.cerrar(); } catch { /* ya cerrada */ } }
  for (const c of carpetas) rmSync(c, { recursive: true, force: true });
});

/** Memoria SQLite real en una carpeta temporal del sistema (no ensucia el repo). */
function sqliteTemporal() {
  const dataDir = mkdtempSync(join(tmpdir(), 'kerni-test-'));
  carpetas.push(dataDir);
  const m = createSqliteMemoria({ dataDir, supabase: null, logger: callado });
  abiertas.push(m);
  return m;
}

describe('cliente de Supabase', () => {
  const llamar = async (opciones, key = 'sb_secret_abc') => {
    const vistos = [];
    const fetch = async (url, init) => { vistos.push({ url, init }); return opciones.respuesta ?? new Response('[]', { status: 200 }); };
    const db = createSupabase({ url: 'https://x.supabase.co/', key, fetch });
    await opciones.hacer(db);
    return vistos[0];
  };

  it('arma el pedido de lectura con filtros y sin Authorization para llaves nuevas', async () => {
    const v = await llamar({ hacer: (db) => db.select('kerni_hechos', { filtros: { device_id: `eq.${DEVICE}` }, orden: 'id.desc', limite: 5 }) });
    expect(v.url).toBe(`https://x.supabase.co/rest/v1/kerni_hechos?select=*&device_id=eq.${DEVICE}&order=id.desc&limit=5`);
    expect(v.init.headers.apikey).toBe('sb_secret_abc');
    expect(v.init.headers.authorization).toBeUndefined();
  });

  it('con una llave legacy (JWT) manda también Authorization', async () => {
    const v = await llamar({ hacer: (db) => db.select('kerni_hechos') }, 'eyJhbGciOi.payload.firma');
    expect(v.init.headers.authorization).toBe('Bearer eyJhbGciOi.payload.firma');
  });

  it('upsert usa on_conflict y merge-duplicates', async () => {
    const v = await llamar({ hacer: (db) => db.upsert('kerni_hechos', [{ a: 1 }], 'device_id,clave') });
    expect(v.url).toContain('on_conflict=device_id%2Cclave');
    expect(v.init.headers.prefer).toMatch(/merge-duplicates/);
  });

  it('traduce 401 a llave inválida y nunca filtra la llave en el error', async () => {
    const db = createSupabase({ url: 'https://x.supabase.co', key: 'sb_secret_SUPERSECRETA', fetch: async () => new Response('{"message":"Invalid API key"}', { status: 401 }) });
    const err = await db.select('kerni_hechos').catch((e) => e);
    expect(err.codigo).toBe('memoria_llave_invalida');
    expect(err.message).not.toContain('SUPERSECRETA');
  });

  it('un fallo de red se vuelve un error claro', async () => {
    const db = createSupabase({ url: 'https://x.supabase.co', key: 'k', fetch: async () => { throw new TypeError('fetch failed'); } });
    expect((await db.select('kerni_hechos').catch((e) => e)).codigo).toBe('memoria_sin_red');
  });
});

describe('validarRecuerdo', () => {
  it('normaliza la clave y limpia el valor', () => {
    expect(validarRecuerdo({ clave: 'Uso Principal', valor: 'Programa en <b>Node</b>\nlas noches' })).toEqual({ ok: true, clave: 'uso_principal', valor: 'Programa en b Node /b las noches' });
  });
  it.each([
    ['mi api key es sk-abc12345678', 'api key'],
    ['contraseña: hunter2', 'contraseña'],
    ['AIzaSyA1234567890abcdefghijkl', 'llave de Google'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123', 'cadena opaca larga'],
    ['mi carpeta es C:\\Users\\mario\\Docs', 'ruta con usuario'],
    ['a'.repeat(201), 'muy largo'],
  ])('rechaza %s (%s)', (valor) => {
    expect(validarRecuerdo({ clave: 'algo', valor }).ok).toBe(false);
  });
  it('rechaza claves inválidas', () => {
    expect(validarRecuerdo({ clave: 'x', valor: 'hola' }).ok).toBe(false);
    expect(validarRecuerdo({ valor: 'hola' }).ok).toBe(false);
  });
});

async function appConMemoria({ respuestas = [], memoriaActiva = true, memoria: propia } = {}) {
  const anthropic = fakeAnthropic(respuestas);
  const provider = createAnthropicProvider({ anthropic });
  const memoria = propia ?? (memoriaActiva ? sqliteTemporal() : createMemoriaNula());
  // La reflexión automática hace su propia llamada al modelo: se apaga para que los guiones de estos tests no se mezclen.
  if (memoriaActiva && !propia) await memoria.guardarAjustes(DEVICE, { aprendizaje_auto: false });
  const agent = createAgent({ provider, logger: callado, memoriaActiva });
  return { app: buildApp({ config: {}, agent, provider, memoria }), anthropic, memoria };
}
const chat = (app, body) => app.inject({ method: 'POST', url: '/chat', payload: body });

describe('chat con memoria (SQLite)', () => {
  it('mete lo recordado en el contexto como dato', async () => {
    const { app, anthropic, memoria } = await appConMemoria({ respuestas: [texto('Hola Mario')] });
    await memoria.guardarHecho(DEVICE, 'nombre', 'Mario');
    await chat(app, { mensaje: 'hola', device_id: DEVICE });
    const sistema = anthropic.messages.create.llamadas[0].system.map((s) => s.text).join('\n');
    expect(sistema).toContain('<memoria>');
    expect(sistema).toContain('nombre: Mario');
  });

  it('guarda el turno y una sesión nueva retoma la charla anterior', async () => {
    const { app, anthropic } = await appConMemoria({ respuestas: [texto('Bien, gracias'), texto('Seguimos')] });
    await chat(app, { mensaje: '¿cómo estás?', device_id: DEVICE });
    await new Promise((r) => setTimeout(r, 20));
    await chat(app, { mensaje: 'y ahora', device_id: DEVICE }); // sin session_id: sesión nueva
    const mensajes = anthropic.messages.create.llamadas[1].messages;
    expect(mensajes.map((m) => m.content)).toEqual(['¿cómo estás?', 'Bien, gracias', 'y ahora']);
  });

  it('convierte proponer_recuerdo en una propuesta, sin guardarla', async () => {
    const { app, memoria } = await appConMemoria({
      respuestas: [usarTool('proponer_recuerdo', { clave: 'uso', valor: 'Programa en Node' }), texto('¿Lo anoto?')],
    });
    const body = (await chat(app, { mensaje: 'programo todo el día', device_id: DEVICE })).json();
    expect(body.acciones).toEqual([{ tipo: 'proponer_recuerdo', clave: 'uso', valor: 'Programa en Node' }]);
    expect(await memoria.hechos(DEVICE)).toEqual([]);
  });

  it('rechaza guardar un secreto propuesto por el modelo', async () => {
    const { app } = await appConMemoria({
      respuestas: [usarTool('proponer_recuerdo', { clave: 'llave', valor: 'mi password es 1234' }), texto('No lo guardo.')],
    });
    expect((await chat(app, { mensaje: 'x', device_id: DEVICE })).json().acciones).toEqual([]);
  });

  it('sin memoria el modelo no ve la herramienta de recordar y el chat sigue igual', async () => {
    const { app, anthropic } = await appConMemoria({ respuestas: [texto('ok')], memoriaActiva: false });
    expect((await chat(app, { mensaje: 'hola', device_id: DEVICE })).statusCode).toBe(200);
    expect(anthropic.messages.create.llamadas[0].tools.map((t) => t.name)).toEqual(['proponer_accion']);
  });

  it('sin device_id el modelo no ve la herramienta de recordar (no habría dónde guardar)', async () => {
    const { app, anthropic } = await appConMemoria({ respuestas: [texto('ok')] });
    await chat(app, { mensaje: 'hola' });
    expect(anthropic.messages.create.llamadas[0].tools.map((t) => t.name)).toEqual(['proponer_accion']);
  });

  it('ignora un device_id que no es UUID', async () => {
    const { app, memoria } = await appConMemoria({ respuestas: [texto('ok')] });
    await chat(app, { mensaje: 'hola', device_id: "x'; drop table--" });
    await new Promise((r) => setTimeout(r, 20));
    expect(await memoria.ultimosMensajes("x'; drop table--")).toEqual([]);
  });

  it('si la memoria falla (disco, base bloqueada) el chat responde igual', async () => {
    const explota = async () => { throw new Error('base bloqueada'); };
    const rota = { ...createMemoriaNula(), habilitada: true, contexto: explota, ultimosMensajes: explota, guardarTurno: explota };
    const { app } = await appConMemoria({ respuestas: [texto('sigo aquí')], memoria: rota });
    const res = await chat(app, { mensaje: 'hola', device_id: DEVICE });
    expect(res.statusCode).toBe(200);
    expect(res.json().respuesta).toMatch(/sigo aquí/);
  });
});

describe('rutas /memoria', () => {
  const llamar = (app, method, url, payload) => app.inject({ method, url, payload });

  it('guarda, lista y borra un recuerdo aprobado', async () => {
    const { app } = await appConMemoria();
    expect((await llamar(app, 'POST', '/memoria/hechos', { device_id: DEVICE, clave: 'nombre', valor: 'Mario' })).statusCode).toBe(201);
    expect((await llamar(app, 'GET', `/memoria?device_id=${DEVICE}`)).json().hechos.map((h) => h.clave)).toEqual(['nombre']);
    expect((await llamar(app, 'DELETE', `/memoria/hechos/nombre?device_id=${DEVICE}`)).statusCode).toBe(200);
    expect((await llamar(app, 'GET', `/memoria?device_id=${DEVICE}`)).json().hechos).toEqual([]);
  });

  it('valida device_id, secretos y memoria apagada', async () => {
    const { app } = await appConMemoria();
    expect((await llamar(app, 'GET', '/memoria?device_id=nope')).statusCode).toBe(400);
    expect((await llamar(app, 'POST', '/memoria/hechos', { device_id: DEVICE, clave: 'k1', valor: 'password: 1' })).statusCode).toBe(400);
    const { app: apagada } = await appConMemoria({ memoriaActiva: false });
    expect((await llamar(apagada, 'POST', '/memoria/hechos', { device_id: DEVICE, clave: 'nombre', valor: 'x' })).statusCode).toBe(503);
  });

  it('guarda la salud solo si la foto es válida', async () => {
    const { app } = await appConMemoria();
    expect((await llamar(app, 'POST', '/memoria/salud', { device_id: DEVICE, snapshot: SNAPSHOT })).json().guardada).toBe(true);
    expect((await llamar(app, 'POST', '/memoria/salud', { device_id: DEVICE, snapshot: { cpu: 500 } })).statusCode).toBe(400);
  });

  it('/health dice si la memoria está conectada', async () => {
    expect((await (await appConMemoria()).app.inject({ url: '/health' })).json().memoria).toBe(true);
    expect((await (await appConMemoria({ memoriaActiva: false })).app.inject({ url: '/health' })).json().memoria).toBe(false);
  });

  it('/recuerdos y DELETE /memoria rechazan un device_id inválido', async () => {
    const { app } = await appConMemoria();
    expect((await llamar(app, 'POST', '/recuerdos', { device_id: 'nope', clave: 'x', valor: 'y' })).statusCode).toBe(400);
    expect((await llamar(app, 'DELETE', '/memoria?device_id=nope')).statusCode).toBe(400);
  });
});
