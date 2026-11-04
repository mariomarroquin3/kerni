import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createAgent } from './agent/agent.js';
import { crearProveedor } from './llm/proveedores.js';
import { crearProveedorDinamico } from './llm/dinamico.js';
import { crearAjustes } from './ajustes.js';
import { configConLlave } from './routes/ajustes.js';
import { createSupabase } from './memoria/supabase.js';
import { createMemoriaNula } from './memoria/memoria.js';
import { createSqliteMemoria } from './memoria/sqlite.js';
import { crearEmbeddings } from './rag/embeddings.js';
import { createConocimiento, createConocimientoNulo } from './rag/conocimiento.js';
import { createRevisorEnlaces } from './enlaces.js';
import { crearDocsMicrosoft } from './mcp/microsoft-learn.js';

const config = loadConfig();

// Directorio de datos local: %APPDATA%/Kerni en Windows, ~/.local/share/Kerni en Linux/Mac
const dataDir = process.env.KERNI_DATA_DIR
  || (process.platform === 'win32'
    ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Kerni')
    : join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'Kerni'));

// La IA se elige de dos maneras. Si el .env fija LLM_PROVIDER, manda el .env (desarrollo, scripts).
// Si no, manda lo que la persona eligió en la app (ajustes.json); y sin eso, la primera llave del .env.
const ajustes = crearAjustes({ dataDir, logger: console });
const guardados = ajustes.leer();
const entornoManda = Boolean((config.llmProvider ?? '').trim());
let elegido;
try {
  if (!entornoManda && guardados.proveedor) {
    elegido = crearProveedor(configConLlave(config, guardados.proveedor, guardados.claves[guardados.proveedor], guardados.modelos[guardados.proveedor] ?? ''));
  } else if (!entornoManda && guardados.sinIA) {
    elegido = null;
  } else {
    elegido = crearProveedor(config);
  }
} catch (err) {
  if (/necesita (?:ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENROUTER_API_KEY)\./.test(err.message)) {
    console.warn(`${err.message} Se inicia en modo de respuestas automáticas locales.`);
  } else {
    console.error(err.message);
    process.exit(1);
  }
}
const proveedor = crearProveedorDinamico(elegido?.provider ?? null, elegido?.nombre);

// Cliente Supabase opcional (solo para salud y RAG)
const supabaseDb = config.supabase.url && config.supabase.key
  ? createSupabase(config.supabase)
  : null;

// Memoria local con SQLite. La salud se delega a Supabase si está configurado.
const memoria = createSqliteMemoria({ dataDir, supabase: supabaseDb });

// RAG: necesita Supabase y una llave de embeddings. Si falta algo, Kerni responde sin base de conocimiento.
let conocimiento = createConocimientoNulo();
if (supabaseDb) {
  try {
    const embeddings = crearEmbeddings(config);
    if (embeddings) conocimiento = createConocimiento({ db: supabaseDb, embeddings });
  } catch (err) {
    console.error(`Conocimiento apagado: ${err.message}`);
  }
}

// Revisión de enlaces: siempre disponible; con SAFE_BROWSING_API_KEY también consulta la lista de sitios peligrosos de Google.
const revisorEnlaces = createRevisorEnlaces({ apiKey: config.safeBrowsing.apiKey });

// Documentación oficial de Microsoft por MCP: apagada salvo MICROSOFT_LEARN_MCP=1 (null = la herramienta no se ofrece).
const docsMicrosoft = crearDocsMicrosoft({ activo: config.microsoftLearn.activo });

const agent = createAgent({ provider: proveedor, memoriaActiva: memoria.habilitada, conocimiento, revisorEnlaces, docsMicrosoft });
const app = buildApp({ config, agent, provider: proveedor, ajustes, origenEntorno: entornoManda, memoria, conocimiento, revisorEnlaces, logger: true });
console.log(elegido ? `Cerebro: ${elegido.provider.name} (${elegido.provider.model})` : 'Cerebro: sin llave; respuestas automáticas locales');
console.log(`Memoria: SQLite local (${dataDir})${supabaseDb ? ' + salud en Supabase' : ''}`);
console.log(revisorEnlaces.listasDisponibles ? 'Enlaces: dirección + lista de Google' : 'Enlaces: solo la dirección (sin SAFE_BROWSING_API_KEY)');
console.log(conocimiento.habilitado ? 'Conocimiento (RAG): activo' : 'Conocimiento (RAG): apagado (falta Supabase o una llave de embeddings)');
console.log(docsMicrosoft ? 'Microsoft Learn (MCP): activo, solo viaja el texto de la pregunta' : 'Microsoft Learn (MCP): apagado (MICROSOFT_LEARN_MCP=1 lo enciende)');
memoria.mantenimiento();

await app.listen({ port: config.port, host: config.host });
