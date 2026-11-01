import { describe, expect, it } from 'vitest';
import { createAnthropicProvider, errorAnthropic } from '../src/llm/anthropic.js';
import { texto } from './helpers.js';

class APIConnectionError extends Error {}

/** Cliente que falla con un corte de red las primeras `fallos` veces y después responde. */
function clienteConFallos(fallos) {
  let llamadas = 0;
  return {
    get llamadas() { return llamadas; },
    messages: {
      create: async () => {
        llamadas++;
        if (llamadas <= fallos) throw new APIConnectionError('Connection error.');
        return texto('hola de nuevo');
      },
    },
  };
}

describe('Anthropic: reintento ante un corte de red', () => {
  it('un corte pasajero se reintenta una vez y la respuesta llega', async () => {
    const cliente = clienteConFallos(1);
    const provider = createAnthropicProvider({ anthropic: cliente });
    const paso = await provider.step({ history: [{ role: 'user', content: 'hola' }] });
    expect(paso.text).toBe('hola de nuevo');
    expect(cliente.llamadas).toBe(2);
  });

  it('si el segundo intento también falla, se devuelve sin_red', async () => {
    const cliente = clienteConFallos(5);
    const provider = createAnthropicProvider({ anthropic: cliente });
    await expect(provider.step({ history: [{ role: 'user', content: 'hola' }] })).rejects.toMatchObject({ codigo: 'sin_red' });
    expect(cliente.llamadas).toBe(2);
  });

  it('un error que no es de red no se reintenta', async () => {
    let llamadas = 0;
    const cliente = { messages: { create: async () => { llamadas++; const e = new Error('401'); e.status = 401; throw e; } } };
    const provider = createAnthropicProvider({ anthropic: cliente });
    await expect(provider.step({ history: [] })).rejects.toMatchObject({ codigo: 'llave_invalida' });
    expect(llamadas).toBe(1);
  });

  it('la causa de red queda en el error para el log, no en el mensaje', () => {
    const original = new APIConnectionError('Connection error.');
    original.cause = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const e = errorAnthropic(original);
    expect(e.codigo).toBe('sin_red');
    expect(e.red).toBe('ENOTFOUND');
    expect(e.message).not.toMatch(/ENOTFOUND/);
  });
});
