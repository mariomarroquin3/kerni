import { describe, expect, it } from 'vitest';
import { createMicrosoftLearn, crearDocsMicrosoft, validarPregunta, leerResultadoDocs, CACHE_MAX, MAX_RESULTADOS } from '../src/mcp/microsoft-learn.js';
import { createClienteMcp, ErrorMcp } from '../src/mcp/cliente.js';
import { loadConfig } from '../src/config.js';

const DOCS = { results: [{ title: 'Pausar actualizaciones', content: 'Podés pausar las actualizaciones de funciones hasta 35 días.', contentUrl: 'https://learn.microsoft.com/windows/update' }] };
const resultadoDocs = (datos = DOCS) => ({ content: [{ type: 'text', text: JSON.stringify(datos) }] });

/** Servidor MCP falso (flujo completo) que guarda cada pedido. */
function servidorFalso(resultado = resultadoDocs()) {
  const cuerpos = [];
  const fetch = async (url, opciones) => {
    const cuerpo = JSON.parse(opciones.body);
    cuerpos.push(cuerpo);
    if (cuerpo.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (cuerpo.method === 'initialize') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: cuerpo.id, result: { protocolVersion: '2025-06-18' } }), {
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'sesion-1' },
      });
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: cuerpo.id, result: resultado }), { headers: { 'content-type': 'application/json' } });
  };
  fetch.cuerpos = cuerpos;
  return fetch;
}

/** Cliente falso: cuenta las llamadas a la herramienta. */
function clienteFalso(respuesta = resultadoDocs()) {
  const llamadas = [];
  return {
    llamadas,
    llamarHerramienta: async (nombre, argumentos) => {
      llamadas.push({ nombre, argumentos });
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
  };
}

describe('validación de la pregunta', () => {
  it('acepta texto de 4 a 200 caracteres y lo recorta', () => {
    expect(validarPregunta('  Windows Update  ')).toEqual({ ok: true, consulta: 'Windows Update' });
    expect(validarPregunta('abcd')).toEqual({ ok: true, consulta: 'abcd' });
    expect(validarPregunta('a'.repeat(200)).ok).toBe(true);
  });

  it('rechaza lo corto, lo largo, lo que no es texto y lo que queda vacío al recortar', () => {
    expect(validarPregunta('abc').ok).toBe(false);
    expect(validarPregunta('   abc   ').ok).toBe(false);
    expect(validarPregunta('a'.repeat(201)).ok).toBe(false);
    expect(validarPregunta(12345).ok).toBe(false);
    expect(validarPregunta({ query: 'hola mundo' }).ok).toBe(false);
    expect(validarPregunta(null).ok).toBe(false);
  });
});

describe('lo que sale de la PC', () => {
  it('el cuerpo de la petición contiene solo el texto de la pregunta, nada del equipo ni de la memoria', async () => {
    const fetch = servidorFalso();
    const buscador = createMicrosoftLearn({ cliente: createClienteMcp({ deps: { fetch } }) });
    await buscador.buscarDocsMicrosoft('  Windows Update pause updates  ');

    const llamada = fetch.cuerpos.find((c) => c.method === 'tools/call');
    expect(llamada.params).toEqual({ name: 'microsoft_docs_search', arguments: { query: 'Windows Update pause updates' } });
    expect(Object.keys(llamada.params.arguments)).toEqual(['query']);
    // Ninguna otra clave del mensaje (ni snapshot, ni device_id, ni equipo) viaja en la petición.
    expect(Object.keys(llamada).sort()).toEqual(['id', 'jsonrpc', 'method', 'params']);
  });

  it('no envía nada extra en los encabezados de la petición de búsqueda', async () => {
    const encabezados = [];
    const fetch = async (url, opciones) => {
      encabezados.push(Object.keys(opciones.headers).sort());
      return servidorFalso()(url, opciones);
    };
    const buscador = createMicrosoftLearn({ cliente: createClienteMcp({ deps: { fetch } }) });
    await buscador.buscarDocsMicrosoft('Windows Update pause updates');
    expect(encabezados.length).toBeGreaterThan(0);
    for (const h of encabezados) {
      expect(h.every((k) => ['Accept', 'Content-Type', 'MCP-Protocol-Version', 'Mcp-Session-Id'].includes(k))).toBe(true);
    }
  });

  it('una pregunta inválida no llega a la red', async () => {
    const fetch = servidorFalso();
    const buscador = createMicrosoftLearn({ cliente: createClienteMcp({ deps: { fetch } }) });
    const err = await buscador.buscarDocsMicrosoft('ab').catch((e) => e);
    expect(err).toBeInstanceOf(ErrorMcp);
    expect(err.codigo).toBe('PREGUNTA');
    expect(fetch.cuerpos).toHaveLength(0);
  });
});

describe('caché en memoria', () => {
  it('repite la misma pregunta sin volver a llamar al servidor dentro de 10 minutos', async () => {
    const cliente = clienteFalso();
    let ahora = 1_000;
    const buscador = createMicrosoftLearn({ cliente, clock: () => ahora });
    await buscador.buscarDocsMicrosoft('Windows Update pause updates');
    ahora += 9 * 60_000;
    const otra = await buscador.buscarDocsMicrosoft('Windows Update pause updates');
    expect(cliente.llamadas).toHaveLength(1);
    expect(otra[0].titulo).toBe('Pausar actualizaciones');
  });

  it('vence a los 10 minutos', async () => {
    const cliente = clienteFalso();
    let ahora = 1_000;
    const buscador = createMicrosoftLearn({ cliente, clock: () => ahora });
    await buscador.buscarDocsMicrosoft('Windows Update pause updates');
    ahora += 10 * 60_000 + 1;
    await buscador.buscarDocsMicrosoft('Windows Update pause updates');
    expect(cliente.llamadas).toHaveLength(2);
  });

  it('guarda como mucho 20 preguntas y saca la menos reciente', async () => {
    const cliente = clienteFalso();
    const buscador = createMicrosoftLearn({ cliente, clock: () => 0 });
    for (let i = 0; i <= CACHE_MAX; i++) await buscador.buscarDocsMicrosoft(`pregunta numero ${i}`);
    expect(cliente.llamadas).toHaveLength(CACHE_MAX + 1);
    // La primera ya salió de la caché: vuelve a llamar.
    await buscador.buscarDocsMicrosoft('pregunta numero 0');
    expect(cliente.llamadas).toHaveLength(CACHE_MAX + 2);
    // La última sigue dentro.
    await buscador.buscarDocsMicrosoft(`pregunta numero ${CACHE_MAX}`);
    expect(cliente.llamadas).toHaveLength(CACHE_MAX + 2);
  });

  it('un error no se guarda: la siguiente vez vuelve a intentar', async () => {
    const cliente = clienteFalso(new ErrorMcp('RED'));
    const buscador = createMicrosoftLearn({ cliente, clock: () => 0 });
    await buscador.buscarDocsMicrosoft('Windows Update pause updates').catch(() => {});
    cliente.llamarHerramienta = async () => resultadoDocs();
    const r = await buscador.buscarDocsMicrosoft('Windows Update pause updates');
    expect(r).toHaveLength(1);
  });
});

describe('lectura del resultado', () => {
  it('toma título, extracto y enlace, y no más de 5 resultados', () => {
    const muchos = { results: Array.from({ length: 8 }, (_, i) => ({ title: `t${i}`, content: `c${i}`, contentUrl: `https://learn.microsoft.com/${i}` })) };
    const lista = leerResultadoDocs(resultadoDocs(muchos));
    expect(lista).toHaveLength(MAX_RESULTADOS);
    expect(lista[0]).toEqual({ titulo: 't0', extracto: 'c0', url: 'https://learn.microsoft.com/0' });
  });

  it('un resultado que no es JSON o no trae la lista es un error de protocolo', () => {
    expect(() => leerResultadoDocs({ content: [{ type: 'text', text: 'hola' }] })).toThrow(ErrorMcp);
    expect(() => leerResultadoDocs({ content: [{ type: 'text', text: '{"otra":1}' }] })).toThrow(ErrorMcp);
  });

  it('si el servidor marca isError, se trata como error', () => {
    expect(() => leerResultadoDocs({ isError: true, content: [] })).toThrow(ErrorMcp);
  });
});

describe('bandera MICROSOFT_LEARN_MCP', () => {
  it('apagada por defecto y solo "1" la enciende', () => {
    expect(loadConfig({}).microsoftLearn.activo).toBe(false);
    expect(loadConfig({ MICROSOFT_LEARN_MCP: '' }).microsoftLearn.activo).toBe(false);
    expect(loadConfig({ MICROSOFT_LEARN_MCP: '0' }).microsoftLearn.activo).toBe(false);
    expect(loadConfig({ MICROSOFT_LEARN_MCP: 'true' }).microsoftLearn.activo).toBe(false);
    expect(loadConfig({ MICROSOFT_LEARN_MCP: '1' }).microsoftLearn.activo).toBe(true);
  });

  it('con la bandera apagada no se crea ningún cliente', () => {
    expect(crearDocsMicrosoft({ activo: false })).toBeNull();
    expect(crearDocsMicrosoft({ activo: true, deps: { fetch: servidorFalso() } })).not.toBeNull();
  });
});
