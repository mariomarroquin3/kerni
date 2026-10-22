// Prueba la memoria de Kerni: npm run probar-memoria
//  1) SQLite local (siempre): guarda, lee y olvida en una carpeta temporal.
//  2) Supabase real (si hay SUPABASE_URL y SUPABASE_SECRET_KEY): las tablas de salud y de conocimiento existen
//     y la salud se guarda y se borra con un device_id aleatorio. No toca tus datos.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { createSupabase } from '../src/memoria/supabase.js';
import { createSqliteMemoria } from '../src/memoria/sqlite.js';

const { supabase } = loadConfig();
const fallas = [];
const paso = (nombre, ok) => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}`); if (!ok) fallas.push(nombre); };
const id = randomUUID();

console.log('--- SQLite local');
const dataDir = mkdtempSync(join(tmpdir(), 'kerni-probar-'));
const memoria = createSqliteMemoria({ dataDir, supabase: null, logger: { error: (o, m) => console.error(m, o) } });
paso('guarda un recuerdo', (await memoria.guardarHecho(id, 'prueba', 'recuerdo de prueba')).ok);
paso('lo lee de vuelta', (await memoria.hechos(id)).some((h) => h.clave === 'prueba'));
paso('aparece en el contexto', (await memoria.contexto(id)).includes('recuerdo de prueba'));
await memoria.guardarTurno(id, randomUUID(), 'hola', 'hola, ¿cómo va tu compu?');
paso('guarda y retoma un turno', (await memoria.ultimosMensajes(id)).length === 2);
paso('olvida todo', (await memoria.olvidarTodo(id)) && (await memoria.hechos(id)).length === 0);
memoria.cerrar();
rmSync(dataDir, { recursive: true, force: true });

console.log('--- Supabase');
if (!supabase.url || !supabase.key) {
  console.log('(omitido: faltan SUPABASE_URL y SUPABASE_SECRET_KEY en src/backend/.env; Kerni funciona igual sin Supabase)');
} else {
  const db = createSupabase(supabase);
  for (const tabla of ['kerni_salud', 'kerni_conocimiento']) {
    try { await db.select(tabla, { limite: 1 }); paso(`existe la tabla ${tabla}`, true); } catch (e) {
      paso(`existe la tabla ${tabla} (${e.message}): ¿corriste las migraciones de supabase/migrations?`, false);
    }
  }
  try {
    await db.insert('kerni_salud', [{ device_id: id, cpu: 10, ram_pct: 50, disco_pct: 40, proceso_top: 'prueba.exe', proceso_mb: 100 }]);
    paso('guarda una lectura de salud', (await db.select('kerni_salud', { filtros: { device_id: `eq.${id}` } })).length === 1);
  } catch (e) { paso(`guarda una lectura de salud (${e.message})`, false); }
  try { await db.delete('kerni_salud', { device_id: `eq.${id}` }); paso('borra la lectura de prueba', true); } catch (e) { paso(`borra la lectura de prueba (${e.message})`, false); }
}

process.exit(fallas.length ? 1 : 0);
