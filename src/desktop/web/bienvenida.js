// Pantalla de bienvenida: la persona elige qué IA usar y pega su llave. Lógica pura (sin DOM), testeable.
// La llave solo viaja al backend local (127.0.0.1) y de ahí al servicio elegido; nunca se guarda en el navegador.

export const SERVICIOS = [
  { id: 'gemini', nombre: 'Google Gemini', dondeConseguirla: 'aistudio.google.com/apikey', nota: 'Tiene plan gratuito, pero con pocos pedidos por día.' },
  { id: 'openrouter', nombre: 'OpenRouter', dondeConseguirla: 'openrouter.ai/keys', nota: 'Un solo lugar para muchos modelos; algunos son gratuitos.' },
  { id: 'anthropic', nombre: 'Anthropic (Claude)', dondeConseguirla: 'console.anthropic.com/settings/keys', nota: 'De pago: necesita créditos en la cuenta.' },
];

export const MENSAJE_PRIVACIDAD = 'La llave se guarda solo en esta PC (en la carpeta de datos de Kerni) y solo se envía al servicio que elijas.';

export const servicioPorId = (id) => SERVICIOS.find((s) => s.id === id) ?? null;

/**
 * ¿Mostrar la bienvenida al abrir la app? Solo si el backend respondió, la persona no la vio nunca
 * y no hay una IA ya elegida (por ejemplo, fijada en el .env de quien programa).
 * @param {object|null} ajustes respuesta de GET /ajustes (null si el backend no respondió)
 */
export function debeMostrarBienvenida(ajustes) {
  if (!ajustes || typeof ajustes !== 'object') return false;
  if (ajustes.origen === 'env') return false;
  return !ajustes.bienvenidaVista && !ajustes.proveedor && !ajustes.sinIA;
}

/** Revisión rápida antes de gastar un pedido: la prueba real la hace el servicio. */
export function revisarLlave(texto, { yaGuardada = false } = {}) {
  const t = String(texto ?? '').trim();
  if (!t) return yaGuardada ? { ok: true, vacia: true } : { ok: false, error: 'Pegá tu llave de API.' };
  if (/\s/.test(t)) return { ok: false, error: 'La llave no lleva espacios ni saltos de línea. Copiala completa, sin nada más.' };
  if (t.length < 16) return { ok: false, error: 'Esa llave es muy corta. Revisá que la copiaste entera.' };
  if (t.length > 400) return { ok: false, error: 'Eso es demasiado largo para ser una llave.' };
  return { ok: true, llave: t };
}

/** Texto para la persona a partir de la respuesta de POST /ajustes/probar (o de un fallo de red). */
export function textoDePrueba(r) {
  if (r?.ok) return { ok: true, texto: 'Funciona. La guardo.' };
  const error = typeof r?.error === 'string' && r.error ? r.error : 'No pude probar la llave.';
  const pista = {
    llave_invalida: 'Revisá que la llave sea de ese servicio y que la copiaste completa.',
    sin_cupo: 'La llave parece válida, pero no tiene cupo ahora. Podés guardarla igual y probar más tarde.',
    sin_red: 'Revisá tu conexión a internet.',
  }[r?.codigo] ?? '';
  return { ok: false, texto: pista ? `${error} ${pista}` : error, guardable: r?.codigo === 'sin_cupo' };
}

/** Frase corta para el globo cuando ya quedó elegida. */
export function textoElegida(ajustes) {
  if (ajustes?.sinIA) return 'Listo, sigo sin IA: respondo con mis reglas y mis guías.';
  const s = servicioPorId(ajustes?.proveedor);
  return s ? `Listo, ahora uso ${s.nombre}.` : 'Listo.';
}
