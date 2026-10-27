import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Descarga de los manuales oficiales listados en `conocimiento/manuales.json`.
 * Los manuales tienen derechos de autor y no se suben al repositorio: van a `conocimiento/privado/`
 * (ignorada por git) y cada integrante los baja una vez con `npm run manuales`.
 *
 * Seguridad: solo https y solo desde hosts de la lista, solo se escribe dentro de `conocimiento/privado/`
 * y se rechaza lo que no empiece con la firma de un PDF.
 */
export const HOSTS_PERMITIDOS = ['dl.dell.com'];
const FIRMA_PDF = Buffer.from('%PDF-');

export function leerManifiesto(ruta) {
  const json = JSON.parse(readFileSync(ruta, 'utf8'));
  if (!Array.isArray(json.manuales)) throw new Error('manuales.json no tiene una lista "manuales"');
  return json.manuales;
}

/** @returns {{ ok: true } | { ok: false, error: string }} */
export function validarEntrada(m, raizConocimiento) {
  if (!m?.nombre || !m?.url || !m?.destino) return { ok: false, error: 'faltan nombre, url o destino' };
  let url;
  try { url = new URL(m.url); } catch { return { ok: false, error: 'la url no es válida' }; }
  if (url.protocol !== 'https:') return { ok: false, error: 'solo se descarga por https' };
  if (!HOSTS_PERMITIDOS.includes(url.hostname)) return { ok: false, error: `el sitio ${url.hostname} no está en la lista permitida` };
  const privado = resolve(raizConocimiento, 'privado');
  const destino = resolve(raizConocimiento, m.destino);
  if (!destino.startsWith(privado + sep) || !destino.toLowerCase().endsWith('.pdf')) {
    return { ok: false, error: 'el destino tiene que ser un .pdf dentro de conocimiento/privado/' };
  }
  return { ok: true };
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Baja lo que falte. Idempotente: un manual que ya está (y pesa lo esperado) no se vuelve a bajar.
 * @returns {Promise<{ nombre: string, estado: 'ya_estaba'|'descargado'|'error', detalle: string }[]>}
 */
export async function descargarManuales(manuales, raizConocimiento, { fetch: fetchFn = globalThis.fetch, timeoutMs = 180_000, alAvanzar = () => {} } = {}) {
  const resultados = [];
  for (const m of manuales) {
    const valido = validarEntrada(m, raizConocimiento);
    if (!valido.ok) { resultados.push({ nombre: m.nombre ?? '?', estado: 'error', detalle: valido.error }); continue; }
    const destino = resolve(raizConocimiento, m.destino);
    if (existsSync(destino) && statSync(destino).size >= (m.bytesMinimos ?? 1)) {
      resultados.push({ nombre: m.nombre, estado: 'ya_estaba', detalle: mb(statSync(destino).size) });
      continue;
    }
    alAvanzar(`Descargando ${m.nombre}…`);
    try {
      mkdirSync(dirname(destino), { recursive: true });
      const res = await fetchFn(m.url, { headers: { 'user-agent': 'Mozilla/5.0 (Kerni manuales)' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      if (!res.ok) throw new Error(`el sitio respondió ${res.status}`);
      const parcial = `${destino}.parcial`;
      await pipeline(Readable.fromWeb(res.body), createWriteStream(parcial));
      const cabeza = Buffer.alloc(FIRMA_PDF.length);
      const fd = openSync(parcial, 'r');
      readSync(fd, cabeza, 0, cabeza.length, 0);
      closeSync(fd);
      const tamano = statSync(parcial).size;
      if (!cabeza.equals(FIRMA_PDF)) { unlinkSync(parcial); throw new Error('lo descargado no es un PDF'); }
      if (tamano < (m.bytesMinimos ?? 1)) { unlinkSync(parcial); throw new Error(`pesa ${mb(tamano)}, menos de lo esperado: puede estar incompleto`); }
      renameSync(parcial, destino);
      resultados.push({ nombre: m.nombre, estado: 'descargado', detalle: mb(tamano) });
    } catch (err) {
      resultados.push({ nombre: m.nombre, estado: 'error', detalle: err.name === 'TimeoutError' ? 'tardó demasiado' : err.message });
    }
  }
  return resultados;
}
