import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createAgent } from './agent/agent.js';
import { crearProveedor } from './llm/proveedores.js';

const config = loadConfig();

let elegido;
try {
  elegido = crearProveedor(config);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (!elegido) {
  console.error('No hay ninguna llave de modelo. Pegá una en src/backend/.env: ANTHROPIC_API_KEY, GEMINI_API_KEY u OPENROUTER_API_KEY.');
  process.exit(1);
}

const agent = createAgent({ provider: elegido.provider });
const app = buildApp({ config, agent, provider: elegido.provider, logger: true });
console.log(`Cerebro: ${elegido.provider.name} (${elegido.provider.model})`);

await app.listen({ port: config.port, host: config.host });
