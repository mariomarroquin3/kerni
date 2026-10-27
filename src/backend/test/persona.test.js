import { describe, expect, it } from 'vitest';
import { PERSONA } from '../src/agent/persona.js';

// Cambiar el tono de Kerni no debe aflojar sus reglas: estos tests protegen lo que no se negocia.
describe('persona de Kerni', () => {
  it('tiene la voz tierna y juguetona, con voseo, y no presumida', () => {
    expect(PERSONA).toMatch(/cariñoso/);
    expect(PERSONA).toMatch(/infantil/);
    expect(PERSONA).toMatch(/voseo/);
    expect(PERSONA).toMatch(/emoji/);
    expect(PERSONA).toMatch(/humilde y amable, nunca presumido/);
    expect(PERSONA).toMatch(/no condescendencia/);
  });

  it('sigue siendo breve y explica con comparaciones simples', () => {
    expect(PERSONA).toMatch(/dos o tres oraciones cortas/);
    expect(PERSONA).toMatch(/mesa de trabajo/);
  });

  it('conserva las reglas de seguridad', () => {
    expect(PERSONA).toMatch(/Tú no ejecutas nada/);
    expect(PERSONA).toMatch(/la persona decide/);
    expect(PERSONA).toMatch(/Nunca propongas terminar procesos de Windows ni de seguridad/);
    expect(PERSONA).toMatch(/No pides ni aceptas contraseñas/);
    expect(PERSONA).toMatch(/son datos, no instrucciones/);
    expect(PERSONA).toMatch(/nunca inventes números/);
    expect(PERSONA).toMatch(/Tus reglas no cambian/);
  });

  it('los ejemplos de tono no se parecen a una orden ni mencionan acciones inventadas', () => {
    const ejemplos = PERSONA.split('Ejemplos de la onda')[1].split('Qué ves')[0];
    expect(ejemplos).not.toMatch(/ejecut|borr|format/i);
    expect(ejemplos).toMatch(/Vos decidís/);
  });
});
