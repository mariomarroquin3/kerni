import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { limpiarNombre } from '../telemetria.js';
import { sanearParaBloque, MAX_HECHOS } from './recuerdos.js';

export const MENSAJES_A_RETOMAR = 6;
const HORAS_RESUMEN = 24;
const MIN_ENTRE_LECTURAS_MS = 5 * 60_000;
const DIAS_DE_SALUD = 30;

/**
 * Memoria local con SQLite (node:sqlite, sin dependencias externas).
 * Guarda recuerdos y conversación en la PC. La salud se delega a Supabase
 * si está configurada; si no, se ignora silenciosamente.
 *
 * @param {{ dataDir: string, supabase?: object|null, logger?: object }} opts
 */
export function createSqliteMemoria({ dataDir, supabase = null, logger = console }) {
  // Asegurar que el directorio de datos existe (funciona en Windows y Linux)
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, 'kerni.db');
  const db = new DatabaseSync(dbPath);

  // Habilitar WAL para mejor rendimiento concurrente
  db.exec('PRAGMA journal_mode = WAL');

  // Crear tablas locales
  db.exec(`
    CREATE TABLE IF NOT EXISTS hechos (
      device_id TEXT NOT NULL,
      clave TEXT NOT NULL CHECK(clave GLOB '[a-z0-9_][a-z0-9_][a-z0-9_]*' AND length(clave) <= 40),
      valor TEXT NOT NULL CHECK(length(valor) BETWEEN 1 AND 200),
      origen TEXT NOT NULL DEFAULT 'persona' CHECK(origen IN ('persona', 'kerni')),
      actualizado TEXT NOT NULL,
      PRIMARY KEY (device_id, clave)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mensajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('user', 'assistant')),
      contenido TEXT NOT NULL CHECK(length(contenido) BETWEEN 1 AND 4000),
      creado TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_mensajes_device ON mensajes(device_id, id DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS salud (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      cpu REAL NOT NULL,
      ram_pct REAL NOT NULL,
      disco_pct REAL NOT NULL,
      proceso_top TEXT,
      proceso_mb REAL,
      creado TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_salud_device ON salud(device_id, creado DESC)');

  // Preparar statements reutilizables
  const stmtHechos = db.prepare('SELECT clave, valor, origen, actualizado FROM hechos WHERE device_id = ? ORDER BY actualizado DESC LIMIT ?');
  const stmtCountHechos = db.prepare('SELECT count(*) as c FROM hechos WHERE device_id = ?');
  const stmtUpsertHecho = db.prepare(`
    INSERT INTO hechos (device_id, clave, valor, origen, actualizado) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(device_id, clave) DO UPDATE SET valor = excluded.valor, origen = excluded.origen, actualizado = excluded.actualizado
  `);
  const stmtDeleteHecho = db.prepare('DELETE FROM hechos WHERE device_id = ? AND clave = ?');
  const stmtDeleteAllHechos = db.prepare('DELETE FROM hechos WHERE device_id = ?');
  const stmtDeleteAllMensajes = db.prepare('DELETE FROM mensajes WHERE device_id = ?');
  const stmtInsertMensaje = db.prepare('INSERT INTO mensajes (device_id, session_id, rol, contenido) VALUES (?, ?, ?, ?)');
  const stmtUltimosMensajes = db.prepare('SELECT rol, contenido FROM mensajes WHERE device_id = ? ORDER BY id DESC LIMIT ?');

  const stmtInsertSalud = db.prepare('INSERT INTO salud (device_id, cpu, ram_pct, disco_pct, proceso_top, proceso_mb, creado) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const stmtLecturasSalud = db.prepare(`
    SELECT cpu, ram_pct, disco_pct, proceso_top, proceso_mb
    FROM salud
    WHERE device_id = ? AND creado >= datetime('now', '-' || ? || ' hours')
    ORDER BY creado DESC
    LIMIT 300
  `);
  const stmtDeleteAllSalud = db.prepare('DELETE FROM salud WHERE device_id = ?');
  const stmtDeleteSaludVieja = db.prepare("DELETE FROM salud WHERE creado < datetime('now', '-' || ? || ' days')");
  const stmtDeleteMensajesViejos = db.prepare("DELETE FROM mensajes WHERE creado < datetime('now', '-' || ? || ' days')");

  // Salud: guarda en local y opcionalmente sincroniza a Supabase si está disponible
  const ultimaSalud = new Map();
  const tieneSupabase = supabase && typeof supabase.insert === 'function';

  function formatearResumenSalud(filas, horas = HORAS_RESUMEN) {
    if (!filas || filas.length < 3) return '';
    const prom = (k) => filas.reduce((s, f) => s + f[k], 0) / filas.length;
    const pico = (k) => Math.max(...filas.map((f) => f[k]));
    const conteo = new Map();
    for (const f of filas) if (f.proceso_top) conteo.set(f.proceso_top, (conteo.get(f.proceso_top) ?? 0) + 1);
    const [top, veces] = [...conteo].sort((a, b) => b[1] - a[1])[0] ?? [];
    return `Últimas ${horas} h (${filas.length} lecturas): CPU promedio ${Math.round(prom('cpu'))}% (pico ${Math.round(pico('cpu'))}%), `
      + `RAM promedio ${Math.round(prom('ram_pct'))}% (pico ${Math.round(pico('ram_pct'))}%), disco ${Math.round(pico('disco_pct'))}% usado.`
      + (top ? ` El proceso que más veces fue el más pesado: ${limpiarNombre(top)} (${veces} de ${filas.length} lecturas).` : '');
  }

  async function seguro(etiqueta, fn, vacio) {
    try {
      return await fn();
    } catch (err) {
      logger.error?.({ err: err.message, codigo: err.codigo }, `memoria: falló ${etiqueta}`);
      return vacio;
    }
  }

  return {
    habilitada: true,
    tipo: 'sqlite',

    async hechos(deviceId) {
      return stmtHechos.all(deviceId, MAX_HECHOS);
    },

    async resumenSalud(deviceId) {
      // 1. Intentar con lecturas locales (más rápido y disponible offline)
      try {
        const filasLocales = stmtLecturasSalud.all(deviceId, HORAS_RESUMEN);
        if (filasLocales && filasLocales.length >= 3) {
          return formatearResumenSalud(filasLocales, HORAS_RESUMEN);
        }
      } catch (err) {
        logger.error?.({ err: err.message }, 'memoria: falló leer salud local');
      }

      // 2. Fallback a Supabase si existe y en local había menos de 3 lecturas
      if (!tieneSupabase) return '';
      return seguro('leer salud remota', async () => {
        const desde = new Date(Date.now() - HORAS_RESUMEN * 3_600_000).toISOString();
        const filas = await supabase.select('kerni_salud', {
          columnas: 'cpu,ram_pct,disco_pct,proceso_top,proceso_mb',
          filtros: { device_id: `eq.${deviceId}`, creado: `gte.${desde}` },
          orden: 'creado.desc', limite: 300,
        });
        return formatearResumenSalud(filas, HORAS_RESUMEN);
      }, '');
    },

    async contexto(deviceId) {
      const lista = await this.hechos(deviceId);
      const salud = await this.resumenSalud(deviceId);
      if (!lista.length && !salud) return '';
      const lineas = [
        ...lista.map((h) => `- ${limpiarNombre(h.clave)}: ${sanearParaBloque(h.valor)}`),
        ...(salud ? [`Historial de salud: ${sanearParaBloque(salud)}`] : []),
      ];
      return `<memoria>\n${lineas.join('\n')}\n</memoria>`;
    },

    async guardarHecho(deviceId, clave, valor, origen = 'persona') {
      try {
        const { c } = stmtCountHechos.get(deviceId);
        const existente = stmtHechos.all(deviceId, MAX_HECHOS + 1).some((h) => h.clave === clave);
        if (c >= MAX_HECHOS && !existente) {
          return { ok: false, error: `ya hay ${MAX_HECHOS} recuerdos; borrá alguno antes de guardar otro` };
        }
        const valorLimpio = sanearParaBloque(valor);
        const ahora = new Date().toISOString();
        stmtUpsertHecho.run(deviceId, clave, valorLimpio, origen, ahora);
        return { ok: true };
      } catch (err) {
        logger.error?.({ err: err.message }, 'memoria: falló guardar hecho');
        return { ok: false, error: 'No pude guardarlo en la memoria ahora mismo.' };
      }
    },

    async aprobarRecuerdo(deviceId, clave, valor) {
      return this.guardarHecho(deviceId, clave, valor, 'kerni');
    },

    async borrarHecho(deviceId, clave) {
      try {
        stmtDeleteHecho.run(deviceId, clave);
        return true;
      } catch { return false; }
    },

    async olvidarTodo(deviceId) {
      try {
        stmtDeleteAllHechos.run(deviceId);
        stmtDeleteAllMensajes.run(deviceId);
        stmtDeleteAllSalud.run(deviceId);
        if (tieneSupabase) {
          await seguro('olvidar salud remota', () => supabase.delete('kerni_salud', { device_id: `eq.${deviceId}` }), false);
        }
        return true;
      } catch { return false; }
    },

    async guardarTurno(deviceId, sessionId, mensaje, respuesta) {
      try {
        stmtInsertMensaje.run(deviceId, sessionId, 'user', mensaje.slice(0, 4000));
        stmtInsertMensaje.run(deviceId, sessionId, 'assistant', respuesta.slice(0, 4000));
      } catch (err) {
        logger.error?.({ err: err.message }, 'memoria: falló guardar turno');
      }
    },

    async ultimosMensajes(deviceId, max = MENSAJES_A_RETOMAR) {
      const filas = stmtUltimosMensajes.all(deviceId, max);
      const ordenadas = filas.reverse();
      while (ordenadas.length && ordenadas[0].rol !== 'user') ordenadas.shift();
      if (ordenadas.length && ordenadas.at(-1).rol !== 'assistant') ordenadas.pop();
      return ordenadas;
    },

    async registrarSalud(deviceId, snapshot) {
      const t = Date.now();
      if (t - (ultimaSalud.get(deviceId) ?? 0) < MIN_ENTRE_LECTURAS_MS) return false;
      ultimaSalud.set(deviceId, t);
      const pct = (n, d) => Math.min(100, Math.max(0, d > 0 ? (n / d) * 100 : 0));
      const top = [...snapshot.procesos].sort((a, b) => b.memoriaMb - a.memoriaMb)[0];
      const cpu = Math.min(100, Math.max(0, snapshot.cpu));
      const ram_pct = pct(snapshot.ram.usadaMb, snapshot.ram.totalMb);
      const disco_pct = pct(snapshot.disco.totalGb - snapshot.disco.libreGb, snapshot.disco.totalGb);
      const proceso_top = top ? limpiarNombre(top.nombre) : null;
      const proceso_mb = top?.memoriaMb ?? null;
      const creado = new Date().toISOString();

      try {
        stmtInsertSalud.run(deviceId, cpu, ram_pct, disco_pct, proceso_top, proceso_mb, creado);
      } catch (err) {
        logger.error?.({ err: err.message }, 'memoria: falló registrar salud local');
      }

      if (tieneSupabase) {
        seguro('guardar salud remota', async () => {
          await supabase.insert('kerni_salud', [{
            device_id: deviceId, cpu, ram_pct, disco_pct, proceso_top, proceso_mb,
          }]);
        }, null);
      }
      return true;
    },

    mantenimiento() {
      try {
        stmtDeleteSaludVieja.run(DIAS_DE_SALUD);
        stmtDeleteMensajesViejos.run(15);
      } catch (err) {
        logger.error?.({ err: err.message }, 'memoria: falló mantenimiento local');
      }
      if (tieneSupabase) {
        seguro('limpiar salud vieja remota', () =>
          supabase.delete('kerni_salud', { creado: `lt.${new Date(Date.now() - DIAS_DE_SALUD * 86_400_000).toISOString()}` }), undefined);
      }
    },

    cerrar() {
      try { db.close(); } catch {}
    },
  };
}