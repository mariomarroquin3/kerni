import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';

export const EXTENSIONES = ['.md', '.txt', '.pdf'];
const MIN_CARACTERES_POR_PAGINA = 40; // menos que esto en promedio: casi seguro un PDF escaneado (solo imágenes)

/** Un párrafo de PDF viene cortado en renglones: se vuelve a unir y se arreglan las palabras partidas con guion. */
export function limpiarPagina(texto) {
  return String(texto)
    .replace(/\r\n?/g, '\n')
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\u0000')
    .replace(/\n/g, ' ')
    .replace(/\u0000/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * PDF → texto en Markdown con un título por página ("## Página 12"), para que cada fragmento
 * quede ubicado y el modelo pueda decir de dónde sale. No hace OCR: un PDF escaneado devuelve `aviso`.
 * @returns {Promise<{ texto: string, paginas: number, aviso?: string }>}
 */
export async function textoDePdf(contenido) {
  const pdf = await getDocumentProxy(new Uint8Array(contenido));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const paginas = text.map(limpiarPagina);
  const conTexto = paginas.reduce((s, p) => s + p.length, 0);
  const aviso = conTexto / Math.max(1, totalPages) < MIN_CARACTERES_POR_PAGINA
    ? 'casi no tiene texto: parece un PDF escaneado (imágenes). Hace falta pasarlo por OCR antes de indexarlo.'
    : undefined;
  const texto = paginas.map((p, i) => (p ? `## Página ${i + 1}\n${p}` : '')).filter(Boolean).join('\n\n');
  return { texto, paginas: totalPages, ...(aviso ? { aviso } : {}) };
}

/** @returns {Promise<{ texto: string, paginas?: number, aviso?: string }>} */
export async function leerDocumento(ruta) {
  if (extname(ruta).toLowerCase() === '.pdf') return textoDePdf(readFileSync(ruta));
  return { texto: readFileSync(ruta, 'utf8') };
}
