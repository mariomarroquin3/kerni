import { z } from 'zod';
import { esProtegido, limpiarNombre } from './telemetria.js';

/**
 * Acciones que Kerni puede proponer. El esquema es plano (un solo objeto) porque
 * la API de Anthropic exige `type: object` en la raíz del input_schema.
 */
/** Acciones que el modelo puede proponer. Quitar programas de inicio NO está: lo pide la interfaz desde su propia lista. */
export const ACCIONES = [
  'terminar_proceso',
  'limpiar_temporales',
  'ver_archivos_pesados',
  'ver_info_equipo',
  'ver_programas_inicio',
  'ver_espacio_carpetas',
  'ver_estado_red',
  'ver_actualizaciones',
  'ver_reporte_soporte',
  'ver_dispositivos_red',
  'abrir_ajuste',
  'vaciar_papelera',
];
/** Acciones que no llevan datos del sistema: la app decide qué y cuánto mirar. */
export const ACCIONES_SIN_DATOS = ACCIONES.filter((a) => a !== 'terminar_proceso' && a !== 'abrir_ajuste');
/** Lista cerrada (la misma que `direccion_de_ajuste` en Rust): el modelo nunca manda una dirección. */
export const DESTINOS_AJUSTE = ['almacenamiento', 'aplicaciones', 'inicio', 'actualizaciones', 'red', 'energia'];

export const ProponerAccionSchema = z.object({
  accion: z.enum(ACCIONES).describe('Qué se propone hacer.'),
  destino: z.enum(DESTINOS_AJUSTE).optional().describe('Solo para abrir_ajuste: qué pantalla de Configuración de Windows abrir.'),
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
  const { accion, pid, nombre, motivo, destino } = parsed.data;

  // Estas no llevan datos del sistema: la app decide qué y cuánto mirar. Casi todas son de solo lectura; limpiar_temporales
  // y vaciar_papelera borran, y por eso la persona siempre ve una tarjeta antes.
  if (ACCIONES_SIN_DATOS.includes(accion)) return { ok: true, accion: { tipo: 'proponer_accion', accion, motivo } };
  if (accion === 'abrir_ajuste') {
    if (!destino) return { ok: false, error: `abrir_ajuste necesita un destino: ${DESTINOS_AJUSTE.join(', ')}` };
    return { ok: true, accion: { tipo: 'proponer_accion', accion, destino, motivo } };
  }

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
