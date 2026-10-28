// Respuesta de respaldo: cuando el modelo no puede contestar (cupo gratis agotado, servicio caído) pero la base de
// conocimiento sí responde, Kerni muestra lo más parecido que hay en sus guías, tal cual y con su fuente.
// Es texto de las guías, no una respuesta del modelo: lo dice así, sin inventar nada.
import { sanearParaBloque } from '../memoria/recuerdos.js';

const MAX_FRAGMENTOS = 2;
const MAX_CARACTERES = 450;

const ENCABEZADOS = {
  sin_cupo: 'Mi cerebro en la nube llegó a su límite de hoy, pero en mis guías encontré esto que puede ayudarte:',
  fallo: 'Mi cerebro no está respondiendo ahora, pero en mis guías encontré esto que puede ayudarte:',
};
const SOLO_TARJETA = {
  sin_cupo: 'Mi cerebro en la nube llegó a su límite de hoy, pero esto lo puedo hacer sin él. Mirá la tarjeta.',
  fallo: 'Mi cerebro no está respondiendo ahora, pero esto lo puedo hacer sin él. Mirá la tarjeta.',
};
const PIE = 'Es texto de mis guías, copiado tal cual. Cuando mi cerebro vuelva, te lo explico con más calma.';

/** "privado/dell-latitude-3120/latitude-3120-service-manual.pdf" -> "Latitude 3120 service manual" */
export function nombreLegible(fuente) {
  const base = String(fuente ?? '').replaceAll('\\', '/').split('/').pop().replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[-_]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Guía';
}

/** Recorta en el último espacio para no cortar una palabra por la mitad. */
function recortar(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.lastIndexOf(' ', max);
  return `${texto.slice(0, corte > max / 2 ? corte : max).trim()}…`;
}

/**
 * @param {{ fuente: string, titulo?: string, contenido: string }[]} fragmentos los más parecidos, de mejor a peor
 * @param {'sin_cupo'|'fallo'} motivo
 * @param {boolean} hayTarjeta si además se propone una acción sin modelo
 * @returns {string|null} el texto, o null si no hay nada que mostrar
 */
export function textoDeRespaldo(fragmentos, motivo = 'fallo', hayTarjeta = false) {
  const elegidos = (fragmentos ?? []).slice(0, MAX_FRAGMENTOS).filter((f) => sanearParaBloque(f.contenido));
  if (!elegidos.length) return hayTarjeta ? (SOLO_TARJETA[motivo] ?? SOLO_TARJETA.fallo) : null;
  const items = elegidos.map((f) => {
    const donde = [nombreLegible(f.fuente), f.titulo && sanearParaBloque(f.titulo)].filter(Boolean).join(', ');
    return `• ${donde}: ${recortar(sanearParaBloque(f.contenido), MAX_CARACTERES)}`;
  });
  return [ENCABEZADOS[motivo] ?? ENCABEZADOS.fallo, ...items, PIE, ...(hayTarjeta ? ['Además te dejo la tarjeta con lo que pediste.'] : [])].join('\n\n');
}
