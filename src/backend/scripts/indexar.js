// Indexa la base de conocimiento de Kerni en Supabase (pgvector).
//   npm run indexar                       indexa conocimiento/ (los fragmentos que no cambiaron no gastan embeddings)
//   npm run indexar -- ruta/otra-carpeta  indexa otra carpeta
//   npm run indexar -- --buscar "mi pregunta"   prueba la búsqueda sin indexar
// Lee archivos .md y .txt. Tus manuales propios van en conocimiento/privado/ (ignorado por git).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createSupabase } from '../src/memoria/supabase.js';
import { crearEmbeddings } from '../src/rag/embeddings.js';
import { createConocimiento } from '../src/rag/conocimiento.js';

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
const conocimiento = createConocimiento({ db: createSupabase(config.supabase), embeddings, logger: { error: (o, m) => console.error(m, o) } });

const args = process.argv.slice(2);
const iBuscar = args.indexOf('--buscar');
if (iBuscar >= 0) {
  const resultados = await conocimiento.buscar(args[iBuscar + 1] ?? '', { k: 5, minimo: 0 });
  if (!resultados.length) console.log('Sin resultados (¿ya indexaste? ¿la pregunta tiene más de 12 caracteres?)');
  for (const r of resultados) console.log(`${r.similitud.toFixed(3)}  ${r.fuente} › ${r.titulo}\n       ${r.contenido.slice(0, 140).replace(/\s+/g, ' ')}…`);
  process.exit(0);
}

const raiz = resolve(args[0] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'conocimiento'));
if (!existsSync(raiz)) {
  console.error(`No existe la carpeta ${raiz}`);
  process.exit(1);
}

function archivos(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return ['.md', '.txt'].includes(extname(nombre).toLowerCase()) && nombre.toLowerCase() !== 'readme.md' ? [ruta] : [];
  });
}

const documentos = archivos(raiz).map((ruta) => ({ fuente: relative(raiz, ruta).split('\\').join('/'), texto: readFileSync(ruta, 'utf8') }));
console.log(`${documentos.length} documentos en ${raiz}; embeddings: ${embeddings.nombre} (${embeddings.model}, ${embeddings.dimensions} dim)`);
try {
  const r = await conocimiento.indexar(documentos, { alProgreso: (f, n) => console.log(`  ${f}: ${n} fragmentos`) });
  console.log(`Listo: ${r.nuevos} nuevos, ${r.iguales} sin cambios, ${r.borrados} borrados.`);
} catch (err) {
  console.error(`No pude indexar: ${err.message}`);
  process.exit(1);
}
