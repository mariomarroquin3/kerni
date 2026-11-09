// Mide la búsqueda del conocimiento contra el Supabase real (gasta un embedding por pregunta, unos 30 en total).
//   npm run evaluar-rag                  como busca el agente (vectorial, 4 fragmentos, umbral de producción)
//   npm run evaluar-rag -- --hibrido     como busca el respaldo del chat (vector + texto, 3 fragmentos)
//   npm run evaluar-rag -- --detalle     muestra también las preguntas que acertaron
// Las preguntas y el documento esperado de cada una están en evaluacion/preguntas.json.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createSupabase } from '../src/memoria/supabase.js';
import { crearEmbeddings } from '../src/rag/embeddings.js';
import { createConocimiento } from '../src/rag/conocimiento.js';
import { evaluar } from '../src/rag/evaluacion.js';

const args = process.argv.slice(2);
const hibrido = args.includes('--hibrido');
const detalle = args.includes('--detalle');
const aqui = dirname(fileURLToPath(import.meta.url));
const preguntas = JSON.parse(readFileSync(join(aqui, '..', 'evaluacion', 'preguntas.json'), 'utf8'));

const config = loadConfig();
if (!config.supabase.url || !config.supabase.key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en src/backend/.env');
  process.exit(1);
}
let embeddings;
try {
  embeddings = crearEmbeddings(config);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (!embeddings) {
  console.error('Falta una llave para los embeddings: GEMINI_API_KEY u OPENROUTER_API_KEY en src/backend/.env');
  process.exit(1);
}

// La búsqueda nunca lanza: si falla devuelve [] y lo registra. Se detectan esos fallos para no confundir "no encontró" con "no pudo buscar":
// la pregunta se reintenta tras una pausa (los embeddings tienen un cupo por minuto) y solo cuenta como fallo si sigue sin poder.
let huboFallo = false;
let fallos = 0;
const conocimiento = createConocimiento({ db: createSupabase(config.supabase), embeddings, logger: { error: () => { huboFallo = true; } } });
const k = hibrido ? 3 : 4;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
async function buscar(q) {
  for (let intento = 1; intento <= 3; intento++) {
    huboFallo = false;
    const r = hibrido ? await conocimiento.buscarHibrido(q, { k }) : await conocimiento.buscar(q, { k });
    if (!huboFallo) return r;
    if (intento < 3) {
      console.log(`  (falló la búsqueda, espero 20 s y reintento: ${q.slice(0, 50)})`);
      await pausa(20_000);
    }
  }
  fallos++;
  return [];
}

console.log(`Búsqueda ${hibrido ? 'híbrida' : 'vectorial'}, k=${k}, ${preguntas.length} preguntas (${embeddings.nombre}, ${embeddings.model})\n`);
const { filas, resumen } = await evaluar(preguntas, buscar);

for (const f of filas) {
  if (f.acierto && !detalle) continue;
  const estado = f.acierto ? 'OK   ' : 'FALLA';
  const donde = f.ajena ? (f.acierto ? 'sin resultados' : `trajo ${f.fuentes.length}`) : f.posicion ? `posición ${f.posicion}` : 'no apareció';
  console.log(`${estado} ${f.pregunta}\n       ${donde}${f.mejor !== null ? `, mejor similitud ${f.mejor.toFixed(2)}` : ''}${f.fuentes.length ? `\n       trajo: ${f.fuentes.join(', ')}` : ''}`);
  if (!f.acierto && f.esperado.length) console.log(`       esperaba: ${f.esperado.join(' o ')}`);
}

console.log(`\nResultado: ${resumen.aciertos} de ${resumen.deTema} preguntas del tema encuentran su documento (${resumen.porcentaje} %), ${resumen.primero} en primer lugar, MRR ${resumen.mrr}.`);
console.log(`Preguntas ajenas rechazadas: ${resumen.rechazadas} de ${resumen.ajenas}.`);
if (fallos) console.log(`AVISO: ${fallos} búsquedas siguieron fallando tras 3 intentos (red, cupo de embeddings o Supabase); cuentan como "no apareció". Esperá un minuto y volvé a correrlo.`);
process.exit(fallos ? 2 : 0);
