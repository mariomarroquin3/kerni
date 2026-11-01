import { describe, expect, it } from 'vitest';
import { GUIAS, GUIA_IDS, buscarGuia } from '../src/guias/guias.js';
import { ACCIONES, DESTINOS_AJUSTE, validarPropuesta } from '../src/acciones.js';

const EMOJI = /(?![©®™])[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/u;

describe('guías fijas: datos', () => {
  it('son exactamente las cuatro del diseño, con esos ids', () => {
    expect(GUIA_IDS).toEqual(['pc-lenta', 'impresora-fuera-de-linea', 'espacio-en-disco', 'actualizaciones-pendientes']);
  });

  it('cada guía tiene título, intro y al menos tres pasos', () => {
    for (const g of GUIAS) {
      expect(g.titulo.length).toBeGreaterThan(3);
      expect(g.intro.length).toBeGreaterThan(20);
      expect(g.pasos.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('el último paso de cada guía es de cierre y es una instrucción', () => {
    for (const g of GUIAS) {
      expect(g.pasos.at(-1).tipo).toBe('instruccion');
    }
  });

  it('los pasos tienen un tipo válido y un texto corto, en una sola línea y sin emojis', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos) {
        expect(['instruccion', 'accion']).toContain(p.tipo);
        expect(p.texto.length).toBeGreaterThan(20);
        expect(p.texto.length).toBeLessThan(260);
        expect(p.texto).not.toMatch(/[\r\n]/);
        expect(p.texto).not.toMatch(EMOJI);
      }
    }
  });

  it('un paso de instrucción no lleva propuesta y uno de acción sí', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos) {
        if (p.tipo === 'instruccion') expect(p).not.toHaveProperty('propuesta');
        else {
          expect(p.propuesta).toBeTruthy();
          expect(p.motivo.length).toBeGreaterThan(3);
        }
      }
    }
  });

  it('cada propuesta usa un nombre de ACCIONES y, si es abrir_ajuste, un destino de la lista cerrada', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos.filter((s) => s.tipo === 'accion')) {
        expect(ACCIONES).toContain(p.propuesta.accion);
        if (p.propuesta.accion === 'abrir_ajuste') expect(DESTINOS_AJUSTE).toContain(p.propuesta.destino);
        else expect(p.propuesta).not.toHaveProperty('destino');
      }
    }
  });

  it('cada propuesta pasa la validación de acciones.js (sin foto: son acciones sin datos del sistema)', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos.filter((s) => s.tipo === 'accion')) {
        const r = validarPropuesta({ ...p.propuesta, motivo: p.motivo }, null);
        expect(r.ok, `${g.id}: ${r.error}`).toBe(true);
      }
    }
  });

  it('las acciones de cada guía son las del diseño (ninguna guía propone borrar ni cerrar)', () => {
    const acciones = (id) => buscarGuia(id).pasos.filter((s) => s.tipo === 'accion').map((s) => s.propuesta.accion);
    expect(acciones('pc-lenta')).toEqual(['ver_programas_inicio', 'ver_espacio_carpetas']);
    expect(acciones('impresora-fuera-de-linea')).toEqual([]);
    expect(acciones('espacio-en-disco')).toEqual(['abrir_ajuste', 'ver_espacio_carpetas']);
    expect(acciones('actualizaciones-pendientes')).toEqual(['ver_actualizaciones']);
    const todas = GUIAS.flatMap((g) => acciones(g.id));
    expect(todas).not.toContain('terminar_proceso');
    expect(todas).not.toContain('congelar_proceso');
    expect(todas).not.toContain('vaciar_papelera');
    expect(todas).not.toContain('limpiar_temporales');
  });

  it('buscarGuia solo encuentra ids de la lista fija', () => {
    expect(buscarGuia('pc-lenta')?.id).toBe('pc-lenta');
    expect(buscarGuia('__proto__')).toBeNull();
    expect(buscarGuia('toString')).toBeNull();
    expect(buscarGuia('no-existe')).toBeNull();
  });
});
