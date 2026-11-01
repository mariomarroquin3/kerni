import { describe, expect, it, afterAll } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearMotorGuias, AYUDA_NO_PUDE, TEXTO_SALIDA, TEXTO_TERMINADA } from '../src/guias/motor.js';
import { GUIAS, buscarGuia } from '../src/guias/guias.js';
import { createSqliteMemoria } from '../src/memoria/sqlite.js';
import { createMemoriaNula } from '../src/memoria/memoria.js';
import { buildApp } from '../src/app.js';
import { createLimitador } from '../src/guardrails/limitador.js';

const DEVICE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const callado = { error() {}, warn() {} };

const tmpDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp-test-motor');
mkdirSync(tmpDir, { recursive: true });
const abiertas = [];
let n = 0;
function dirAislado() {
  const dir = join(tmpDir, `motor-${++n}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
afterAll(() => {
  for (const m of abiertas) m.cerrar();
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Memoria en memoria (un Map) con espías: el motor solo debe tocar estos métodos. */
function memoriaFalsa() {
  const filas = new Map();
  const llamadas = [];
  const m = {
    habilitada: true,
    llamadas,
    filas,
    async guiaActual(id) { llamadas.push('guiaActual'); return filas.get(id) ?? null; },
    async iniciarGuia(id, guia_id) { llamadas.push('iniciarGuia'); filas.set(id, { guia_id, paso: 0, iniciada: 'x', actualizada: 'x' }); return true; },
    async avanzarGuia(id, paso) { llamadas.push('avanzarGuia'); filas.set(id, { ...filas.get(id), paso }); return true; },
    async borrarGuia(id) { llamadas.push('borrarGuia'); filas.delete(id); return true; },
  };
  return m;
}

/** Textos de los pasos de una guía, en orden: el motor no puede devolver nada que no esté aquí. */
const textosDe = (id) => buscarGuia(id).pasos.map((p) => p.texto);

describe('motor de guías: avanzar, repetir, salir', () => {
  it('iniciar devuelve la introducción y solo el primer paso', async () => {
    const motor = crearMotorGuias({ memoria: memoriaFalsa() });
    const r = await motor.iniciar(DEVICE, 'pc-lenta');
    expect(r.ok).toBe(true);
    expect(r.guia).toEqual({ id: 'pc-lenta', titulo: 'PC lenta', paso: 1, total: 4 });
    expect(r.texto).toBe(textosDe('pc-lenta')[0]);
    expect(r.intro).toBe(buscarGuia('pc-lenta').intro);
    expect(r.respuesta).toContain('Paso 1 de 4: ');
    // Solo un paso por turno: el de después no aparece.
    expect(r.respuesta).not.toContain(textosDe('pc-lenta')[1]);
  });

  it('listo avanza al paso siguiente y un paso de acción trae su propuesta', async () => {
    const memoria = memoriaFalsa();
    const motor = crearMotorGuias({ memoria });
    await motor.iniciar(DEVICE, 'pc-lenta');
    const r = await motor.siguiente(DEVICE, 'listo');
    expect(r.ok).toBe(true);
    expect(r.guia.paso).toBe(2);
    expect(r.texto).toBe(textosDe('pc-lenta')[1]);
    expect(r.tipo).toBe('accion');
    expect(r.propuesta).toEqual({ tipo: 'proponer_accion', accion: 'ver_programas_inicio', motivo: 'Ver qué programas se abren solos al iniciar Windows.' });
    expect(memoria.filas.get(DEVICE).paso).toBe(1);
  });

  it('no_pude se queda en el mismo paso y ofrece la ayuda', async () => {
    const memoria = memoriaFalsa();
    const motor = crearMotorGuias({ memoria });
    await motor.iniciar(DEVICE, 'impresora-fuera-de-linea');
    await motor.siguiente(DEVICE, 'listo');
    const antes = memoria.filas.get(DEVICE).paso;
    const desde = memoria.llamadas.length;
    const r = await motor.siguiente(DEVICE, 'no_pude');
    expect(r.ok).toBe(true);
    expect(r.guia.paso).toBe(2);
    expect(r.respuesta.startsWith(AYUDA_NO_PUDE)).toBe(true);
    expect(r.respuesta).toContain('Paso 2 de 5: ');
    expect(memoria.filas.get(DEVICE).paso).toBe(antes);
    expect(memoria.llamadas.slice(desde)).toEqual(['guiaActual']);
  });

  it('salir cierra la guía y después no hay nada que responder', async () => {
    const memoria = memoriaFalsa();
    const motor = crearMotorGuias({ memoria });
    await motor.iniciar(DEVICE, 'espacio-en-disco');
    const r = await motor.siguiente(DEVICE, 'salir');
    expect(r).toMatchObject({ ok: true, cerrada: true, guia: null, respuesta: TEXTO_SALIDA });
    expect(memoria.filas.has(DEVICE)).toBe(false);
    expect(await motor.siguiente(DEVICE, 'listo')).toEqual({ ok: false, codigo: 'sin_guia' });
  });

  it('listo en el último paso termina la guía y la borra', async () => {
    const memoria = memoriaFalsa();
    const motor = crearMotorGuias({ memoria });
    await motor.iniciar(DEVICE, 'actualizaciones-pendientes');
    let r;
    for (let i = 0; i < 3; i++) r = await motor.siguiente(DEVICE, 'listo');
    expect(r.guia.paso).toBe(4);
    r = await motor.siguiente(DEVICE, 'listo');
    expect(r).toMatchObject({ ok: true, terminada: true, guia: null, respuesta: TEXTO_TERMINADA });
    expect(memoria.filas.has(DEVICE)).toBe(false);
  });

  it('recorrer cada guía entera devuelve cada texto en orden, uno por turno', async () => {
    for (const g of GUIAS) {
      const motor = crearMotorGuias({ memoria: memoriaFalsa() });
      let r = await motor.iniciar(DEVICE, g.id);
      const vistos = [r.texto];
      for (let i = 1; i < g.pasos.length; i++) {
        r = await motor.siguiente(DEVICE, 'listo');
        vistos.push(r.texto);
      }
      expect(vistos).toEqual(textosDe(g.id));
      expect((await motor.siguiente(DEVICE, 'listo')).terminada).toBe(true);
    }
  });

  it('un id de guía que no existe se rechaza y no guarda nada', async () => {
    const memoria = memoriaFalsa();
    const motor = crearMotorGuias({ memoria });
    expect(await motor.iniciar(DEVICE, 'no-existe')).toEqual({ ok: false, codigo: 'guia_desconocida' });
    expect(await motor.iniciar(DEVICE, '__proto__')).toEqual({ ok: false, codigo: 'guia_desconocida' });
    expect(memoria.llamadas).toEqual([]);
  });

  it('una respuesta fuera de la lista cerrada se rechaza', async () => {
    const motor = crearMotorGuias({ memoria: memoriaFalsa() });
    await motor.iniciar(DEVICE, 'pc-lenta');
    expect(await motor.siguiente(DEVICE, 'borrar todo')).toEqual({ ok: false, codigo: 'respuesta_desconocida' });
  });

  it('una fila guardada con un paso fuera de rango no se usa: se borra', async () => {
    const memoria = memoriaFalsa();
    memoria.filas.set(DEVICE, { guia_id: 'pc-lenta', paso: 99, iniciada: 'x', actualizada: 'x' });
    const motor = crearMotorGuias({ memoria });
    expect(await motor.activa(DEVICE)).toBeNull();
    expect(memoria.filas.has(DEVICE)).toBe(false);
  });

  it('activa devuelve el paso actual para el contexto, sin propuesta', async () => {
    const motor = crearMotorGuias({ memoria: memoriaFalsa() });
    await motor.iniciar(DEVICE, 'pc-lenta');
    await motor.siguiente(DEVICE, 'listo');
    expect(await motor.activa(DEVICE)).toEqual({ id: 'pc-lenta', titulo: 'PC lenta', paso: 2, total: 4, texto: textosDe('pc-lenta')[1] });
  });
});

describe('motor de guías: las acciones solo proponen', () => {
  it('un paso de acción devuelve una propuesta y no ejecuta nada (solo toca la memoria de la guía)', async () => {
    const memoria = memoriaFalsa();
    const llamadosAlValidar = [];
    const motor = crearMotorGuias({
      memoria,
      validarAccion: (input) => { llamadosAlValidar.push(input); return { ok: true, accion: { tipo: 'proponer_accion', ...input } }; },
    });
    // espacio-en-disco arranca con un paso de acción (abrir Almacenamiento): la propuesta sale al iniciar.
    const r = await motor.iniciar(DEVICE, 'espacio-en-disco');
    expect(r.propuesta).toEqual({ tipo: 'proponer_accion', accion: 'abrir_ajuste', destino: 'almacenamiento', motivo: 'Abrir Almacenamiento en la configuración de Windows.' });
    expect(llamadosAlValidar.at(-1)).toEqual({ accion: 'abrir_ajuste', destino: 'almacenamiento', motivo: 'Abrir Almacenamiento en la configuración de Windows.' });
    expect(Object.keys(r.propuesta).sort()).toEqual(['accion', 'destino', 'motivo', 'tipo']);
    // El paso siguiente es una instrucción: no trae propuesta.
    const instruccion = await motor.siguiente(DEVICE, 'listo');
    expect(instruccion.tipo).toBe('instruccion');
    expect(instruccion.propuesta).toBeUndefined();
    expect(memoria.llamadas.every((c) => ['guiaActual', 'iniciarGuia', 'avanzarGuia', 'borrarGuia'].includes(c))).toBe(true);
  });

  it('si la validación rechaza la propuesta, el paso sale sin tarjeta y sin romper', async () => {
    const motor = crearMotorGuias({ memoria: memoriaFalsa(), validarAccion: () => ({ ok: false, error: 'no' }) });
    const r = await motor.iniciar(DEVICE, 'actualizaciones-pendientes');
    expect(r.ok).toBe(true);
    expect(r.propuesta).toBeUndefined();
    expect(r.texto).toBe(textosDe('actualizaciones-pendientes')[0]);
  });

  it('la validación real rechaza una acción que no está en la lista cerrada, así que no llega a la tarjeta', async () => {
    const motor = crearMotorGuias({
      memoria: memoriaFalsa(),
      guias: [{ id: 'falsa', titulo: 'Falsa', intro: 'Intro de prueba para la guía falsa.', pasos: [
        { texto: 'Paso de prueba con una acción que no existe.', tipo: 'accion', motivo: 'Motivo de prueba.', propuesta: { accion: 'borrar_todo' } },
        { texto: 'Paso de cierre de la guía falsa de prueba.', tipo: 'instruccion' },
      ] }],
    });
    const r = await motor.iniciar(DEVICE, 'falsa');
    expect(r.ok).toBe(true);
    expect(r.propuesta).toBeUndefined();
  });
});

describe('motor de guías: los textos son fijos', () => {
  it('ninguna respuesta trae texto que no sea de la guía o de una frase fija', async () => {
    const fijos = [AYUDA_NO_PUDE, TEXTO_SALIDA, TEXTO_TERMINADA];
    for (const g of GUIAS) {
      const motor = crearMotorGuias({ memoria: memoriaFalsa() });
      const r0 = await motor.iniciar(DEVICE, g.id);
      const respuestas = [r0.respuesta];
      for (let i = 0; i < g.pasos.length; i++) {
        respuestas.push((await motor.siguiente(DEVICE, 'no_pude')).respuesta);
        respuestas.push((await motor.siguiente(DEVICE, 'listo')).respuesta);
      }
      for (const texto of respuestas) {
        const sinFijos = fijos.reduce((t, f) => t.replace(f, ''), texto);
        const sinPasos = textosDe(g.id).reduce((t, s) => t.replace(s, ''), sinFijos);
        const limpio = sinPasos.replace(/Paso \d+ de \d+:/g, '').replace(g.intro, '').replace(/\s+/g, ' ').trim();
        expect(limpio).toBe('');
      }
    }
  });
});

describe('rutas de guías (con memoria real)', () => {
  const DEV = '1b4e28ba-2fa3-4d2a-9f3c-5e6f7a8b9c0d';

  function appCon(memoria, limitadorGuias) {
    return buildApp({ config: {}, agent: null, provider: null, memoria, ...(limitadorGuias ? { limitadorGuias } : {}) });
  }
  function memoriaReal() {
    const m = createSqliteMemoria({ dataDir: dirAislado(), supabase: null, logger: callado });
    abiertas.push(m);
    return m;
  }

  it('iniciar con un device_id malo, una guía desconocida o sin memoria se rechaza', async () => {
    const app = appCon(memoriaReal());
    expect((await app.inject({ method: 'POST', url: '/guias/iniciar', payload: { device_id: 'nope', guia_id: 'pc-lenta' } })).statusCode).toBe(400);
    const desconocida = await app.inject({ method: 'POST', url: '/guias/iniciar', payload: { device_id: DEV, guia_id: 'x' } });
    expect(desconocida.statusCode).toBe(400);
    expect(desconocida.json().error).toMatch(/pc-lenta/);
    const sinMem = appCon(createMemoriaNula());
    const r = await sinMem.inject({ method: 'POST', url: '/guias/iniciar', payload: { device_id: DEV, guia_id: 'pc-lenta' } });
    expect(r.statusCode).toBe(503);
    expect(r.json().codigo).toBe('sin_memoria');
  });

  it('iniciar y responder siguen el avance guardado, y la respuesta no trae datos internos', async () => {
    const app = appCon(memoriaReal());
    const ini = await app.inject({ method: 'POST', url: '/guias/iniciar', payload: { device_id: DEV, guia_id: 'pc-lenta' } });
    expect(ini.statusCode).toBe(200);
    const cuerpo = ini.json();
    expect(Object.keys(cuerpo).sort()).toEqual(['guia', 'intro', 'ok', 'respuesta', 'texto', 'tipo'].sort());
    expect(cuerpo.guia).toEqual({ id: 'pc-lenta', titulo: 'PC lenta', paso: 1, total: 4 });

    const listo = await app.inject({ method: 'POST', url: '/guias/responder', payload: { device_id: DEV, respuesta: 'listo' } });
    expect(listo.json().guia.paso).toBe(2);
    expect(listo.json().propuesta).toMatchObject({ accion: 'ver_programas_inicio' });

    const salir = await app.inject({ method: 'POST', url: '/guias/responder', payload: { device_id: DEV, respuesta: 'salir' } });
    expect(salir.json()).toMatchObject({ ok: true, cerrada: true, guia: null });
  });

  it('responder sin guía en curso da 409, y una respuesta desconocida da 400', async () => {
    const app = appCon(memoriaReal());
    expect((await app.inject({ method: 'POST', url: '/guias/responder', payload: { device_id: DEV, respuesta: 'listo' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/guias/responder', payload: { device_id: DEV, respuesta: 'ya' } })).statusCode).toBe(400);
  });

  it('el límite de pedidos responde 429', async () => {
    const app = appCon(memoriaReal(), createLimitador({ max: 1 }));
    await app.inject({ method: 'POST', url: '/guias/responder', payload: { device_id: DEV, respuesta: 'listo' } });
    expect((await app.inject({ method: 'POST', url: '/guias/responder', payload: { device_id: DEV, respuesta: 'listo' } })).statusCode).toBe(429);
  });
});
