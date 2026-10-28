import { describe, expect, it } from 'vitest';
import { pideArchivosPesados } from '../src/intenciones.js';
import { createTestApp, texto, usarTool, SNAPSHOT } from './helpers.js';

const chat = (app, mensaje, extra = {}) => app.inject({ method: 'POST', url: '/chat', payload: { mensaje, ...extra } });

describe('pedidos de archivos pesados o viejos', () => {
  it('reconoce los pedidos de ver o borrar cosas viejas, pesadas o sin uso', () => {
    for (const q of [
      'Estoy sin espacio, buscame los archivos viejos que ya no uso y que pueda borrar',
      'Podés revisar mis descargas y decirme qué cosas pesadas ya no uso?',
      'qué carpetas puedo borrar',
      'cuáles archivos pesados tengo',
      'mostrame las carpetas grandes',
      'qué ocupa más espacio',
      'cosas sin usar',
      'cuál puedo eliminar sin problema de mis archivos viejos',
    ]) expect(pideArchivosPesados(q), q).toBe(true);
  });

  it('no se activa con saludos, otros temas, explicaciones ni mensajes larguísimos', () => {
    for (const q of [
      'hola cómo estás',
      'cuánta RAM tengo',
      'cerrá chrome',
      'explicame por qué mis archivos pesados siguen creciendo tanto',
      'cómo comprimir archivos grandes en word',
      '',
    ]) expect(pideArchivosPesados(q), q).toBe(false);
    expect(pideArchivosPesados(`archivos viejos ${'palabra '.repeat(40)}`)).toBe(false);
  });

  it('una explicación que además pregunta qué puede borrar sí cuenta', () => {
    expect(pideArchivosPesados('explicame qué archivos viejos puedo borrar')).toBe(true);
  });
});

describe('el chat propone la búsqueda aunque el modelo solo la comente', () => {
  it('añade la propuesta de solo lectura cuando el modelo no llamó a la herramienta', async () => {
    const { app } = createTestApp({ respuestas: [texto('Te propongo revisar los archivos pesados que no usás.')] });
    const r = (await chat(app, 'qué carpetas o archivos viejos puedo borrar')).json();
    expect(r.acciones).toEqual([{ tipo: 'proponer_accion', accion: 'ver_archivos_pesados', motivo: expect.any(String) }]);
    expect(r.traza.some((t) => t.tipo === 'regla' && t.nombre === 'ver_archivos_pesados')).toBe(true);
  });

  it('si el modelo ya la propuso no se duplica', async () => {
    const { app } = createTestApp({
      respuestas: [usarTool('proponer_accion', { accion: 'ver_archivos_pesados', motivo: 'Ver qué ocupa espacio.' }), texto('Mirá la tarjeta.')],
    });
    const r = (await chat(app, 'archivos pesados que ya no uso')).json();
    expect(r.acciones.filter((a) => a.accion === 'ver_archivos_pesados')).toHaveLength(1);
    expect(r.traza.some((t) => t.tipo === 'regla')).toBe(false);
  });

  it('si el modelo propuso otra cosa (cerrar un proceso) no se mete otra encima', async () => {
    const { app } = createTestApp({
      respuestas: [usarTool('proponer_accion', { accion: 'terminar_proceso', pid: 5555, nombre: 'miner.exe', motivo: 'Consume mucho.' }), texto('Mirá la tarjeta.')],
    });
    const r = (await chat(app, 'qué archivos viejos puedo borrar y qué hace miner', { snapshot: SNAPSHOT })).json();
    expect(r.acciones.map((a) => a.accion)).toEqual(['terminar_proceso']);
  });

  it('en una charla normal no aparece ninguna propuesta', async () => {
    const { app } = createTestApp({ respuestas: [texto('Todo bien por acá.')] });
    expect((await chat(app, 'hola, cómo andás')).json().acciones).toEqual([]);
  });
});
