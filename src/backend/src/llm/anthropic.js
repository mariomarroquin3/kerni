/**
 * Proveedor Anthropic para el harness. El historial se guarda en el formato
 * nativo de la Messages API. Misma interfaz `step` que usa Bitoo, para poder
 * agregar otros proveedores (OpenRouter) sin tocar el bucle del agente.
 */
export const ANTHROPIC_MODEL = 'claude-haiku-5-5';

export function createAnthropicProvider({ anthropic, model = ANTHROPIC_MODEL, maxTokens = 600 }) {
  return {
    name: 'anthropic',
    model,

    userMessage: (text) => ({ role: 'user', content: text }),

    async step({ persona, contexto, tools, history, sinTools = false }) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: [
          { type: 'text', text: persona, cache_control: { type: 'ephemeral' } },
          ...(contexto ? [{ type: 'text', text: contexto }] : []),
        ],
        ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
        ...(sinTools && tools.length ? { tool_choice: { type: 'none' } } : {}),
        messages: history,
      });

      if (response.stop_reason === 'refusal') return { kind: 'refusal' };

      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const calls = response.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));

      return {
        kind: response.stop_reason === 'tool_use' && calls.length ? 'tool_calls' : 'final',
        text,
        calls,
        assistantMessage: { role: 'assistant', content: response.content },
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
