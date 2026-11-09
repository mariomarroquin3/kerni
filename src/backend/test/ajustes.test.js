import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearAjustes, llaveValida, vistaPublica } from '../src/ajustes.js';
import { crearProveedorDinamico } from '../src/llm/dinamico.js';
import { buildApp } from '../src/app.js';
import { createAgent } from '../src/agent/agent.js';
import { loadConfig } from '../src/config.js';

const LLAVE = 'AIzaSyFAKE-llave-de-prueba-0123456789';
const dir = () => mkdtempSync(join(tmpdir(), 'kerni-ajustes-'));

/** fetch falso con forma de Chat Completions (Gemini/OpenRouter). */
function fetchFalso({ status = 200, cuerpo, llamadas = [] } = {}) {
  const f = async (url, init) => {
    llamadas.push({ url, init });
    const json = cuerpo ?? { choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] };
    return { ok: status < 300, status, headers: { get: () => null }, json: async () => json };
  };
  f.llamadas = llamadas;
  return f;
}

describe('almacén de ajustes', () => {
  it('valida el formato de la llave', () => {
    expect(llaveValida(LLAVE)).toBe(true);
    expect(llaveValida('corta')).toBe(false);
    expect(llaveValida(`${LLAVE} otra`)).toBe(false);
    expect(llaveValida(`${LLAVE}\n`)).toBe(true); // el espacio de los bordes se recorta
    expect(llaveValida(undefined)).toBe(false);
  });

  it('guarda la elección en un archivo solo del usuario y la lee de vuelta', () => {
    const dataDir = dir();
    const a = crearAjustes({ dataDir });
    a.elegir({ proveedor: 'gemini', apiKey: LLAVE, modelo: 'gemini-3.6-flash' });
    const leido = crearAjustes({ dataDir }).leer();
    expect(leido).toMatchObject({ proveedor: 'gemini', bienvenidaVista: true, sinIA: false });
    expect(leido.claves.gemini).toBe(LLAVE);
    expect(leido.modelos.gemini).toBe('gemini-3.6-flash');
    if (process.platform !== 'win32') expect(statSync(join(dataDir, 'ajustes.json')).mode & 0o077).toBe(0);
  });

  it('cambiar de servicio sin pegar la llave de nuevo funciona si ya estaba guardada', () => {
    const a = crearAjustes({ dataDir: dir() });
    a.elegir({ proveedor: 'gemini', apiKey: LLAVE });
    a.elegir({ proveedor: 'openrouter', apiKey: 'sk-or-v1-0123456789abcdef0123' });
    expect(a.elegir({ proveedor: 'gemini' }).proveedor).toBe('gemini');
    expect(() => a.elegir({ proveedor: 'anthropic' })).toThrow(/llave/);
  });

  it('"sin IA" se recuerda, conserva las llaves y olvidar() lo borra todo', () => {
    const a = crearAjustes({ dataDir: dir() });
    a.elegir({ proveedor: 'gemini', apiKey: LLAVE });
    const s = a.sinIA();
    expect(s).toMatchObject({ proveedor: '', sinIA: true, bienvenidaVista: true });
    expect(a.leer().claves.gemini).toBe(LLAVE);
    expect(a.olvidar().bienvenidaVista).toBe(false);
    expect(a.leer().claves).toEqual({});
  });

  it('un archivo roto o con datos raros se ignora sin tirar el backend', () => {
    const dataDir = dir();
    const a = crearAjustes({ dataDir, logger: { error() {} } });
    writeFileSync(join(dataDir, 'ajustes.json'), '{no es json');
    expect(a.leer()).toMatchObject({ proveedor: '', bienvenidaVista: false, claves: {} });
    writeFileSync(join(dataDir, 'ajustes.json'), JSON.stringify({ proveedor: 'gemini', claves: { gemini: 'x' }, bienvenidaVista: true }));
    expect(a.leer().proveedor).toBe(''); // una llave inválida no deja un proveedor elegido
  });

  it('la vista pública nunca trae la llave', () => {
    const a = crearAjustes({ dataDir: dir() });
    a.elegir({ proveedor: 'gemini', apiKey: LLAVE });
    expect(JSON.stringify(vistaPublica(a.leer()))).not.toContain(LLAVE);
    expect(vistaPublica(a.leer()).conLlave).toEqual(['gemini']);
  });
});

describe('proveedor dinámico', () => {
  const falso = (name) => ({ name, model: `${name}-m`, userMessage: (t) => ({ role: 'user', content: t }), toolResultMessages: () => [], step: async () => ({ kind: 'final', text: name, calls: [] }) });

  it('delega al vigente, sube la versión al cambiar y sin IA lo dice', async () => {
    const p = crearProveedorDinamico(falso('a'));
    expect(p).toMatchObject({ activo: true, name: 'a', version: 0 });
    p.cambiar(falso('b'));
    expect((await p.step({})).text).toBe('b');
    expect(p.version).toBe(1);
    p.cambiar(null);
    expect(p.activo).toBe(false);
    await expect(p.step({})).rejects.toMatchObject({ codigo: 'sin_llave' });
  });
});

describe('rutas /ajustes', () => {
  function montar({ fetchImpl = fetchFalso(), dataDir = dir() } = {}) {
    const config = { ...loadConfig({}), port: undefined }; // sin puerto, como en las demás pruebas con inject
    const ajustes = crearAjustes({ dataDir, logger: { error() {} } });
    const proveedor = crearProveedorDinamico(null);
    const agent = createAgent({ provider: proveedor, logger: { error() {} } });
    const app = buildApp({ config, agent, provider: proveedor, ajustes, fabricaProveedor: { fetchImpl } });
    return { app, ajustes, proveedor, fetchImpl, dataDir };
  }
  const put = (app, payload) => app.inject({ method: 'PUT', url: '/ajustes', payload });

  it('al inicio no hay nada elegido y la bienvenida está pendiente', async () => {
    const { app } = montar();
    const r = (await app.inject({ method: 'GET', url: '/ajustes' })).json();
    expect(r).toMatchObject({ bienvenidaVista: false, sinIA: false, proveedor: '', conLlave: [] });
  });

  it('probar usa la llave contra el servicio elegido y no la guarda', async () => {
    const { app, ajustes, fetchImpl } = montar();
    const res = await app.inject({ method: 'POST', url: '/ajustes/probar', payload: { proveedor: 'gemini', apiKey: LLAVE } });
    expect(res.json()).toMatchObject({ ok: true });
    expect(fetchImpl.llamadas[0].url).toMatch(/generativelanguage/);
    expect(fetchImpl.llamadas[0].init.headers.Authorization).toBe(`Bearer ${LLAVE}`);
    expect(ajustes.leer().claves).toEqual({});
  });

  it('una llave rechazada se explica sin repetir la llave', async () => {
    const cuerpo = { error: { code: 401, message: `API key ${LLAVE} not valid` } };
    const { app } = montar({ fetchImpl: fetchFalso({ status: 401, cuerpo }) });
    const res = await app.inject({ method: 'POST', url: '/ajustes/probar', payload: { proveedor: 'gemini', apiKey: LLAVE } });
    const j = res.json();
    expect(j).toMatchObject({ ok: false, codigo: 'llave_invalida' });
    expect(res.body).not.toContain(LLAVE);
  });

  it('guardar cambia la IA al instante, se refleja en /health y ninguna respuesta trae la llave', async () => {
    const { app, proveedor, dataDir } = montar();
    const res = await put(app, { proveedor: 'gemini', apiKey: LLAVE });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(LLAVE);
    expect(res.json()).toMatchObject({ proveedor: 'gemini', origen: 'app', bienvenidaVista: true, conLlave: ['gemini'] });
    expect(proveedor.activo).toBe(true);
    const salud = (await app.inject({ method: 'GET', url: '/health' })).json();
    expect(salud).toMatchObject({ proveedor: 'gemini' });
    expect(JSON.parse(readFileSync(join(dataDir, 'ajustes.json'), 'utf8')).claves.gemini).toBe(LLAVE);
    expect((await app.inject({ method: 'GET', url: '/ajustes' })).body).not.toContain(LLAVE);
  });

  it('"seguir sin IA" apaga el modelo y /health no anuncia proveedor', async () => {
    const { app, proveedor } = montar();
    await put(app, { proveedor: 'gemini', apiKey: LLAVE });
    const r = await put(app, { sinIA: true });
    expect(r.json()).toMatchObject({ sinIA: true, proveedor: '', bienvenidaVista: true });
    expect(proveedor.activo).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/health' })).json().proveedor).toBeUndefined();
  });

  it('rechaza servicios desconocidos, llaves con pinta rara y falta de llave', async () => {
    const { app } = montar();
    expect((await put(app, { proveedor: 'otro', apiKey: LLAVE })).statusCode).toBe(400);
    expect((await put(app, { proveedor: 'gemini', apiKey: 'a b c d e f g h i j k l m n o p' })).statusCode).toBe(400);
    expect((await put(app, { proveedor: 'gemini' })).statusCode).toBe(400);
  });

  it('borrar olvida las llaves y apaga la IA', async () => {
    const { app, proveedor, ajustes } = montar();
    await put(app, { proveedor: 'openrouter', apiKey: LLAVE, modelo: 'google/gemini-2.5-flash' });
    expect((await app.inject({ method: 'DELETE', url: '/ajustes' })).json()).toMatchObject({ bienvenidaVista: false, conLlave: [] });
    expect(proveedor.activo).toBe(false);
    expect(ajustes.leer().claves).toEqual({});
  });

  it('el chat usa la IA recién elegida y una sesión de la IA anterior no se reutiliza', async () => {
    const f = fetchFalso({ cuerpo: { choices: [{ finish_reason: 'stop', message: { content: 'Hola desde Gemini' } }] } });
    const { app } = montar({ fetchImpl: f });
    // Sin IA todavía: el chat responde con el respaldo local o pide configurar (no rompe).
    const antes = await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: 'contame algo sin respuesta automática' } });
    expect(antes.json().codigo).toBe('sin_llave');
    await put(app, { proveedor: 'gemini', apiKey: LLAVE });
    const r1 = (await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: 'contame algo sin respuesta automática' } })).json();
    expect(r1.respuesta).toBe('Hola desde Gemini');
    await put(app, { proveedor: 'openrouter', apiKey: 'sk-or-v1-0123456789abcdef0123' });
    const r2 = (await app.inject({ method: 'POST', url: '/chat', payload: { mensaje: 'otra', session_id: r1.session_id } })).json();
    expect(r2.session_id).not.toBe(r1.session_id);
  });
});
