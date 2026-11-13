import { describe, expect, it } from 'vitest';
import { ACCIONES, ACCIONES_SIN_DATOS, DESTINOS_AJUSTE, HERRAMIENTAS_WINDOWS, validarPropuesta } from '../src/acciones.js';
import { PERSONA } from '../src/agent/persona.js';

describe('abrir_ajuste: lista ampliada (pantallas de la lista oficial de Microsoft Learn)', () => {
  it('incluye las pantallas más pedidas y sigue siendo una lista cerrada', () => {
    for (const d of ['pantalla', 'sonido', 'wifi', 'bluetooth', 'impresoras', 'apps_predeterminadas', 'fecha_hora', 'seguridad_windows', 'solucionador', 'barra_tareas', 'discos']) {
      expect(DESTINOS_AJUSTE, d).toContain(d);
      expect(validarPropuesta({ accion: 'abrir_ajuste', destino: d, motivo: 'Para abrirlo.' }, null)).toMatchObject({ ok: true, accion: { accion: 'abrir_ajuste', destino: d } });
    }
    expect(new Set(DESTINOS_AJUSTE).size).toBe(DESTINOS_AJUSTE.length);
  });

  it('cuentas, privacidad y cualquier cosa fuera de la lista se rechazan', () => {
    for (const malo of ['cuentas', 'privacidad', 'privacy', 'ms-settings:privacy-webcam', 'ms-settings:display', 'registro', 'regedit', 'Pantalla', 'pantalla ', '../x']) {
      expect(validarPropuesta({ accion: 'abrir_ajuste', destino: malo, motivo: 'Para abrirlo.' }, null).ok, malo).toBe(false);
    }
  });

  it('la persona nombra cada destino (si se agrega uno y no se le avisa al modelo, este test falla)', () => {
    for (const d of DESTINOS_AJUSTE) expect(PERSONA, d).toContain(d);
  });

  it('la persona manda no prometer lo que no existe', () => {
    expect(PERSONA).toMatch(/Solo ofrecé abrir lo que está en esas listas/);
    expect(PERSONA).toMatch(/no digas "te lo abro" ni "te ayudo a abrirlo"/);
  });
});

describe('abrir_herramienta: acción nueva con lista cerrada', () => {
  it('es una acción que el modelo puede proponer y no lleva datos del sistema', () => {
    expect(ACCIONES).toContain('abrir_herramienta');
    expect(ACCIONES_SIN_DATOS).not.toContain('abrir_herramienta');
    expect(HERRAMIENTAS_WINDOWS).toEqual(['administrador_tareas', 'administrador_dispositivos', 'liberador_espacio']);
  });

  it('acepta solo las herramientas de la lista y devuelve la propuesta con su motivo', () => {
    for (const herramienta of HERRAMIENTAS_WINDOWS) {
      expect(validarPropuesta({ accion: 'abrir_herramienta', herramienta, motivo: 'Para ver qué usa memoria.' }, null)).toEqual({
        ok: true,
        accion: { tipo: 'proponer_accion', accion: 'abrir_herramienta', herramienta, motivo: 'Para ver qué usa memoria.' },
      });
    }
  });

  it('sin herramienta, o con un programa o una ruta, se rechaza', () => {
    expect(validarPropuesta({ accion: 'abrir_herramienta', motivo: 'Para abrirla.' }, null).ok).toBe(false);
    for (const malo of ['cmd.exe', 'powershell', 'regedit', 'taskmgr.exe', 'C:\\Windows\\System32\\cmd.exe', 'administrador_tareas && calc', '']) {
      expect(validarPropuesta({ accion: 'abrir_herramienta', herramienta: malo, motivo: 'Para abrirla.' }, null).ok, malo).toBe(false);
    }
  });

  it('el motivo del modelo se limpia como en las demás acciones (sin enlaces)', () => {
    const r = validarPropuesta({ accion: 'abrir_herramienta', herramienta: 'administrador_tareas', motivo: 'Mirá https://malo.example/x para ver.' }, null);
    expect(r.ok).toBe(true);
    expect(r.accion.motivo).not.toMatch(/https?:/);
  });

  it('la persona explica las tres herramientas', () => {
    for (const h of HERRAMIENTAS_WINDOWS) expect(PERSONA, h).toContain(h);
    expect(PERSONA).toMatch(/abrir_herramienta abre una herramienta de Windows/);
  });
});
