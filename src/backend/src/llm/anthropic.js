/**
 * Proveedor Anthropic para el harness. El historial se guarda en el formato
 * nativo de la Messages API. Misma interfaz `step` que usa Bitoo, para poder
 * agregar otros proveedores (OpenRouter) sin tocar el bucle del agente.
 */
export const ANTHROPIC_MODEL = 'claude-haiku-5-5';

/**
 * Los errores del SDK solo traen `status`; /chat necesita el mismo `codigo` que pone chatCompletions.js
 * (llave_invalida, sin_cupo, sin_red) para mostrarle a la persona un mensaje claro. Nunca se copia el cuerpo crudo.
 */
export function errorAnthropic(err, { signal } = {}) {
  if (err?.codigo) return err;
  const nombre = err?.constructor?.name ?? err?.name ?? '';
  const status = Number(err?.status) || 0;
  let e;
  if (signal?.aborted || /UserAbort|Timeout/i.test(nombre)) {
    e = new Error('Anthropic tardó demasiado en responder.');
    e.codigo = 'sin_red';
  } else if (/Connection/i.test(nombre)) {
    e = new Error('No pude conectar con Anthropic.');
    e.codigo = 'sin_red';
    // Causa de red real (ENOTFOUND, ECONNRESET...) solo para el log: nunca se muestra a la persona.
    e.red = err?.cause?.cause?.code ?? err?.cause?.code ?? err?.cause?.name ?? 'desconocida';
  } else if (status === 401 || status === 403) {
    e = new Error('La llave de Anthropic no es válida. Cambiala desde el menú de Kerni (Cambiar IA…) o revisá ANTHROPIC_API_KEY en src/backend/.env.');
    e.codigo = 'llave_invalida';
  } else if (status === 429) {
    e = new Error('Anthropic agotó el cupo de esta llave por ahora. Probá más tarde.');
    e.codigo = 'sin_cupo';
  } else if (status === 400 && /credit balance/i.test(String(err?.message))) {
    e = new Error('Anthropic dice que no hay créditos en la cuenta.');
    e.codigo = 'sin_cupo';
  } else {
    return err;
  }
  e.status = status || undefined;
  e.cause = err;
  return e;
}

function crear(anthropic, { model, maxTokens, persona, contexto, tools, history, sinTools, signal }) {
  return anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    // Haiku 5.5 gasta los tokens de salida en razonamiento oculto si se lo dejan: con 600 la respuesta llegaba vacía o cortada.
    // Kerni no necesita razonar en voz baja para charlar y usar herramientas, así que se desactiva y el límite da margen.
    thinking: { type: 'disabled' },
    system: [
      { type: 'text', text: persona, cache_control: { type: 'ephemeral' } },
      ...(contexto ? [{ type: 'text', text: contexto }] : []),
    ],
    ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
    ...(sinTools && tools.length ? { tool_choice: { type: 'none' } } : {}),
    messages: history,
  }, signal ? { signal } : undefined);
}

export function createAnthropicProvider({ anthropic, model = ANTHROPIC_MODEL, maxTokens = 1024 }) {
  return {
    name: 'anthropic',
    model,

    userMessage: (text) => ({ role: 'user', content: text }),

    async step({ persona = '', contexto = '', tools = [], history = [], sinTools = false, signal } = {}) {
      const opciones = { anthropic, model, maxTokens, persona, contexto, tools, history, sinTools, signal };
      let response;
      try {
        response = await crear(anthropic, opciones);
      } catch (err) {
        const primero = errorAnthropic(err, { signal });
        // Un corte de red suele ser pasajero: se reintenta una vez, con una pausa, antes de decirle a la persona que no hay conexión.
        if (primero.codigo !== 'sin_red' || signal?.aborted) throw primero;
        await new Promise((r) => setTimeout(r, 1500));
        try {
          response = await crear(anthropic, opciones);
        } catch (segundo) {
          throw errorAnthropic(segundo, { signal });
        }
      }

      if (response.stop_reason === 'refusal') return { kind: 'refusal' };

      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const completa = response.stop_reason === 'tool_use';
      const calls = completa
        ? response.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input }))
        : [];

      // Un tool_use cortado por max_tokens (u otro corte) no tiene resultado: si quedara en el historial, cada pedido
      // siguiente de la sesión daría 400. Se guarda solo el texto.
      const content = completa ? response.content : response.content.filter((b) => b.type !== 'tool_use');

      return {
        kind: completa && calls.length ? 'tool_calls' : 'final',
        text,
        calls,
        assistantMessage: { role: 'assistant', content: content.length ? content : [{ type: 'text', text: text || '…' }] },
      };
    },

    /** Todos los resultados de un paso van juntos en un solo mensaje. */
    toolResultMessages: (results) => [
      {
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      },
    ],
  };
}
