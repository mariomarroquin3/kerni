import { buildApp } from '../src/app.js';
import { createAgent } from '../src/agent/agent.js';
import { createAnthropicProvider } from '../src/llm/anthropic.js';

export const SNAPSHOT = {
  cpu: 97,
  ram: { usadaMb: 14000, totalMb: 16000 },
  disco: { libreGb: 42.5, totalGb: 476 },
  procesos: [
    { pid: 4321, nombre: 'chrome.exe', cpu: 62.1, memoriaMb: 2400 },
    { pid: 900, nombre: 'svchost.exe', cpu: 3.2, memoriaMb: 80 },
    { pid: 5555, nombre: 'miner.exe', cpu: 30, memoriaMb: 300 },
  ],
};

/** Respuesta guionada de la Messages API. */
export const texto = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
export const usarTool = (name, input, id = 'tu_1') => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name, input }],
});

/** Cliente Anthropic falso: devuelve las respuestas en orden y guarda cada pedido. */
export function fakeAnthropic(respuestas) {
  const cola = [...respuestas];
  const create = async (params) => {
    create.llamadas.push(structuredClone(params));
    const r = cola.shift();
    if (!r) throw new Error('el guion del test se quedó sin respuestas');
    return r;
  };
  create.llamadas = [];
  return { messages: { create } };
}

export function createTestApp({ respuestas = [], now, provider: proveedor, sinProveedor = false } = {}) {
  const anthropic = fakeAnthropic(respuestas);
  const provider = sinProveedor ? null : proveedor ?? createAnthropicProvider({ anthropic });
  const agent = createAgent({ provider, logger: { error() {} } });
  const app = buildApp({ config: {}, agent, provider, now });
  return { app, agent, anthropic };
}
