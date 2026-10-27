// Comprueba que un proyecto de Supabase (en la nube o el local) está listo para Kerni: npm run probar-supabase
// Lee SUPABASE_URL y SUPABASE_SECRET_KEY de src/backend/.env. Solo lee: no escribe ni borra nada.
// Cada paso que falla dice qué hacer. Sale con código 1 si falta algo obligatorio.
import { loadConfig } from '../src/config.js';
import { createSupabase } from '../src/memoria/supabase.js';
import { esObligatorio, verificarSupabase } from '../src/rag/verificar.js';

const { supabase } = loadConfig();
const dimension = Number(process.env.EMBEDDINGS_DIMENSIONS) || 768;
const db = supabase.url && supabase.key ? createSupabase(supabase) : null;

console.log(`Proyecto: ${supabase.url || '(sin SUPABASE_URL)'}\n`);
const pasos = await verificarSupabase({ url: supabase.url, key: supabase.key, db, dimension });

for (const p of pasos) {
  console.log(`${p.ok ? 'OK   ' : esObligatorio(p) ? 'FALLA' : 'AVISO'} ${p.nombre}${p.detalle ? `: ${p.detalle}` : ''}`);
  if (!p.ok && p.ayuda) console.log(`       -> ${p.ayuda}`);
}

const fallas = pasos.filter((p) => !p.ok && esObligatorio(p));
console.log(fallas.length
  ? `\nFalta ${fallas.length} cosa${fallas.length > 1 ? 's' : ''} antes de usar el RAG. La guía es docs/supabase-cloud-setup.md.`
  : '\nTodo listo. Siguiente: npm run manuales y npm run indexar.');
process.exit(fallas.length ? 1 : 0);
