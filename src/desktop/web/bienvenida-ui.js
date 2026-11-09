// Cableado de la pantalla de bienvenida con el DOM y el backend local. La lógica pura está en bienvenida.js.
// Todo texto que viene del backend se pinta con textContent. La llave se borra del campo apenas se usa.
import { debeMostrarBienvenida, MENSAJE_PRIVACIDAD, revisarLlave, servicioPorId, SERVICIOS, textoDePrueba, textoElegida } from './bienvenida.js';

const PRUEBA_MS = 40000; // el backend corta su prueba a los 25 s
const REINTENTOS_INICIO = 8; // el backend puede tardar unos segundos en arrancar junto con la app

export function crearBienvenida({ backend, plazoMs = 15000, alCambiar = () => {}, decir = () => {} }) {
  const $ = (id) => document.getElementById(id);
  let ajustes = null;
  let ocupada = false;

  const servicioElegido = () => document.querySelector('input[name="bienvenida-servicio"]:checked')?.value ?? '';
  const estado = (texto, error = false) => {
    const p = $('bienvenida-estado');
    p.textContent = texto;
    if (error) p.setAttribute('data-error', ''); else p.removeAttribute('data-error');
  };

  async function pedir(ruta, opciones = {}, plazo = plazoMs) {
    const res = await fetch(`${backend}${ruta}`, {
      ...opciones,
      headers: opciones.body ? { 'content-type': 'application/json' } : undefined,
      signal: AbortSignal.timeout(plazo),
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok && !cuerpo.error) cuerpo.error = `El backend respondió ${res.status}.`;
    return { ok: res.ok, cuerpo };
  }

  function pintarServicio() {
    const s = servicioPorId(servicioElegido());
    const guardada = Boolean(s && ajustes?.conLlave?.includes(s.id));
    $('bienvenida-nota').textContent = s ? `${s.nota} Conseguila en ${s.dondeConseguirla}.` : '';
    $('bienvenida-llave').placeholder = guardada ? 'Ya hay una guardada; pegá otra solo si querés cambiarla' : 'Pegala acá';
  }

  function ocupar(si) {
    ocupada = si;
    for (const id of ['bienvenida-guardar', 'bienvenida-sin-ia', 'bienvenida-olvidar', 'bienvenida-cerrar']) $(id).disabled = si;
    $('bienvenida-llave').disabled = si;
  }

  function cerrar() {
    $('bienvenida-llave').value = '';
    estado('');
    $('bienvenida').hidden = true;
  }

  async function abrir({ primera = false } = {}) {
    try { ajustes = (await pedir('/ajustes')).cuerpo; } catch { ajustes = ajustes ?? {}; }
    $('bienvenida-titulo').textContent = primera ? '¡Hola, soy Kerni!' : 'Cambiar IA o llave';
    $('bienvenida-intro').textContent = primera
      ? 'Para conversar conmigo necesito una IA. Elegí cuál querés usar, o seguí sin IA.'
      : 'Elegí el servicio y pegá una llave nueva, o cambiá a uno que ya guardaste.';
    $('bienvenida-privacidad').textContent = MENSAJE_PRIVACIDAD;
    $('bienvenida-olvidar').hidden = !(ajustes?.conLlave?.length);
    const actual = SERVICIOS.some((s) => s.id === ajustes?.proveedor) ? ajustes.proveedor : SERVICIOS[0].id;
    for (const r of document.querySelectorAll('input[name="bienvenida-servicio"]')) r.checked = r.value === actual;
    $('bienvenida-llave').value = '';
    estado('');
    pintarServicio();
    $('bienvenida').hidden = false;
    $('bienvenida-llave').focus();
  }

  async function guardar() {
    if (ocupada) return;
    const id = servicioElegido();
    if (!id) return estado('Elegí un servicio.', true);
    const yaGuardada = Boolean(ajustes?.conLlave?.includes(id));
    const revision = revisarLlave($('bienvenida-llave').value, { yaGuardada });
    if (!revision.ok) return estado(revision.error, true);
    const cuerpo = { proveedor: id, ...(revision.llave ? { apiKey: revision.llave } : {}) };
    ocupar(true);
    estado('Probando la llave…');
    try {
      const prueba = (await pedir('/ajustes/probar', { method: 'POST', body: JSON.stringify(cuerpo) }, PRUEBA_MS)).cuerpo;
      const texto = textoDePrueba(prueba);
      if (!texto.ok && !texto.guardable) return estado(texto.texto, true);
      const guardado = await pedir('/ajustes', { method: 'PUT', body: JSON.stringify(cuerpo) });
      if (!guardado.ok) return estado(guardado.cuerpo.error, true);
      ajustes = guardado.cuerpo;
      cerrar();
      decir(textoElegida(ajustes), 8000);
      alCambiar();
    } catch (err) {
      estado(err?.name === 'TimeoutError' ? 'El servicio tardó demasiado. Probá de nuevo.' : 'No pude hablar con el backend de Kerni. ¿Está encendido?', true);
    } finally {
      ocupar(false);
    }
  }

  async function sinIA() {
    if (ocupada) return;
    ocupar(true);
    try {
      const r = await pedir('/ajustes', { method: 'PUT', body: JSON.stringify({ sinIA: true }) });
      if (!r.ok) return estado(r.cuerpo.error, true);
      ajustes = r.cuerpo;
      cerrar();
      decir(textoElegida(ajustes), 8000);
      alCambiar();
    } catch {
      estado('No pude hablar con el backend de Kerni. ¿Está encendido?', true);
    } finally {
      ocupar(false);
    }
  }

  async function olvidar() {
    if (ocupada || !window.confirm('¿Borrar las llaves guardadas en esta PC? Kerni seguirá sin IA hasta que pongas una nueva.')) return;
    ocupar(true);
    try {
      const r = await pedir('/ajustes', { method: 'DELETE' });
      if (!r.ok) return estado(r.cuerpo.error, true);
      ajustes = r.cuerpo;
      cerrar();
      decir('Borré tus llaves. Sigo sin IA.', 8000);
      alCambiar();
    } catch {
      estado('No pude hablar con el backend de Kerni. ¿Está encendido?', true);
    } finally {
      ocupar(false);
    }
  }

  for (const r of document.querySelectorAll('input[name="bienvenida-servicio"]')) r.addEventListener('change', pintarServicio);
  $('bienvenida-guardar').addEventListener('click', guardar);
  $('bienvenida-llave').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } });
  $('bienvenida-sin-ia').addEventListener('click', sinIA);
  $('bienvenida-olvidar').addEventListener('click', olvidar);
  $('bienvenida-cerrar').addEventListener('click', () => { if (!ocupada) cerrar(); });

  return {
    abrir,
    /** Al arrancar: si la persona nunca eligió, la bienvenida sale sola. Reintenta mientras el backend termina de encender. */
    async iniciar({ forzar = false } = {}) {
      if (forzar) return abrir({ primera: true });
      for (let i = 0; i < REINTENTOS_INICIO; i++) {
        try {
          const r = await pedir('/ajustes');
          if (r.ok) {
            ajustes = r.cuerpo;
            if (debeMostrarBienvenida(ajustes)) await abrir({ primera: true });
            return;
          }
        } catch { /* el backend aún no responde */ }
        await new Promise((ok) => setTimeout(ok, 1500));
      }
    },
  };
}
