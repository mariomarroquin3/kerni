import { z } from 'zod';

export const MAX_HECHOS = 50;
export const MAX_VALOR = 200;

/**
 * Lo que Kerni puede proponer recordar. Igual que las acciones, es una propuesta:
 * la persona la aprueba en pantalla y recién ahí se guarda.
 */
export const ProponerRecuerdoSchema = z.object({
  clave: z.string().describe('Nombre corto en minúsculas con guion bajo, ej. "uso_principal" o "nombre"'),
  valor: z.string().describe('Lo que se recuerda, en una frase corta (máximo 200 caracteres)'),
});

// Lo que nunca se guarda: llaves, contraseñas y cosas que parecen secretos.
const PARECE_SECRETO = /(api[_ -]?key|password|contrase[ñn]a|passwd|secret|token|bearer|\bsk-[\w-]{8,}|AIza[\w-]{20,}|sb_secret_|eyJ[\w-]{20,})/i;
const LARGA_OPACA = /[A-Za-z0-9_\-+/=]{32,}/;
const RUTA_CON_USUARIO = /[a-z]:\\users\\[^\\\s]+/i;

/** Sanea texto para bloques <memoria> y <conocimiento>: control, <>, >, bidireccionales, ancho cero, BOM. */
export function sanearParaBloque(texto, max) {
  const limpio = String(texto ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    // Caracteres bidireccionales, de ancho cero y BOM
    .replace(/[\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Number.isFinite(max) ? limpio.slice(0, max) : limpio;
}

/** Texto libre → una línea sin etiquetas ni caracteres de control (es dato, no instrucción). */
export function limpiarTexto(texto, max = MAX_VALOR) {
  return sanearParaBloque(texto).slice(0, max);
}

/** @returns {{ ok: true, clave: string, valor: string } | { ok: false, error: string }} */
export function validarRecuerdo(entrada) {
  const parsed = ProponerRecuerdoSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: 'faltan la clave o el valor del recuerdo' };
  const clave = parsed.data.clave.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!/^[a-z0-9_]{2,40}$/.test(clave)) return { ok: false, error: 'la clave debe ser corta: letras, números y guion bajo' };
  const valor = limpiarTexto(parsed.data.valor);
  if (!valor) return { ok: false, error: 'el valor está vacío' };
  if (parsed.data.valor.trim().length > MAX_VALOR) return { ok: false, error: `el valor es muy largo (máximo ${MAX_VALOR} caracteres)` };
  if (PARECE_SECRETO.test(valor) || PARECE_SECRETO.test(clave) || LARGA_OPACA.test(valor)) {
    return { ok: false, error: 'eso parece una contraseña o una llave; no se guarda' };
  }
  if (RUTA_CON_USUARIO.test(valor)) return { ok: false, error: 'no se guardan rutas con el nombre de usuario' };
  return { ok: true, clave, valor };
}