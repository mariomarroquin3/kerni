// Prueba la memoria contra tu proyecto REAL de Supabase: npm run probar-memoria
// Escribe y borra un recuerdo de prueba con un device_id aleatorio; no toca tus datos.
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createSupabase } from '../src/memoria/supabase.js';
import { createMemoria } from '../src/memoria/memoria.js';

const { supabase } = loadConfig();
if (!supabase.url || !supabase.key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en src/backend/.env');
  process.exit(1);
}

const db = createSupabase(supabase);
const memoria = createMemoria({ db, logger: { error: (o, m) => console.error(m, o) } });
const id = randomUUID();
const fallas = [];
const paso = (nombre, ok) => { console.log(`${ok ? 'OK ' : 'FALLA'} ${nombre}`); if (!ok) fallas.push(nombre); };

for (const tabla of ['kerni_hechos', 'kerni_mensajes', 'kerni_salud']) {
  try { await db.select(tabla, { limite: 1 }); paso(`existe la tabla ${tabla}`, true); } catch (e) {
    paso(`existe la tabla ${tabla} (${e.message}) ¿corriste la migración?`, false);
  }
}
paso('guarda un recuerdo', (await memoria.guardarHecho(id, 'prueba', 'recuerdo de prueba')).ok);
paso('lo lee de vuelta', (await memoria.hechos(id)).some((h) => h.clave === 'prueba'));
paso('aparece en el contexto', (await memoria.contexto(id)).includes('recuerdo de prueba'));
await memoria.guardarTurno(id, randomUUID(), 'hola', 'hola, ¿cómo va tu compu?');
paso('guarda y retoma un turno', (await memoria.ultimosMensajes(id)).length === 2);
paso('olvida todo', (await memoria.olvidarTodo(id)) && (await memoria.hechos(id)).length === 0);

process.exit(fallas.length ? 1 : 0);
