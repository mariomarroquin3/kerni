import { limpiarTexto, sanearParaBloque } from '../memoria/recuerdos.js';
import { fragmentar, huella } from './fragmentos.js';

export const K_POR_DEFECTO = 4;
export const SIMILITUD_MINIMA = 0.55;
export const MIN_PREGUNTA = 12;   // "hola", "gracias"… no merecen gastar un embedding
const LOTE = 16;
// En el chat el RAG es un extra: no vale la pena hacer esperar a la persona (sin reintentos y con poco tiempo).
const ESPERA_CHAT = { reintentos: 1, timeoutMs: 4000 };

const vector = (v) => `[${v.join(',')}]`;

/**
 * Base de conocimiento (RAG) sobre Supabase + pgvector.
 *  - `buscar` nunca rompe el chat: si algo falla devuelve [] y lo registra.
 *  - Lo recuperado es CONTENIDO NO CONFIABLE: entra al prompt como dato entre <conocimiento>.
 */
export function createConocimiento({ db, embeddings, logger = console }) {
  /** @returns {Promise<{fuente: string, titulo: string, contenido: string, similitud: number}[]>} */
  async function buscar(pregunta, { k = K_POR_DEFECTO, minimo = SIMILITUD_MINIMA } = {}) {
    const q = String(pregunta ?? '').trim();
    if (q.length < MIN_PREGUNTA) return [];
    try {
      const [emb] = await embeddings.embed([q.slice(0, 1000)], ESPERA_CHAT);
      return await db.rpc('kerni_buscar_conocimiento', { consulta: vector(emb), k, minimo });
    } catch (err) {
      logger.error?.({ err: err.message, codigo: err.codigo }, 'conocimiento: falló la búsqueda');
      return [];
    }
  }

  /** Bloque <conocimiento> para el prompt, o '' si no hay nada relevante. */
  async function contexto(pregunta) {
    const encontrados = await buscar(pregunta);
    if (!encontrados.length) return '';
    const items = encontrados.map((f, i) =>
      `[${i + 1}] (${sanearParaBloque(f.fuente, 80)}${f.titulo ? ` › ${sanearParaBloque(f.titulo, 80)}` : ''})\n${sanearParaBloque(f.contenido, 1200)}`);
    return `<conocimiento>\n${items.join('\n\n')}\n</conocimiento>`;
  }

  /**
   * Indexa documentos { fuente, texto }. Idempotente: solo calcula embeddings de fragmentos nuevos
   * y borra los de esa fuente que ya no están en el texto.
   * @returns {Promise<{ nuevos: number, iguales: number, borrados: number }>}
   */
  async function indexar(documentos, { alProgreso = () => {} } = {}) {
    const total = { nuevos: 0, iguales: 0, borrados: 0 };
    for (const doc of documentos) {
      const fragmentos = fragmentar(doc.texto).map((f) => ({ ...f, hash: huella(doc.fuente, f.contenido) }));
      const previos = await db.select('kerni_conocimiento', { columnas: 'hash', filtros: { fuente: `eq.${doc.fuente}` }, limite: 5000 });
      const tenidos = new Set(previos.map((p) => p.hash));
      const vigentes = new Set(fragmentos.map((f) => f.hash));
      for (const h of tenidos) {
        if (!vigentes.has(h)) { await db.delete('kerni_conocimiento', { hash: `eq.${h}` }); total.borrados++; }
      }
      const nuevos = fragmentos.filter((f) => !tenidos.has(f.hash));
      total.iguales += fragmentos.length - nuevos.length;
      for (let i = 0; i < nuevos.length; i += LOTE) {
        const lote = nuevos.slice(i, i + LOTE);
        const vectores = await embeddings.embed(lote.map((f) => (f.titulo ? `${sanearParaBloque(f.titulo)}\n${sanearParaBloque(f.contenido)}` : sanearParaBloque(f.contenido))));
        await db.upsert('kerni_conocimiento', lote.map((f, j) => ({
          fuente: sanearParaBloque(doc.fuente), titulo: sanearParaBloque(f.titulo), contenido: sanearParaBloque(f.contenido), hash: f.hash, embedding: vector(vectores[j]),
        })), 'hash');
        total.nuevos += lote.length;
      }
      alProgreso(doc.fuente, fragmentos.length);
    }
    return total;
  }

  return { habilitado: true, buscar, contexto, indexar };
}

/** Sin embeddings o sin Supabase: la misma interfaz, sin buscar nada. */
export function createConocimientoNulo() {
  return { habilitado: false, buscar: async () => [], contexto: async () => '', indexar: async () => ({ nuevos: 0, iguales: 0, borrados: 0 }) };
}
