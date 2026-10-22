import { createHash } from 'node:crypto';

export const MAX_FRAGMENTO = 900;   // caracteres: cabe de sobra en el límite de la tabla (4000) y recupera con precisión
export const MIN_FRAGMENTO = 60;    // más corto que esto no aporta nada solo
export const OVERLAP_FRAGMENTO = 120; // caracteres de solapamiento para no perder contexto entre fragmentos contiguos

function obtenerOverlap(texto, tam = OVERLAP_FRAGMENTO) {
  if (!texto || tam <= 0) return '';
  const recorte = texto.slice(-tam).trim();
  const punto = recorte.search(/[.!?\n]\s+/);
  if (punto !== -1 && punto < recorte.length - 15) {
    return recorte.slice(punto + 2).trim();
  }
  const espacio = recorte.indexOf(' ');
  return espacio !== -1 ? recorte.slice(espacio + 1).trim() : recorte;
}

/** Texto → fragmentos { titulo, contenido }, cortando por títulos de Markdown y luego por párrafos. */
export function fragmentar(texto, max = MAX_FRAGMENTO, overlap = 0) {
  const limpio = String(texto).replace(/\r\n?/g, '\n');
  const secciones = [];
  let titulo = '';
  let acumulado = [];
  const cerrar = () => { if (acumulado.join('').trim()) secciones.push({ titulo, texto: acumulado.join('\n').trim() }); acumulado = []; };
  let enCodigo = false;
  for (const linea of limpio.split('\n')) {
    if (linea.trimStart().startsWith('```')) enCodigo = !enCodigo;
    const h = !enCodigo && linea.match(/^#{1,4}\s+(.+?)\s*#*$/);
    if (h) { cerrar(); titulo = h[1]; continue; }
    acumulado.push(linea);
  }
  cerrar();

  const fragmentos = [];
  for (const s of secciones) {
    let actual = '';
    const volcar = () => {
      if (actual.trim().length >= MIN_FRAGMENTO) fragmentos.push({ titulo: s.titulo, contenido: actual.trim() });
      actual = overlap > 0 ? obtenerOverlap(actual, overlap) : '';
    };
    for (const parrafo of s.texto.split(/\n{2,}/)) {
      // un párrafo enorme se parte por oraciones; si ni así cabe, por tamaño
      const trozos = parrafo.length <= max ? [parrafo] : (parrafo.match(/[^.!?\n]+[.!?]?\s*/g) ?? [parrafo]).flatMap((o) => (o.length <= max ? [o] : o.match(new RegExp(`.{1,${max}}`, 'gs'))));
      for (const t of trozos) {
        if (actual && actual.length + t.length + 2 > max) volcar();
        actual += (actual ? '\n\n' : '') + t.trim();
      }
    }
    volcar();
  }
  return fragmentos;
}

/** Huella estable de un fragmento: si el texto o la fuente cambian, cambia la huella. */
export const huella = (fuente, contenido) => createHash('sha256').update(`${fuente}\n${contenido}`).digest('hex');
