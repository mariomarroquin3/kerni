import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createAgent } from './agent/agent.js';
import { crearProveedor } from './llm/proveedores.js';
import { createSupabase } from './memoria/supabase.js';
import { createMemoria, createMemoriaNula } from './memoria/memoria.js';

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

// Memoria en Supabase: opcional. Sin URL y llave, Kerni funciona igual pero no recuerda nada.
const memoria = config.supabase.url && config.supabase.key
  ? createMemoria({ db: createSupabase(config.supabase) })
  : createMemoriaNula();

const agent = createAgent({ provider: elegido.provider, memoriaActiva: memoria.habilitada });
const app = buildApp({ config, agent, provider: elegido.provider, memoria, logger: true });
console.log(`Cerebro: ${elegido.provider.name} (${elegido.provider.model})`);
console.log(memoria.habilitada ? 'Memoria: Supabase conectado' : 'Memoria: apagada (falta SUPABASE_URL o SUPABASE_SECRET_KEY en .env)');
memoria.mantenimiento();

await app.listen({ port: config.port, host: config.host });
