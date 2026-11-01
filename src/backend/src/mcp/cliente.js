/**
 * Cliente MCP mínimo (Streamable HTTP, JSON-RPC 2.0) para el servidor público de Microsoft Learn.
 *
 * Fuentes verificadas el 2026-11-01:
 *  - Endpoint https://learn.microsoft.com/api/mcp y herramientas: https://learn.microsoft.com/en-us/training/support/mcp
 *  - Referencia para desarrolladores: https://learn.microsoft.com/en-us/training/support/mcp-developer-reference
 *    (las herramientas pueden cambiar: el cliente pide tools/list antes de llamar)
 *  - Transporte Streamable HTTP: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 *    POST con Accept "application/json, text/event-stream"; cada mensaje es un POST nuevo; una notificación
 *    recibe 202 sin cuerpo; una petición recibe JSON o un stream SSE; Mcp-Session-Id si el servidor lo da;
 *    MCP-Protocol-Version en las peticiones.
 *  - Ciclo de vida: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
 *    initialize -> notifications/initialized -> tools/list / tools/call.
 *
 * Reglas de Kerni:
 *  - Solo habla con UN endpoint, fijado en el código. Cualquier otra dirección se rechaza antes de hacer nada.
 *  - Los errores se traducen a un mensaje en español. Nunca se muestran el cuerpo ni los encabezados de la respuesta
 *    (son datos externos no confiables).
 */

export const ENDPOINT_MICROSOFT_LEARN = 'https://learn.microsoft.com/api/mcp';
export const VERSION_PROTOCOLO = '2025-06-18';
export const TIMEOUT_MS = 10_000;
export const MAX_RESPUESTA_BYTES = 200 * 1024;

const MENSAJES = {
  DIRECCION: 'Dirección no permitida para Microsoft Learn.',
  TIMEOUT: 'Microsoft Learn tardó demasiado en responder. Probá de nuevo más tarde.',
  RED: 'No pude conectarme con Microsoft Learn.',
  HTTP: 'Microsoft Learn respondió con un error.',
  TAMANO: 'La respuesta de Microsoft Learn es demasiado grande.',
  PROTOCOLO: 'Microsoft Learn respondió de forma inesperada.',
  RPC: 'Microsoft Learn no pudo atender la consulta.',
  SESION: 'Se cerró la sesión con Microsoft Learn.',
};

export class ErrorMcp extends Error {
  /** @param {string} codigo  @param {string} mensaje  Mensaje en español, seguro para mostrar. */
  constructor(codigo, mensaje = MENSAJES[codigo] ?? MENSAJES.PROTOCOLO) {
    super(mensaje);
    this.name = 'ErrorMcp';
    this.codigo = codigo;
  }
}

/** Solo el endpoint exacto de Microsoft Learn (esquema, host y ruta). Cualquier otra cosa es False. */
export function endpointPermitido(url) {
  try {
    return new URL(String(url)).href === ENDPOINT_MICROSOFT_LEARN;
  } catch {
    return false;
  }
}

/** Extrae los datos de un stream SSE (líneas "data:" separadas por una línea vacía). */
export function datosSse(texto) {
  const eventos = [];
  let datos = [];
  for (const linea of String(texto).split(/\r?\n/)) {
    if (linea === '') {
      if (datos.length) eventos.push(datos.join('\n'));
      datos = [];
    } else if (linea.startsWith('data:')) {
      datos.push(linea.slice(5).replace(/^ /, ''));
    }
  }
  if (datos.length) eventos.push(datos.join('\n'));
  return eventos;
}

/** Lee el cuerpo sin pasar del tope. Corta en cuanto se excede, así no se carga una respuesta gigante en memoria. */
async function leerConTope(respuesta, maxBytes) {
  const declarado = Number(respuesta.headers.get('content-length'));
  if (declarado > maxBytes) throw new ErrorMcp('TAMANO');
  if (!respuesta.body?.getReader) {
    const texto = await respuesta.text();
    if (Buffer.byteLength(texto) > maxBytes) throw new ErrorMcp('TAMANO');
    return texto;
  }
  const lector = respuesta.body.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await lector.cancel().catch(() => {});
      throw new ErrorMcp('TAMANO');
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString('utf8');
}

/**
 * @param {object} [opciones]
 * @param {string} [opciones.url]  Debe ser ENDPOINT_MICROSOFT_LEARN; cualquier otra cosa lanza ErrorMcp('DIRECCION').
 * @param {{ fetch?: Function, timeoutMs?: number, maxBytes?: number }} [opciones.deps]  Inyectables para tests.
 */
export function createClienteMcp({ url = ENDPOINT_MICROSOFT_LEARN, deps = {} } = {}) {
  if (!endpointPermitido(url)) throw new ErrorMcp('DIRECCION');
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? MAX_RESPUESTA_BYTES;

  let ultimoId = 0;
  let sesion = nuevaSesion();

  function nuevaSesion() {
    return { sessionId: '', lista: false, iniciando: null };
  }

  async function enviar(cuerpo) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': VERSION_PROTOCOLO,
    };
    if (sesion.sessionId) headers['Mcp-Session-Id'] = sesion.sessionId;
    try {
      return await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error', // nunca seguir una redirección a otro host
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new ErrorMcp('TIMEOUT');
      throw new ErrorMcp('RED');
    }
  }

  async function leerMensaje(respuesta, idEsperado) {
    const tipo = respuesta.headers.get('content-type') ?? '';
    const texto = await leerConTope(respuesta, maxBytes);
    let mensajes;
    if (tipo.includes('text/event-stream')) {
      mensajes = datosSse(texto).flatMap((d) => {
        try { return [JSON.parse(d)]; } catch { return []; }
      });
    } else if (tipo.includes('application/json')) {
      try { mensajes = [JSON.parse(texto)]; } catch { throw new ErrorMcp('PROTOCOLO'); }
    } else {
      throw new ErrorMcp('PROTOCOLO');
    }
    const mensaje = mensajes.find((m) => m && m.id === idEsperado);
    if (!mensaje) throw new ErrorMcp('PROTOCOLO');
    return mensaje;
  }

  /** Una petición JSON-RPC con respuesta. */
  async function pedir(metodo, params) {
    const id = ++ultimoId;
    const respuesta = await enviar({ jsonrpc: '2.0', id, method: metodo, params });
    if (!respuesta.ok) {
      if (respuesta.status === 404 && sesion.sessionId) throw new ErrorMcp('SESION');
      throw new ErrorMcp('HTTP', `Microsoft Learn respondió con un error (${respuesta.status}).`);
    }
    const mensaje = await leerMensaje(respuesta, id);
    if (mensaje.error) throw new ErrorMcp('RPC');
    return { resultado: mensaje.result, sessionId: respuesta.headers.get('mcp-session-id') };
  }

  /** Una notificación: el servidor responde 202 sin cuerpo. */
  async function notificar(metodo) {
    const respuesta = await enviar({ jsonrpc: '2.0', method: metodo });
    await respuesta.body?.cancel?.().catch(() => {});
    if (!respuesta.ok) throw new ErrorMcp('HTTP', `Microsoft Learn respondió con un error (${respuesta.status}).`);
  }

  async function iniciar() {
    const { resultado, sessionId } = await pedir('initialize', {
      protocolVersion: VERSION_PROTOCOLO,
      capabilities: {},
      clientInfo: { name: 'kerni', version: '0.1.0' },
    });
    if (resultado?.protocolVersion !== VERSION_PROTOCOLO) throw new ErrorMcp('PROTOCOLO');
    // El id de sesión solo puede tener caracteres ASCII visibles (spec: 0x21 a 0x7E).
    sesion.sessionId = sessionId && /^[\x21-\x7E]+$/.test(sessionId) ? sessionId : '';
    await notificar('notifications/initialized');
    sesion.lista = true;
  }

  /** Hace initialize una sola vez (si falla, la siguiente llamada lo intenta de nuevo). */
  async function asegurarSesion() {
    if (sesion.lista) return;
    sesion.iniciando ??= iniciar().finally(() => { sesion.iniciando = null; });
    await sesion.iniciando;
  }

  async function llamar(metodo, params) {
    await asegurarSesion();
    try {
      return (await pedir(metodo, params)).resultado;
    } catch (err) {
      if (err.codigo !== 'SESION') throw err;
      // El servidor cerró la sesión: se empieza otra vez una sola vez.
      sesion = nuevaSesion();
      await asegurarSesion();
      return (await pedir(metodo, params)).resultado;
    }
  }

  return {
    url,
    /** tools/list: las herramientas que ofrece el servidor ahora mismo. */
    herramientas: () => llamar('tools/list', {}),
    /** tools/call: ejecuta una herramienta del servidor. */
    llamarHerramienta: (nombre, argumentos) => llamar('tools/call', { name: nombre, arguments: argumentos }),
  };
}
