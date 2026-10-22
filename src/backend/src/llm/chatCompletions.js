/**
 * Proveedor para cualquier API compatible con OpenAI Chat Completions: OpenRouter y Gemini
 * (su endpoint de compatibilidad con OpenAI). Misma interfaz `step` que el proveedor de
 * Anthropic, así el harness del agente no sabe con quién habla.
 *
 * El historial queda en formato OpenAI (mensajes `assistant` con `tool_calls` y mensajes
 * `tool`), distinto al de Anthropic: una sesión usa siempre el mismo proveedor.
 */
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_MODEL = 'anthropic/claude-haiku-4.5';
export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
// Medido el 2026-10-19 con una llave real: gemini-3.6-flash responde en ~3 s y llama bien a las tools;
// gemini-3.8-flash y gemini-3.5-flash-lite tardaron 35-55 s o dieron 503 (alta demanda), y
// gemini-3.1-flash-lite inventó un valor fuera de la lista. Volver a medir con `npm run probar-llm`.
export const GEMINI_MODEL = 'gemini-3.6-flash';

// 429 (límite por minuto) y 5xx (sobrecarga, frecuente en Gemini) se reintentan con espera creciente.
// 401/403 (llave) y 402 (sin créditos) no: reintentar no los arregla.
const REINTENTABLES = new Set([429, 500, 502, 503, 504]);

/** Error con un mensaje que se le puede mostrar a la persona (sin datos internos ni la llave). */
function errorApi(nombre, claveEnv, status, detalle) {
  const base = {
    401: `La llave de ${nombre} no es válida. Revisá ${claveEnv} en src/backend/.env.`,
    403: `${nombre} no dejó usar esta llave (403). Revisá ${claveEnv} y sus permisos.`,
    402: `${nombre} dice que no hay créditos en la cuenta.`,
  }[status] ?? `${nombre} respondió ${status}: ${detalle}`;
  const err = new Error(base);
  if (status === 401 || status === 403) err.codigo = 'llave_invalida';
  err.status = status;
  return err;
}

/** Más espera que esto no se espera: se avisa y listo (la persona está mirando a Kerni). */
const ESPERA_MAXIMA_S = 30;

/** Segundos que el proveedor pide esperar: RetryInfo de Gemini ("35293s") o el "retry in 9h48m13s" del mensaje. */
export function segundosDeEspera(cuerpoError) {
  const info = (cuerpoError?.details ?? []).find((d) => String(d?.['@type']).endsWith('RetryInfo'));
  if (info?.retryDelay) return parseFloat(info.retryDelay) || 0;
  const m = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(cuerpoError?.message ?? '');
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

function humano(segundos) {
  if (segundos >= 3600) return `${Math.round(segundos / 3600)} h`;
  if (segundos >= 90) return `${Math.round(segundos / 60)} min`;
  return `${Math.max(1, Math.round(segundos))} s`;
}

function mensajeSinCupo(nombre, { diario, espera, gratis }) {
  const cuando = espera > 0 ? ` Se renueva en unas ${humano(espera)}.` : '';
  const plan = gratis
    ? ' Es el plan gratuito, que permite muy pocos pedidos por día en cada modelo (cada mensaje al chat gasta 1 o 2): probá otro modelo o activá la facturación en Google AI Studio.'
    : ' Probá más tarde o cambiá de modelo.';
  return `${nombre} agotó el cupo ${diario ? 'de hoy ' : ''}de esta llave.${cuando}${plan}`;
}

export function createChatCompletionsClient({
  nombre,
  claveEnv,
  apiKey,
  url,
  headers = {},
  fetchImpl = fetch,
  reintentos = 3,
  esperaMs = 1500,
  timeoutMs = 45_000,
  reintentosRed = 1, // cuántas veces se reintenta tras un tiempo agotado o un corte de red
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  return async function complete(body) {
    for (let intento = 0; ; intento++) {
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...headers },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        // Sin red o tiempo agotado: se reintenta antes de rendirse.
        if (intento < Math.min(reintentos, reintentosRed)) { await dormir(esperaMs); continue; }
        const e = new Error(err?.name === 'TimeoutError' ? `${nombre} tardó demasiado en responder.` : `No pude conectar con ${nombre}.`);
        e.codigo = 'sin_red';
        throw e;
      }
      const json = await res.json().catch(() => ({}));
      // Gemini a veces responde el error como una lista; OpenRouter, a veces con 200 y el error en el cuerpo.
      const cuerpoError = Array.isArray(json) ? json[0]?.error : json.error;
      if (res.ok && !cuerpoError) return json;

      const status = res.ok ? cuerpoError?.code ?? 502 : res.status;
      // Gemini explica el tipo de cupo en `details` (p. ej. GenerateRequestsPerDayPerProjectPerModel-FreeTier),
      // no en el mensaje: hay que mirarlos para distinguir "por minuto" de "por día".
      const mensaje = `${cuerpoError?.message ?? ''} ${cuerpoError?.metadata?.limit_source ?? ''} ${cuerpoError?.status ?? ''} ${JSON.stringify(cuerpoError?.details ?? '')}`;
      const espera = segundosDeEspera(cuerpoError);
      if (status === 429) {
        const diario = /per-?day|daily/i.test(mensaje);
        // Un cupo diario, o una espera larga, no se arregla reintentando: falla de una vez y dice cuándo vuelve.
        if (diario || espera > ESPERA_MAXIMA_S) {
          const err = new Error(mensajeSinCupo(nombre, { diario, espera, gratis: /free_?tier/i.test(mensaje) }));
          err.codigo = 'sin_cupo';
          err.status = 429;
          throw err;
        }
      }
      if (REINTENTABLES.has(status) && intento < reintentos) {
        const retryAfter = Number(res.headers?.get?.('retry-after')) || (status === 429 ? espera : 0);
        await dormir(retryAfter > 0 ? retryAfter * 1000 : esperaMs * 2 ** intento);
        continue;
      }
      const detalle = cuerpoError?.metadata?.raw ?? cuerpoError?.message ?? 'sin detalle';
      throw errorApi(nombre, claveEnv, status, String(detalle).slice(0, 300));
    }
  };
}

let contador = 0;

export function createChatCompletionsProvider({ complete, model, maxTokens = 1000, name = 'openai-compatible', extraBody = {} }) {
  return {
    name,
    model,

    userMessage: (text) => ({ role: 'user', content: text }),

    async step({ persona = '', contexto = '', tools = [], history = [], sinTools = false } = {}) {
      const systemContent = [persona, contexto].filter(Boolean).join('\n\n');
      const systemMessages = systemContent ? [{ role: 'system', content: systemContent }] : [];
      const json = await complete({
        model,
        max_tokens: maxTokens,
        // El system prompt no se guarda en el historial: se arma en cada paso.
        messages: [...systemMessages, ...history],
        ...(tools?.length ? {
          tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
          ...(sinTools ? { tool_choice: 'none' } : {}),
        } : {}),
        ...extraBody,
      });

      const choice = json.choices?.[0];
      if (!choice) throw new Error(`${name} no devolvió respuesta`);
      if (choice.finish_reason === 'content_filter') return { kind: 'refusal' };

      const message = choice.message ?? {};
      // Algunos proveedores (Gemini) devuelven tool_calls sin id; se les pone uno para poder responderles.
      const toolCalls = (message.tool_calls ?? []).map((tc) => ({ ...tc, id: tc.id || `call_${++contador}`, type: 'function' }));
      const calls = toolCalls.map((tc) => {
        // Los argumentos llegan como texto JSON; si vienen rotos, el error vuelve al modelo.
        let input;
        try {
          input = JSON.parse(tc.function.arguments || '{}');
        } catch {
          input = { __argumentos_invalidos: tc.function.arguments };
        }
        return { id: tc.id, name: tc.function.name, input };
      });

      return {
        kind: calls.length ? 'tool_calls' : 'final',
        text: (message.content ?? '').trim(),
        calls,
        assistantMessage: {
          role: 'assistant',
          content: message.content ?? null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
      };
    },

    /** En formato OpenAI, cada resultado es su propio mensaje con role "tool" (Gemini también pide el name). */
    toolResultMessages: (results) =>
      results.map((r) => ({ role: 'tool', tool_call_id: r.id, ...(r.name ? { name: r.name } : {}), content: r.content })),
  };
}
