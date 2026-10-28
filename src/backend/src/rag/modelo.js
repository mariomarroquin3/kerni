// Manuales por modelo de equipo. Los manuales de un modelo viven en `privado/<marca>-<modelo>/` (ver `npm run manuales`),
// así que la carpeta dice a qué equipo pertenece cada fragmento, sin tocar la base de datos ni reindexar.
//
// Regla: si Kerni sabe qué equipo es (o la pregunta nombra un modelo), un manual de OTRO modelo no se usa: la RAM soldada
// de una Latitude 3120 no le sirve a quien tiene otra PC. Las guías generales (sin carpeta de modelo) siempre valen.

const BONO_MODELO = 0.03;
// Palabras de marca o relleno que no identifican un modelo.
const RELLENO = new Set(['dell', 'hp', 'lenovo', 'asus', 'acer', 'msi', 'samsung', 'toshiba', 'inc', 'corporation', 'corp', 'co', 'ltd', 'computer', 'computers', 'technologies', 'pc', 'laptop', 'notebook']);

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const palabrasDe = (s) => sinTildes(s).split(/[^a-z0-9]+/).filter(Boolean);

/** "privado/dell-latitude-3120/manual.pdf" -> "dell-latitude-3120"; una guía general -> null. */
export function carpetaDeModelo(fuente) {
  const m = /^privado\/([^/]+)\//.exec(String(fuente ?? '').replaceAll('\\', '/'));
  return m ? m[1] : null;
}

/** "dell-latitude-3120" -> ["latitude", "3120"] */
export function palabrasDeModelo(carpeta) {
  return palabrasDe(carpeta).filter((p) => !RELLENO.has(p));
}

/** ¿El texto nombra ese modelo? Hacen falta todas sus palabras ("latitude" y "3120"), en cualquier orden. */
export function nombraElModelo(carpeta, texto) {
  const buscadas = palabrasDeModelo(carpeta);
  if (!buscadas.length) return false;
  const presentes = new Set(palabrasDe(texto));
  return buscadas.every((p) => presentes.has(p));
}

/**
 * Deja los fragmentos de las guías generales y los del modelo correcto (con un pequeño impulso), y descarta los manuales
 * de otros modelos cuando se sabe cuál es el equipo.
 * @param {{ fuente: string, similitud: number }[]} filas
 * @param {{ pregunta?: string, equipo?: string, k?: number }} contexto `equipo` es "fabricante modelo" ya limpio, o vacío si no se sabe
 */
export function priorizarPorModelo(filas, { pregunta = '', equipo = '', k = filas.length } = {}) {
  const sabeElEquipo = palabrasDe(equipo).length > 0;
  const texto = `${pregunta} ${equipo}`;
  const resultado = [];
  for (const f of filas) {
    const carpeta = carpetaDeModelo(f.fuente);
    if (!carpeta) { resultado.push(f); continue; }
    if (nombraElModelo(carpeta, texto)) resultado.push({ ...f, similitud: Math.min(1, f.similitud + BONO_MODELO) });
    else if (!sabeElEquipo) resultado.push(f); // no se sabe qué equipo es: no se puede decir que sobre
  }
  return resultado.sort((a, b) => b.similitud - a.similitud).slice(0, k);
}
