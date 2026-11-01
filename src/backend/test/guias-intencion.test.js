import { describe, expect, it } from 'vitest';
import { detectarGuia, detectarAccion } from '../src/intenciones.js';
import { comandoDeGuia, lineaDePaso } from '../src/guias/motor.js';

describe('pedidos de guía desde el chat', () => {
  it('un pedido explícito arranca la guía que corresponde', () => {
    expect(detectarGuia('guíame con la PC lenta')).toBe('pc-lenta');
    expect(detectarGuia('Guiame, mi compu va lenta')).toBe('pc-lenta');
    expect(detectarGuia('ayúdame paso a paso con la impresora')).toBe('impresora-fuera-de-linea');
    expect(detectarGuia('paso a paso para ver las actualizaciones de Windows')).toBe('actualizaciones-pendientes');
    expect(detectarGuia('guíame para liberar espacio en el disco')).toBe('espacio-en-disco');
  });

  it('sin pedir guía, la lentitud sigue siendo el diagnóstico de siempre (no arranca nada)', () => {
    expect(detectarGuia('mi pc va lenta')).toBeNull();
    expect(detectarGuia('¿por qué mi pc va lenta?')).toBeNull();
    expect(detectarGuia('la impresora no imprime')).toBeNull();
    expect(detectarGuia('cómo libero espacio en el disco')).toBeNull();
  });

  it('una pregunta sobre el arranque no arranca la guía de lentitud', () => {
    expect(detectarGuia('guíame, la pc tarda en prender')).toBeNull();
  });

  it('una negación no arranca la guía', () => {
    expect(detectarGuia('no quiero una guía con la impresora')).toBeNull();
    expect(detectarGuia('mejor no me guíes con la pc lenta')).toBeNull();
  });

  it('un pedido de guía sin tema conocido no arranca nada', () => {
    expect(detectarGuia('guíame con mi correo')).toBeNull();
    expect(detectarGuia('paso a paso para hacer una torta')).toBeNull();
  });

  it('un mensaje largo no es un pedido corto de guía', () => {
    const largo = `guíame con la impresora ${'y la red de la oficina '.repeat(12)}`;
    expect(detectarGuia(largo)).toBeNull();
  });

  it('las guías no cambian lo que detecta el resto de las reglas', () => {
    expect(detectarAccion('vaciá la papelera')?.accion).toBe('vaciar_papelera');
    expect(detectarAccion('guíame con la PC lenta')).toBeNull();
  });
});

describe('comandos mientras hay una guía', () => {
  it('listo, no pude y salir se reconocen con o sin tildes y signos', () => {
    expect(comandoDeGuia('listo')).toBe('listo');
    expect(comandoDeGuia('¡Listo!')).toBe('listo');
    expect(comandoDeGuia('No pude.')).toBe('no_pude');
    expect(comandoDeGuia('salir')).toBe('salir');
  });

  it('cualquier otro mensaje no es un comando', () => {
    expect(comandoDeGuia('listo, ¿y ahora qué?')).toBeNull();
    expect(comandoDeGuia('no puedo')).toBeNull();
    expect(comandoDeGuia('')).toBeNull();
    expect(comandoDeGuia(undefined)).toBeNull();
  });

  it('la línea de paso tiene el formato que ve la persona', () => {
    expect(lineaDePaso({ paso: 2, total: 4, texto: 'Hacé algo.' })).toBe('Paso 2 de 4: Hacé algo.');
  });
});
