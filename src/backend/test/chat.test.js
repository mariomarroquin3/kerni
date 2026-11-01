import { MOTIVOS_FIJOS } from '../src/acciones.js';
import { describe, expect, it } from 'vitest';
import { createTestApp, fakeAnthropic, SNAPSHOT, texto, usarTool } from './helpers.js';
import { createAnthropicProvider } from '../src/llm/anthropic.js';

const post = (app, body) => app.inject({ method: 'POST', url: '/chat', payload: body });

describe('POST /chat', () => {
  it('responde con texto y manda la foto del sistema al modelo', async () => {
    const { app, anthropic } = createTestApp({ respuestas: [texto('Tu compu anda apretada, Chrome usa mucha CPU.')] });
    const res = await post(app, { mensaje: '¿cómo va mi compu?', snapshot: SNAPSHOT });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.respuesta).toMatch(/Chrome/);
    expect(body.acciones).toEqual([]);
    const sistema = anthropic.messages.create.llamadas[0].system.map((s) => s.text).join('\n');
    expect(sistema).toContain('<sistema>');
    expect(sistema).toContain('miner.exe');
  });

  it('devuelve como acción la propuesta válida del modelo, sin ejecutarla', async () => {
    const { app } = createTestApp({
      respuestas: [
        usarTool('proponer_accion', { accion: 'terminar_proceso', pid: 5555, nombre: 'miner.exe', motivo: 'Usa 30% de CPU y no lo reconozco' }),
        texto('Te propongo cerrar miner.exe. Vos decidís.'),
      ],
    });
    const body = (await post(app, { mensaje: 'está lenta', snapshot: SNAPSHOT })).json();
    expect(body.acciones).toEqual([
      { tipo: 'proponer_accion', accion: 'terminar_proceso', pid: 5555, nombre: 'miner.exe', motivo: MOTIVOS_FIJOS.terminar_proceso },
    ]);
    expect(body.respuesta).toMatch(/miner/);
  });

  it('descarta la propuesta de cerrar un proceso protegido y se lo dice al modelo', async () => {
    const { app, anthropic } = createTestApp({
      respuestas: [
        usarTool('proponer_accion', { accion: 'terminar_proceso', pid: 900, nombre: 'svchost.exe', motivo: 'Consume CPU' }),
        texto('Ese es de Windows, mejor no lo toquemos.'),
      ],
    });
    const body = (await post(app, { mensaje: 'cerrá todo', snapshot: SNAPSHOT })).json();
    expect(body.acciones).toEqual([]);
    const segundoPedido = anthropic.messages.create.llamadas[1].messages.at(-1);
    expect(segundoPedido.content[0].is_error).toBe(true);
    expect(segundoPedido.content[0].content).toMatch(/protegido/);
  });

  it('sin foto avisa al modelo que no invente números', async () => {
    const { app, anthropic } = createTestApp({ respuestas: [texto('No veo tu sistema ahora.')] });
    await post(app, { mensaje: 'hola' });
    const sistema = anthropic.messages.create.llamadas[0].system.map((s) => s.text).join('\n');
    expect(sistema).toMatch(/no inventes números/);
  });

  it('sin proveedor usa una acción local conocida o marca el fallback automático', async () => {
    const { app, anthropic } = createTestApp({ sinProveedor: true });
    const accion = await post(app, { mensaje: 'qué dispositivos están conectados a la red' });
    expect(accion.statusCode).toBe(200);
    expect(accion.json().acciones).toEqual([
      { tipo: 'proponer_accion', accion: 'ver_dispositivos_red', motivo: expect.any(String) },
    ]);
    expect(anthropic.messages.create.llamadas).toHaveLength(0);

    const sinRespuestaFija = await post(app, { mensaje: 'contame algo que no tenga respuesta automática' });
    expect(sinRespuestaFija.statusCode).toBe(503);
    expect(sinRespuestaFija.json()).toMatchObject({ fallbackLocal: true });
  });

  it('rechaza mensajes vacíos o muy largos y fotos inválidas', async () => {
    const { app } = createTestApp();
    expect((await post(app, { mensaje: '  ' })).statusCode).toBe(400);
    expect((await post(app, { mensaje: 'a'.repeat(1001) })).statusCode).toBe(400);
    expect((await post(app, { mensaje: 'hola', snapshot: { cpu: 500 } })).statusCode).toBe(400);
  });

  it('mantiene el historial dentro de la sesión', async () => {
    const { app, anthropic } = createTestApp({ respuestas: [texto('Hola'), texto('Seguimos')] });
    const primero = (await post(app, { mensaje: 'hola' })).json();
    await post(app, { mensaje: 'y ahora', session_id: primero.session_id });
    const mensajes = anthropic.messages.create.llamadas[1].messages;
    expect(mensajes.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('limita los turnos por minuto', async () => {
    const { app } = createTestApp({ respuestas: Array.from({ length: 25 }, () => texto('ok')) });
    let ultimo;
    for (let i = 0; i < 21; i++) ultimo = await post(app, { mensaje: `m${i}` });
    expect(ultimo.statusCode).toBe(429);
  });

  it('si el modelo falla, responde 502 y deja la sesión usable', async () => {
    const { app } = createTestApp({ respuestas: [] }); // el guion vacío lanza error
    const res = await post(app, { mensaje: 'hola' });
    expect(res.statusCode).toBe(502);
  });

  it('emite eventos SSE si el cliente pide text/event-stream', async () => {
    const { app } = createTestApp({ respuestas: [texto('Hola amigo de Kerni')] });
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { accept: 'text/event-stream' },
      payload: { mensaje: 'hola' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.payload).toContain('event: delta');
    expect(res.payload).toContain('event: done');
    expect(res.payload).toContain('Hola amigo de Kerni');
  });

  it('emite evento done en SSE en respuestas de respaldo sin proveedor', async () => {
    const { app } = createTestApp({ sinProveedor: true });
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { accept: 'text/event-stream' },
      payload: { mensaje: 'qué dispositivos están conectados a la red' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.payload).toContain('event: done');
    expect(res.payload).toContain('ver_dispositivos_red');
  });
});

describe('POST /chat: codigo estable en los errores', () => {
  /** Un proveedor cuyo step lanza el error indicado (como lo hace llm/anthropic.js o chatCompletions.js). */
  function conError(err) {
    const provider = createAnthropicProvider({ anthropic: fakeAnthropic([]) });
    provider.step = async () => { throw err; };
    return createTestApp({ provider }).app;
  }

  it('sin llave configurada: codigo sin_llave, con error y fallbackLocal', async () => {
    const { app } = createTestApp({ sinProveedor: true });
    const res = await post(app, { mensaje: 'contame algo que no tenga respuesta automática' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ codigo: 'sin_llave', fallbackLocal: true });
    expect(res.json().error).toMatch(/llave de modelo/);
  });

  it('llave inválida: codigo llave_invalida, 503 y el mensaje claro sigue en error', async () => {
    const app = conError(Object.assign(new Error('La llave no es válida. Revisá el .env.'), { codigo: 'llave_invalida' }));
    const res = await post(app, { mensaje: 'hola' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ codigo: 'llave_invalida', error: 'La llave no es válida. Revisá el .env.' });
    expect(res.json().fallbackLocal).toBeUndefined();
  });

  it('cupo agotado: codigo sin_cupo con fallbackLocal', async () => {
    const app = conError(Object.assign(new Error('Se agotó el cupo.'), { codigo: 'sin_cupo' }));
    const res = await post(app, { mensaje: 'contame algo que no tenga respuesta automática' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ codigo: 'sin_cupo', fallbackLocal: true, error: 'Se agotó el cupo.' });
  });

  it('créditos agotados (402 sin codigo): también es sin_cupo', async () => {
    const app = conError(Object.assign(new Error('Sin créditos.'), { status: 402 }));
    const res = await post(app, { mensaje: 'contame algo que no tenga respuesta automática' });
    expect(res.json()).toMatchObject({ codigo: 'sin_cupo', fallbackLocal: true });
  });

  it('sin red: codigo sin_red, sin fallbackLocal', async () => {
    const app = conError(Object.assign(new Error('Sin red.'), { codigo: 'sin_red' }));
    const res = await post(app, { mensaje: 'hola' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ codigo: 'sin_red', error: 'Sin red.' });
    expect(res.json().fallbackLocal).toBeUndefined();
  });

  it('cualquier otro fallo: 502, codigo fallo y sin detalles internos', async () => {
    const app = conError(new Error('stack interno'));
    const res = await post(app, { mensaje: 'hola' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ codigo: 'fallo' });
    expect(res.json().error).not.toMatch(/stack interno/);
  });
});

describe('POST /chat: inicioActivos en la foto', () => {
  it('acepta la foto sin el campo (clientes anteriores) y con él', async () => {
    const { app } = createTestApp({ respuestas: [texto('ok'), texto('ok')] });
    expect((await post(app, { mensaje: 'hola', snapshot: SNAPSHOT })).statusCode).toBe(200);
    expect((await post(app, { mensaje: 'hola', snapshot: { ...SNAPSHOT, inicioActivos: 17 } })).statusCode).toBe(200);
  });

  it('rechaza un conteo que no es un entero no negativo, sin dejar pasar la foto', async () => {
    const { app } = createTestApp();
    for (const inicioActivos of [-1, 2.5, '17', 999999]) {
      const res = await post(app, { mensaje: 'hola', snapshot: { ...SNAPSHOT, inicioActivos } });
      expect(res.statusCode, String(inicioActivos)).toBe(400);
    }
  });
});
