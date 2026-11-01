// Diagnóstico de solo lectura: validación en el backend y frases que lo proponen (las mismas que en la app).
import { describe, expect, it } from 'vitest';
import { ACCIONES, ACCIONES_SIN_DATOS, validarPropuesta } from '../src/acciones.js';
import { detectarAccion } from '../src/intenciones.js';

const DIAGNOSTICO = ['ver_arranque'];

describe('diagnóstico: solo lectura, sin datos del modelo', () => {
  it('cada herramienta está en ACCIONES y en ACCIONES_SIN_DATOS, y pasa sin foto del sistema', () => {
    for (const accion of DIAGNOSTICO) {
      expect(ACCIONES).toContain(accion);
      expect(ACCIONES_SIN_DATOS).toContain(accion);
      expect(validarPropuesta({ accion, motivo: 'Ver datos del equipo' }, undefined))
        .toEqual({ ok: true, accion: { tipo: 'proponer_accion', accion, motivo: 'Ver datos del equipo' } });
    }
  });
});

describe('diagnóstico: frases que abren la tarjeta sin modelo', () => {
  it('ver_arranque', () => {
    for (const f of ['¿por qué tarda en prender?', 'cuánto tarda en prender la compu', 'por qué tarda en prender mi pc']) {
      expect(detectarAccion(f)?.accion, f).toBe('ver_arranque');
    }
    expect(detectarAccion('la compu tarda en prender')?.accion).toBe('ver_programas_inicio');
    expect(detectarAccion('por qué tarda en prender, explicame')?.accion).toBe('ver_arranque');
  });
});
