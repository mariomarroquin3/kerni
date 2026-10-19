import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createAgent } from '../src/agent/agent.js';
import { crearProveedor } from '../src/llm/proveedores.js';
import { buildApp } from '../src/app.js';
import { SNAPSHOT } from './helpers.js';

// Un servidor HTTP de verdad que imita a Gemini / OpenRouter: así se prueba la red real
// (cabeceras, cuerpo JSON, códigos de error) sin gastar una llave.
let servidor;
afterEach(() => new Promise((r) => (servidor ? servidor.close(r) : r())));

function imitar(manejador) {
  const visto = [];
  return new Promise((resolve) => {
    servidor = createServer((req, res) => {
      let cuerpo = '';
      req.on('data', (c) => { cuerpo += c; });
      req.on('end', () => {
        const pedido = { url: req.url, auth: req.headers.authorization, titulo: req.headers['x-title'], body: JSON.parse(cuerpo || '{}') };
        visto.push(pedido);
        const [status, json, headers] = manejador(pedido, visto.length);
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(json));
      });
    }).listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${servidor.address().port}/v1/chat/completions`, visto }));
  });
}

const texto = (t) => [200, { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: t } }] }];
const tool = (args) => [200, { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: '', type: 'function', function: { name: 'proponer_accion', arguments: JSON.stringify(args) } }] } }] }];

async function turno(env, mensaje = 'está lenta', snapshot = SNAPSHOT) {
  const { provider } = crearProveedor(loadConfig(env));
  const app = buildApp({ config: {}, agent: createAgent({ provider, logger: { error() {} } }), provider });
  return app.inject({ method: 'POST', url: '/chat', payload: { mensaje, snapshot } });
}

describe('proveedores contra un servidor HTTP real (imitación)', () => {
  it('Gemini: un turno completo con tool calling sin id, por la red', async () => {
    const { url, visto } = await imitar((_, n) => (n === 1 ? tool({ accion: 'terminar_proceso', pid: 5555, nombre: 'miner.exe', motivo: 'Usa 30% de CPU' }) : texto('Te propongo cerrar miner.exe.')));
    const res = await turno({ GEMINI_API_KEY: 'g-real', GEMINI_BASE_URL: url });
    expect(res.statusCode).toBe(200);
    expect(res.json().acciones).toEqual([{ tipo: 'proponer_accion', accion: 'terminar_proceso', pid: 5555, nombre: 'miner.exe', motivo: 'Usa 30% de CPU' }]);
    expect(visto).toHaveLength(2);
    expect(visto[0].auth).toBe('Bearer g-real');
    expect(visto[0].body.messages[0].content).toContain('<sistema>');
    // el segundo pedido devuelve el resultado de la tool con el id que se inventó para la llamada
    const [asistente, resultado] = visto[1].body.messages.slice(-2);
    expect(asistente.tool_calls[0].id).toMatch(/^call_\d+$/);
    expect(resultado).toMatchObject({ role: 'tool', tool_call_id: asistente.tool_calls[0].id, name: 'proponer_accion' });
  });

  it('OpenRouter: manda X-Title y el modelo configurado', async () => {
    const { url, visto } = await imitar(() => texto('Todo bien por aquí.'));
    const res = await turno({ OPENROUTER_API_KEY: 'or-real', OPENROUTER_BASE_URL: url, OPENROUTER_MODEL: 'google/gemini-3.5-flash-lite' }, 'hola', undefined);
    expect(res.json().respuesta).toBe('Todo bien por aquí.');
    expect(visto[0]).toMatchObject({ auth: 'Bearer or-real', titulo: 'Kerni' });
    expect(visto[0].body.model).toBe('google/gemini-3.5-flash-lite');
  });

  it('una llave rechazada (401) le llega a la persona con el mensaje claro y 503', async () => {
    const { url } = await imitar(() => [401, { error: { message: 'API key not valid. Please pass a valid API key.' } }]);
    const res = await turno({ GEMINI_API_KEY: 'mala', GEMINI_BASE_URL: url });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toContain('GEMINI_API_KEY');
  });

  it('un 429 por minuto con retry-after se reintenta por la red y el turno sale bien', async () => {
    const { url, visto } = await imitar((_, n) => (n === 1 ? [429, [{ error: { code: 429, message: 'Resource exhausted' } }], { 'retry-after': '0' }] : texto('Ya.')));
    const res = await turno({ GEMINI_API_KEY: 'g', GEMINI_BASE_URL: url }, 'hola', undefined);
    expect(res.statusCode).toBe(200);
    expect(res.json().respuesta).toBe('Ya.');
    expect(visto).toHaveLength(2);
  });
});
