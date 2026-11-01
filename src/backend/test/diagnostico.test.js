// Diagnóstico de solo lectura: validación en el backend y frases que lo proponen (las mismas que en la app).
import { describe, expect, it } from 'vitest';
import { ACCIONES, ACCIONES_SIN_DATOS, validarPropuesta } from '../src/acciones.js';
import { detectarAccion } from '../src/intenciones.js';

const DIAGNOSTICO = ['ver_arranque', 'ver_salud_disco', 'ver_puntos_restauracion', 'ver_duplicados_posibles', 'ver_programas_sin_uso'];

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

describe('ver_salud_disco: frases', () => {
  it('"¿cómo está el disco?" y parecidas abren la salud; "disco lleno" sigue siendo espacio', () => {
    for (const f of ['¿cómo está el disco?', 'cómo esta mi disco', 'estado del disco', 'el disco está bien?']) {
      expect(detectarAccion(f)?.accion, f).toBe('ver_salud_disco');
    }
    expect(detectarAccion('cómo está el disco lleno')).toBeNull();
    expect(detectarAccion('cuánto espacio tengo en el disco')).toBeNull();
  });
});

describe('ver_puntos_restauracion: frases', () => {
  it('"¿puedo volver atrás si algo sale mal?" abre la lista; las explicaciones van al modelo', () => {
    for (const f of ['¿puedo volver atrás si algo sale mal?', 'quiero restaurar el sistema', 'hay puntos de restauración?']) {
      expect(detectarAccion(f)?.accion, f).toBe('ver_puntos_restauracion');
    }
    expect(detectarAccion('cómo puedo volver atrás')).toBeNull();
    expect(detectarAccion('qué es un punto de restauración')).toBeNull();
  });
});

describe('ver_duplicados_posibles: frases', () => {
  it('"archivos repetidos" abre la lista; "cómo borro duplicados" va al modelo', () => {
    for (const f of ['tengo archivos duplicados', 'busca fotos repetidas', 'hay archivos repetidos en mi compu']) {
      expect(detectarAccion(f)?.accion, f).toBe('ver_duplicados_posibles');
    }
    expect(detectarAccion('cómo borro archivos duplicados')).toBeNull();
  });
});

describe('ver_programas_sin_uso: frases', () => {
  it('programas instalados o sin usar abren la lista de programas; la explicación va al modelo', () => {
    for (const f of ['programas que no uso', 'qué programas puedo borrar', 'programas sin usar', 'qué programas tengo instalados']) {
      expect(detectarAccion(f)?.accion, f).toBe('ver_programas_sin_uso');
    }
    expect(detectarAccion('explicame por qué programas sin usar')).toBeNull();
    expect(detectarAccion('tengo archivos sin usar')?.accion).toBe('ver_archivos_pesados');
  });
});
