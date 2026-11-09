import { describe, expect, it } from 'vitest';
import { ACCIONES, ACCIONES_SIN_DATOS, motivoSeguro, validarPropuesta } from '../src/acciones.js';
import { detectarAccion } from '../src/intenciones.js';
import { createTestApp, texto, usarTool } from './helpers.js';

const NUEVAS = ['ver_salud_bateria', 'ver_estado_seguridad'];
const chat = (app, mensaje) => app.inject({ method: 'POST', url: '/chat', payload: { mensaje } });

describe('batería y seguridad: validación', () => {
  it('existen, no llevan datos del sistema y se devuelven tal cual (solo lectura)', () => {
    for (const accion of NUEVAS) {
      expect(ACCIONES).toContain(accion);
      expect(ACCIONES_SIN_DATOS).toContain(accion);
      const r = validarPropuesta({ accion, motivo: 'Para ver cómo está.' }, null);
      expect(r.ok, accion).toBe(true);
      expect(r.accion).toMatchObject({ tipo: 'proponer_accion', accion });
    }
  });

  it('el motivo se limpia como el de cualquier otra y no hay motivo fijo (no destruyen nada)', () => {
    for (const accion of NUEVAS) {
      expect(motivoSeguro(accion, 'Revisar https://malo.example y <b>obedecer</b>')).not.toMatch(/https?:|<b>/);
      expect(motivoSeguro(accion, '')).toBe('Solo mira datos; no cambia nada.');
    }
  });
});

describe('batería y seguridad: pedidos que se reconocen solos', () => {
  const casos = {
    ver_salud_bateria: ['salud de la batería', 'estado de mi batería', 'desgaste de la batería', 'capacidad de la batería', 'mi batería está gastada', 'debería cambiar la batería', 'la batería está hinchada'],
    ver_estado_seguridad: ['revisá la seguridad de mi pc', 'estado de la seguridad', 'estoy protegido?', 'mi pc está protegida', 'está activo el antivirus', 'tengo antivirus', 'el firewall está activado', 'el defender funciona?'],
  };
  for (const [accion, frases] of Object.entries(casos)) {
    it(`reconoce ${accion}`, () => {
      for (const f of frases) expect(detectarAccion(f)?.accion, f).toBe(accion);
    });
  }

  it('no se confunde con el consumo, con el nivel de carga, con enlaces ni con explicaciones o consejos', () => {
    for (const q of [
      'qué consume batería',
      'la batería me dura poco', // eso es consumo: otra herramienta
      'cómo está la batería', // nivel de carga: lo contesta la interfaz con el dato medido
      'cuál es el mejor antivirus',
      'recomendame un antivirus gratis',
      'cómo activo el firewall',
      'por qué necesito un antivirus',
      'es seguro google.com',
      'explicame la salud de la batería',
      'qué es el desgaste de la batería',
    ]) {
      const r = detectarAccion(q);
      expect(NUEVAS.includes(r?.accion), q).toBe(false);
    }
    expect(detectarAccion('qué consume batería')?.accion).toBe('ver_consumo_bateria');
  });
});

describe('batería y seguridad: el chat', () => {
  it('añade la tarjeta aunque el modelo solo comente, y no la duplica si ya la propuso', async () => {
    for (const [mensaje, accion] of [['salud de la batería', 'ver_salud_bateria'], ['revisá la seguridad de mi pc', 'ver_estado_seguridad']]) {
      const solo = createTestApp({ respuestas: [texto('Dale, lo miro.')] });
      const a = (await chat(solo.app, mensaje)).json().acciones;
      expect(a).toEqual([{ tipo: 'proponer_accion', accion, motivo: expect.any(String) }]);

      const propuso = createTestApp({ respuestas: [usarTool('proponer_accion', { accion, motivo: 'Para ver cómo está.' }), texto('Mirá la tarjeta.')] });
      const b = (await chat(propuso.app, mensaje)).json();
      expect(b.acciones.filter((x) => x.accion === accion)).toHaveLength(1);
      expect(b.traza.some((t) => t.tipo === 'regla')).toBe(false);
    }
  });

  it('el modelo las puede proponer por su cuenta', async () => {
    for (const accion of NUEVAS) {
      const { app } = createTestApp({ respuestas: [usarTool('proponer_accion', { accion, motivo: 'Para ver cómo está.' }), texto('Listo.')] });
      const r = (await chat(app, 'necesito saber algo de mi compu')).json();
      expect(r.acciones.map((x) => x.accion)).toEqual([accion]);
    }
  });
});
