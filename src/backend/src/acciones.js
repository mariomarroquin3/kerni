import { z } from 'zod';
import { esProtegido, limpiarNombre } from './telemetria.js';

/**
 * Acciones que Kerni puede proponer. El esquema es plano (un solo objeto) porque
 * la API de Anthropic exige `type: object` en la raíz del input_schema.
 */
export const ProponerAccionSchema = z.object({
  accion: z.enum(['terminar_proceso', 'limpiar_temporales']).describe('Qué se propone hacer.'),
  pid: z.number().int().positive().optional().describe('Solo para terminar_proceso: el pid exacto del bloque <sistema>.'),
  nombre: z.string().optional().describe('Solo para terminar_proceso: el nombre exacto del proceso, como aparece en <sistema>.'),
  motivo: z.string().min(3).max(300).describe('Una frase simple para la persona: por qué conviene.'),
});

/**
 * Revisa una propuesta contra la foto del sistema de ese turno. Si el modelo
 * inventa un pid, cambia el nombre o apunta a un proceso protegido, se rechaza
 * y nunca llega a la pantalla. La app Rust vuelve a revisar antes de ejecutar.
 * @returns {{ ok: true, accion: object } | { ok: false, error: string }}
 */
export function validarPropuesta(input, snapshot) {
  const parsed = ProponerAccionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  const { accion, pid, nombre, motivo } = parsed.data;

  if (accion === 'limpiar_temporales') return { ok: true, accion: { tipo: 'proponer_accion', accion, motivo } };

  if (!pid || !nombre) return { ok: false, error: 'terminar_proceso necesita pid y nombre' };
  if (!snapshot) return { ok: false, error: 'no hay foto del sistema; no se puede verificar el proceso' };
  const proceso = snapshot.procesos.find((p) => p.pid === pid);
  if (!proceso) return { ok: false, error: `el pid ${pid} no está en la foto del sistema` };
  if (proceso.nombre.toLowerCase() !== nombre.trim().toLowerCase()) {
    return { ok: false, error: `el pid ${pid} es ${limpiarNombre(proceso.nombre)}, no ${limpiarNombre(nombre)}` };
  }
  if (esProtegido(proceso.nombre)) return { ok: false, error: `${limpiarNombre(proceso.nombre)} es un proceso protegido; no se puede cerrar` };
  return { ok: true, accion: { tipo: 'proponer_accion', accion, pid, nombre: proceso.nombre, motivo } };
}
