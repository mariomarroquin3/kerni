import { describe, expect, it } from 'vitest';
import { validarPropuesta } from '../src/acciones.js';
import { esProtegido, limpiarNombre } from '../src/telemetria.js';

const cp = (n) => String.fromCodePoint(n);
const ZWSP = cp(0x200B);
const ZWJ = cp(0x200D);
const RLO = cp(0x202E);
const BOM = cp(0xFEFF);

/** Foto con procesos normales, uno protegido y nombres con trampas. */
function foto(procesos) {
  return {
    cpu: 10,
    ram: { usadaMb: 1000, totalMb: 4000 },
    disco: { libreGb: 10, totalGb: 100 },
    procesos,
  };
}

describe('nombres de procesos: lo que se ve es lo que se compara', () => {
  it('un proceso protegido sigue protegido aunque su nombre traiga ancho cero', () => {
    const nombre = `sv${ZWSP}chost.exe`;
    expect(esProtegido(nombre)).toBe(true);
    expect(esProtegido(`svchost.exe${ZWJ}`)).toBe(true);
    expect(esProtegido(`${BOM}LSASS.EXE`)).toBe(true);
    const r = validarPropuesta({ motivo: 'Motivo de prueba', accion: 'terminar_proceso', pid: 900, nombre }, foto([{ pid: 900, nombre, cpu: 1, memoriaMb: 1 }]));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/protegido/);
  });

  it('un nombre con bidi se rechaza con un mensaje claro, para cerrar y para congelar', () => {
    const nombre = `${RLO}exe.nacs`;
    const snap = foto([{ pid: 4000, nombre, cpu: 50, memoriaMb: 100 }]);
    const cerrar = validarPropuesta({ motivo: 'Motivo de prueba', accion: 'terminar_proceso', pid: 4000, nombre }, snap);
    expect(cerrar).toEqual({ ok: false, error: 'El nombre de ese proceso tiene caracteres invisibles; no lo cierro desde Kerni' });
    const congelar = validarPropuesta({ motivo: 'Motivo de prueba', accion: 'congelar_proceso', pid: 4000, nombre }, snap);
    expect(congelar.ok).toBe(false);
    expect(congelar.error).toMatch(/invisibles; no lo congelo desde Kerni/);
  });

  it('un nombre con ancho cero (no protegido) también se rechaza', () => {
    const nombre = `chro${ZWSP}me.exe`;
    const r = validarPropuesta({ motivo: 'Motivo de prueba', accion: 'terminar_proceso', pid: 4321, nombre }, foto([{ pid: 4321, nombre, cpu: 60, memoriaMb: 2400 }]));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/caracteres invisibles/);
  });

  it('un nombre con símbolos que la limpieza cambiaría (|, <) no se propone', () => {
    const nombre = 'mal.exe | 99%';
    const r = validarPropuesta({ motivo: 'Motivo de prueba', accion: 'terminar_proceso', pid: 5, nombre }, foto([{ pid: 5, nombre, cpu: 60, memoriaMb: 10 }]));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no puedo mostrar tal cual/);
  });

  it('un nombre normal produce una tarjeta cuyo nombre es exactamente el que se muestra y se compara', () => {
    const nombre = 'chrome.exe';
    const r = validarPropuesta({ motivo: 'Motivo de prueba', accion: 'terminar_proceso', pid: 4321, nombre }, foto([{ pid: 4321, nombre, cpu: 60, memoriaMb: 2400 }]));
    expect(r.ok).toBe(true);
    expect(r.accion.nombre).toBe(nombre);
    expect(r.accion.nombre).toBe(limpiarNombre(nombre));
    expect(r.accion.pid).toBe(4321);
  });

  it('el nombre que viaja en la propuesta nunca es el del modelo: sale del snapshot', () => {
    const real = 'miner.exe';
    const r = validarPropuesta({ motivo: 'Motivo de prueba', accion: 'congelar_proceso', pid: 5555, nombre: 'MINER.EXE ' }, foto([{ pid: 5555, nombre: real, cpu: 30, memoriaMb: 300 }]));
    expect(r.ok).toBe(true);
    expect(r.accion.nombre).toBe(real);
  });
});
