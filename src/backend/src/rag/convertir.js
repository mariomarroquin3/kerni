import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { textoDePdf } from './documentos.js';

/** "latitude-3120-service-manual" -> "Latitude 3120 service manual" (título legible para el .md). */
export function tituloDeArchivo(nombre) {
  const base = basename(nombre, extname(nombre)).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Documento';
}

/** Ruta del .md que corresponde a un PDF: el mismo nombre, junto al PDF o dentro de `salida`. */
export function rutaMarkdown(rutaPdf, salida) {
  const nombre = `${basename(rutaPdf, extname(rutaPdf))}.md`;
  return join(salida ? resolve(salida) : dirname(resolve(rutaPdf)), nombre);
}

/** PDFs de una carpeta (recursivo) o el PDF suelto que se pase. */
export function listarPdfs(ruta) {
  const r = resolve(ruta);
  if (!existsSync(r)) throw new Error(`No existe ${r}`);
  if (!statSync(r).isDirectory()) return extname(r).toLowerCase() === '.pdf' ? [r] : [];
  return readdirSync(r).sort().flatMap((n) => listarPdfs(join(r, n)));
}

/**
 * Convierte un PDF con texto en un .md (un título "## Página N" por página).
 * No hace OCR: un PDF escaneado no se convierte. No pisa un .md existente salvo `sobrescribir`.
 * @returns {Promise<{ estado: 'convertido'|'existe'|'escaneado'|'error', pdf: string, md?: string, paginas?: number, caracteres?: number, detalle?: string }>}
 */
export async function convertirPdf(rutaPdf, { salida, sobrescribir = false } = {}) {
  const pdf = resolve(rutaPdf);
  const md = rutaMarkdown(pdf, salida);
  if (!sobrescribir && existsSync(md)) return { estado: 'existe', pdf, md, detalle: 'ya existe el .md (usá --sobrescribir para rehacerlo)' };
  let d;
  try {
    d = await textoDePdf(readFileSync(pdf));
  } catch (err) {
    return { estado: 'error', pdf, detalle: `no pude leerlo (${err.message})` };
  }
  if (d.aviso || !d.texto) return { estado: 'escaneado', pdf, paginas: d.paginas, detalle: d.aviso ?? 'no tiene texto' };
  const contenido = `# ${tituloDeArchivo(pdf)}\n\nFuente: ${basename(pdf)} (${d.paginas} páginas)\n\n${d.texto}\n`;
  mkdirSync(dirname(md), { recursive: true });
  const parcial = `${md}.parcial`;
  writeFileSync(parcial, contenido, 'utf8');
  renameSync(parcial, md);
  return { estado: 'convertido', pdf, md, paginas: d.paginas, caracteres: contenido.length };
}

/** Convierte uno o varios PDFs. Un fallo no detiene a los demás. */
export async function convertirTodo(ruta, opciones = {}, alAvanzar = () => {}) {
  const resultados = [];
  for (const pdf of listarPdfs(ruta)) {
    const r = await convertirPdf(pdf, opciones);
    alAvanzar(r);
    resultados.push(r);
  }
  return resultados;
}
