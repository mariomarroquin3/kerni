import { z } from 'zod';

/**
 * Foto del estado de la PC que manda la app en cada turno. Es lo único que
 * Kerni "ve": el modelo no tiene acceso al equipo, solo a esta foto.
 */
export const SnapshotSchema = z.object({
  cpu: z.number().min(0).max(100),
  ram: z.object({ usadaMb: z.number().min(0), totalMb: z.number().positive() }),
  disco: z.object({ libreGb: z.number().min(0), totalGb: z.number().positive() }),
  procesos: z
    .array(
      z.object({
        pid: z.number().int().positive(),
        nombre: z.string().min(1).max(260),
        cpu: z.number().min(0),
        memoriaMb: z.number().min(0),
      }),
    )
    .max(25),
});

/** Procesos que Kerni nunca propone cerrar (la app Rust los vuelve a revisar). */
export const PROCESOS_PROTEGIDOS = new Set([
  'system', 'system idle process', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe',
  'services.exe', 'lsass.exe', 'svchost.exe', 'explorer.exe', 'dwm.exe', 'fontdrvhost.exe',
  'msmpeng.exe', 'securityhealthservice.exe', 'memory compression', 'kerni.exe',
]);

export const esProtegido = (nombre) => PROCESOS_PROTEGIDOS.has(String(nombre).trim().toLowerCase());

/** Un nombre de proceso es dato no confiable: sin saltos de línea ni caracteres de control, y corto. */
export function limpiarNombre(nombre) {
  return String(nombre)
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Resumen local de lo que Kerni ha visto en esta PC (viene del Rust). Es un
 * dato más, no se fía ciego: los números vienen ya limpios de Rust, pero el
 * schema los acota por si la app manda algo inesperado.
 */
export const HistorialSchema = z.object({
  diasDeDatos: z.number().int().positive().optional().nullable(),
  totalMuestras: z.number().int().nonnegative(),
  disco: z
    .object({
      crecimientoGbDia: z.number(),
      diasHastaLlenarse: z.number().positive().max(365).optional().nullable(),
    })
    .optional()
    .nullable(),
  horasPicoCpu: z.array(z.string().max(2)).max(2),
  horasPicoRam: z.array(z.string().max(2)).max(2),
  procesosHabituales: z
    .array(z.object({ nombre: z.string().max(80), ramPromMb: z.number().nonnegative() }))
    .max(3),
  semana: z.object({
    panicos: z.number().int().nonnegative(),
    alertasRam: z.number().int().nonnegative(),
    aprobadas: z.number().int().nonnegative(),
    rechazadas: z.number().int().nonnegative(),
  }),
});

/** Formatea el historial como un bloque `<historial>` de datos para el modelo. */
export function formatearHistorial(h) {
  const lineas = [];
  const dias = h.diasDeDatos ?? 0;
  const muestras = h.totalMuestras ?? 0;
  lineas.push(`Visto en ${dias} día(s) / ${muestras} muestras.`);
  if (h.disco?.diasHastaLlenarse != null) {
    const direccion = h.disco.crecimientoGbDia < 0 ? 'se llena en' : 'crece';
    lineas.push(`Disco ${direccion} ~${Math.abs(h.disco.crecimientoGbDia).toFixed(1)} GB/día; ${h.disco.diasHastaLlenarse} día(s) hasta llenarse.`);
  }
  if (h.horasPicoCpu.length) lineas.push(`Pico CPU a las ${h.horasPicoCpu.join(' y ')} horas.`);
  if (h.horasPicoRam.length) lineas.push(`Pico RAM a las ${h.horasPicoRam.join(' y ')} horas.`);
  if (h.procesosHabituales.length) {
    lineas.push('Procesos habituales (nombre | RAM promedio):');
    for (const p of h.procesosHabituales) lineas.push(`- ${limpiarNombre(p.nombre)} | ${p.ramPromMb.toFixed(0)} MB`);
  }
  lineas.push(`Semana: ${h.semana.panicos} pánico(s), ${h.semana.alertasRam} alerta(s) de RAM, ${h.semana.aprobadas} aprobada(s), ${h.semana.rechazadas} rechazada(s).`);
  return `<historial>\n${lineas.join('\n')}\n</historial>`;
}

/** Texto para el modelo. Va entre etiquetas para que se lea como datos. */
export function formatearSnapshot(s) {
  const pct = (a, b) => Math.round((a / b) * 100);
  const lineas = [
    `CPU: ${Math.round(s.cpu)}%`,
    `Memoria: ${Math.round(s.ram.usadaMb)} de ${Math.round(s.ram.totalMb)} MB (${pct(s.ram.usadaMb, s.ram.totalMb)}%)`,
    `Disco: ${s.disco.libreGb.toFixed(1)} GB libres de ${s.disco.totalGb.toFixed(0)} GB`,
    'Procesos que más consumen (pid | nombre | cpu | memoria):',
    ...s.procesos.map((p) => `${p.pid} | ${limpiarNombre(p.nombre)} | ${p.cpu.toFixed(1)}% | ${Math.round(p.memoriaMb)} MB`),
  ];
  return `<sistema>\n${lineas.join('\n')}\n</sistema>`;
}
