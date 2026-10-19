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
