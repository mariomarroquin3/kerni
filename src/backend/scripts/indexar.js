// Indexa la base de conocimiento de Kerni en Supabase (pgvector).
//   npm run indexar                              indexa conocimiento/ (los fragmentos que no cambiaron no gastan embeddings)
//   npm run indexar -- ruta/otra-carpeta         indexa otra carpeta
//   npm run indexar -- --simular                 solo cuenta documentos y fragmentos, sin llaves ni gastar nada
//   npm run indexar -- --buscar "mi pregunta"    prueba la búsqueda sin indexar
// Lee .md, .txt y .pdf (con texto; los escaneados necesitan OCR antes). Tus manuales propios van en conocimiento/privado/ (ignorado por git).
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createSupabase } from '../src/memoria/supabase.js';
import { crearEmbeddings } from '../src/rag/embeddings.js';
import { createConocimiento } from '../src/rag/conocimiento.js';
import { EXTENSIONES, leerDocumento } from '../src/rag/documentos.js';
import { fragmentar } from '../src/rag/fragmentos.js';

const args = process.argv.slice(2);
const simular = args.includes('--simular');
const iBuscar = args.indexOf('--buscar');
const carpeta = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--buscar');

function archivos(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return EXTENSIONES.includes(extname(nombre).toLowerCase()) && nombre.toLowerCase() !== 'readme.md' ? [ruta] : [];
  });
}

let conocimiento = null;
if (!simular) {
  const config = loadConfig();
  if (!config.supabase.url || !config.supabase.key) {
    console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en src/backend/.env (o corré node supabase/local/preparar.mjs para el Supabase local con Docker)');
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
  conocimiento = createConocimiento({ db: createSupabase(config.supabase), embeddings, logger: { error: (o, m) => console.error(m, o) } });
  console.log(`Embeddings: ${embeddings.nombre} (${embeddings.model}, ${embeddings.dimensions} dim)`);
}

if (iBuscar >= 0) {
  const resultados = await conocimiento.buscar(args[iBuscar + 1] ?? '', { k: 5, minimo: 0 });
  if (!resultados.length) console.log('Sin resultados (¿ya indexaste? ¿la pregunta tiene más de 12 caracteres?)');
  for (const r of resultados) console.log(`${r.similitud.toFixed(3)}  ${r.fuente} › ${r.titulo}\n       ${r.contenido.slice(0, 140).replace(/\s+/g, ' ')}…`);
  process.exit(0);
}

const raiz = resolve(carpeta ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'conocimiento'));
if (!existsSync(raiz)) {
  console.error(`No existe la carpeta ${raiz}`);
  process.exit(1);
}

const documentos = [];
let omitidos = 0;
for (const ruta of archivos(raiz)) {
  const fuente = relative(raiz, ruta).split('\\').join('/');
  try {
    const d = await leerDocumento(ruta);
    if (d.aviso) { console.warn(`  OMITIDO ${fuente}: ${d.aviso}`); omitidos++; continue; }
    documentos.push({ fuente, texto: d.texto, paginas: d.paginas });
  } catch (err) {
    console.warn(`  OMITIDO ${fuente}: no pude leerlo (${err.message})`);
    omitidos++;
  }
}

console.log(`${documentos.length} documentos en ${raiz}${omitidos ? ` (${omitidos} omitidos)` : ''}`);
if (simular) {
  let total = 0;
  for (const d of documentos) {
    const n = fragmentar(d.texto).length;
    total += n;
    console.log(`  ${d.fuente}: ${n} fragmentos${d.paginas ? `, ${d.paginas} páginas` : ''}`);
  }
  console.log(`Total: ${total} fragmentos (cada lote de 16 es una llamada de embeddings).`);
  process.exit(0);
}

try {
  const r = await conocimiento.indexar(documentos, {
    alProgreso: (f, n) => console.log(`  ${f}: ${n} fragmentos`),
    alEsperar: (s) => console.log(`  … límite de embeddings por minuto: espero ${s} s y sigo`),
  });
  console.log(`Listo: ${r.nuevos} nuevos, ${r.iguales} sin cambios, ${r.borrados} borrados.`);
} catch (err) {
  console.error(`No pude indexar: ${err.message}`);
  if (err.codigo === 'sin_cupo') console.error('Es seguro volver a correr el comando más tarde: retoma desde donde quedó y no repite lo ya indexado.');
  process.exit(1);
}
