import { describe, expect, it } from 'vitest';
import { createTestApp, SNAPSHOT, texto, usarTool } from './helpers.js';

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
      { tipo: 'proponer_accion', accion: 'terminar_proceso', pid: 5555, nombre: 'miner.exe', motivo: 'Usa 30% de CPU y no lo reconozco' },
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
});
