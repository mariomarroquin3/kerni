import { Rive, Layout, Fit, Alignment } from '@rive-app/canvas-single';
import kerniRiv from './assets/kerni.riv?url';

/**
 * Controla a Kerni en Rive. Contrato del rig (personaje/kerni-rive/README.md):
 *   - modo (lista): idle | sonriente | asustado | research
 *   - saludar (disparador)
 *   - mirar_x, mirar_y (número, −100 a 100)
 *
 * Si el .riv no carga, queda el SVG provisional del index.html.
 */
export function createCharacter(el) {
  let vm = null;
  let modo = 'idle';
  const canvas = el.querySelector('canvas');

  const rive = new Rive({
    src: kerniRiv,
    canvas,
    stateMachine: 'kerni',
    autoplay: true,
    autoBind: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.BottomCenter }),
    onLoad: () => {
      // Primero se muestra el canvas (estaba oculto) y después se mide; al revés queda en 0×0.
      el.classList.add('rive-listo');
      rive.resizeDrawingSurfaceToCanvas();
      vm = rive.viewModelInstance;
      aplicarModo();
    },
    onLoadError: (e) => console.warn('[rive] no cargó kerni.riv, sigue el SVG provisional', e),
  });
  new ResizeObserver(() => rive.resizeDrawingSurfaceToCanvas()).observe(canvas);

  function aplicarModo() {
    try { if (vm) vm.enum('modo').value = modo; } catch (e) { console.warn('[rive] modo', e); }
  }

  return {
    /** idle | sonriente | asustado | research */
    setModo(nuevo) {
      if (nuevo === modo) return;
      modo = nuevo;
      el.dataset.modo = nuevo;
      aplicarModo();
    },
    modo: () => modo,
    /** Disparador: saluda y vuelve solo al modo actual. */
    saludar() {
      try { vm?.trigger('saludar').trigger(); } catch (e) { console.warn('[rive] saludar', e); }
    },
    /** −100 a 100: hacia dónde miran los ojos (0 = al frente). */
    mirar(x, y) {
      try {
        if (!vm) return;
        vm.number('mirar_x').value = x;
        vm.number('mirar_y').value = y;
      } catch (e) { console.warn('[rive] mirar', e); }
    },
  };
}
