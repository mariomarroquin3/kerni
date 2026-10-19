import { calcularAnimo, crearDetectorPanico, modoKerni, snapshotParaBackend, sospechosos } from './estado.js';
import { createCharacter } from './character.js';
import { crearVigilanteRam } from './reglas.js';
import { responderLocal } from './intenciones.js';

const BACKEND = 'http://127.0.0.1:8788';
const CADA_MS = 2000;

const $ = (id) => document.getElementById(id);
const enTauri = Boolean(window.__TAURI_INTERNALS__);

/** Dentro de Tauri usa los comandos de Rust; en el navegador (vite) usa datos de demostración. */
async function llamar(comando, args) {
  if (enTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke(comando, args);
  }
  return demo(comando, args);
}

let tick = 0;
function demo(comando, args) {
  if (comando === 'metricas') {
    tick += 1;
    const panico = new URLSearchParams(location.search).has('panico');
    const cpu = panico ? 98 : 25 + 30 * Math.abs(Math.sin(tick / 5));
    return {
      cpu,
      ram: { usadaMb: 9800, totalMb: 16000 },
      disco: { libreGb: 120, totalGb: 476 },
      procesos: [
        { pid: 4321, nombre: 'chrome.exe', cpu: panico ? 62 : 12, memoriaMb: 2400, protegido: false },
        { pid: 5555, nombre: 'miner.exe', cpu: panico ? 31 : 2, memoriaMb: 300, protegido: false },
        { pid: 900, nombre: 'svchost.exe', cpu: 3, memoriaMb: 80, protegido: true },
      ],
    };
  }
  if (comando === 'terminar_proceso') return `Cerré ${args.nombre} (demo)`;
  if (comando === 'limpiar_temporales') return { archivos: 128, liberadoMb: 412.5 };
  return undefined;
}

const detector = crearDetectorPanico();
const personaje = createCharacter($('mascota'));

// ---------- Modo del personaje (Rive) ----------
let enPanico = false;
let pensando = false;       // esperando la respuesta del modelo
let alertaActiva = false;   // Kerni propuso algo (vigilante, modelo, disco lleno) y espera tu respuesta
let reaccionHasta = 0;      // acción exitosa: Kerni se alegra un momento
let ultimaInteraccion = Date.now();
// Sin interacción durante este tiempo, Kerni se duerme (3 min; `?sueno=5` lo baja a 5 s para ver la demo).
const SUENO_MS = Number(new URLSearchParams(location.search).get('sueno') ?? 180) * 1000;

function actualizarModo() {
  const ahora = Date.now();
  const dormido = ahora - ultimaInteraccion > SUENO_MS;
  const antes = personaje.modo();
  const nuevo = modoKerni({ panico: enPanico, alerta: alertaActiva, analizando: pensando, reaccion: ahora < reaccionHasta, dormido });
  personaje.setModo(nuevo);
  // Si se despierta (alguien lo tocó), saluda; un susto no es para saludar.
  if (antes === 'dormido' && nuevo !== 'dormido' && nuevo !== 'asustado') personaje.saludar();
}
/** Cualquier cosa que haga la persona sobre Kerni lo despierta. */
function interaccion() {
  const dormia = personaje.modo() === 'dormido';
  ultimaInteraccion = Date.now();
  if (dormia) actualizarModo();
}
for (const ev of ['pointerdown', 'pointermove', 'keydown']) document.addEventListener(ev, interaccion, { passive: true });
function reaccionar(ms = 4000) {
  reaccionHasta = Date.now() + ms;
  actualizarModo();
  setTimeout(actualizarModo, ms + 50);
}
const vigilanteRam = crearVigilanteRam();
let ultimas = null;
let pendiente = null; // acción que espera aprobación
let sessionId = null;

// ---------- Globo de texto ----------
let timerGlobo;
function decir(texto, ms = 12000) {
  const globo = $('globo');
  globo.textContent = texto; // textContent: lo que dice el modelo nunca se interpreta como HTML
  globo.hidden = false;
  clearTimeout(timerGlobo);
  timerGlobo = setTimeout(() => { globo.hidden = true; }, ms);
}

// ---------- Métricas ----------
function pintarBarra(id, pct) {
  const barra = $(id);
  barra.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  barra.className = pct >= 90 ? 'critico' : pct >= 70 ? 'alto' : '';
}

function pintar(m) {
  const ramPct = (m.ram.usadaMb / m.ram.totalMb) * 100;
  const discoPct = ((m.disco.totalGb - m.disco.libreGb) / m.disco.totalGb) * 100;
  pintarBarra('barra-cpu', m.cpu);
  pintarBarra('barra-ram', ramPct);
  pintarBarra('barra-disco', discoPct);
  $('txt-cpu').textContent = `${Math.round(m.cpu)}%`;
  $('txt-ram').textContent = `${(m.ram.usadaMb / 1024).toFixed(1)} GB`;
  $('txt-disco').textContent = `${m.disco.libreGb.toFixed(0)} GB libres`;
}

function pintarPanico(m, activo) {
  const panel = $('panico');
  panel.hidden = !activo;
  if (!activo) return;
  const lista = $('panico-lista');
  lista.replaceChildren();
  for (const p of sospechosos(m.procesos)) {
    const li = document.createElement('li');
    const nombre = document.createElement('span');
    nombre.textContent = `${p.nombre} · ${p.cpu.toFixed(0)}%`;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = 'Cerrar…';
    boton.addEventListener('click', () => proponer({
      accion: 'terminar_proceso', pid: p.pid, nombre: p.nombre,
      motivo: `Usa ${p.cpu.toFixed(0)}% de CPU mientras la PC está al tope.`,
    }));
    li.append(nombre, boton);
    lista.append(li);
  }
  if (!lista.children.length) {
    const li = document.createElement('li');
    li.textContent = 'No veo un culpable claro; puede ser Windows trabajando.';
    lista.append(li);
  }
}

let eraPanico = false;
async function actualizar() {
  try {
    const m = await llamar('metricas');
    ultimas = m;
    const panico = detector.actualizar(m.cpu);
    document.body.dataset.animo = calcularAnimo(m, panico);
    enPanico = panico;
    actualizarModo();
    pintar(m);
    pintarPanico(m, panico);
    if (panico && !eraPanico) decir('¡Ayuda! La CPU lleva rato al 95% o más. Mirá quién la está usando.', 15000);
    eraPanico = panico;

    // Vigilante de RAM por reglas: funciona sin backend ni API key.
    const alerta = vigilanteRam.revisar(m);
    if (alerta && !panico && !pendiente) {
      decir(alerta.texto, 15000);
      proponer(alerta.proponer, true);
    }
  } catch (err) {
    console.error('no pude leer las métricas', err);
  }
}

// ---------- Acciones: siempre con confirmación ----------
function describir(a) {
  return a.accion === 'terminar_proceso'
    ? `¿Cerrar ${a.nombre} (pid ${a.pid})? Si tiene trabajo sin guardar, se pierde.`
    : '¿Borrar los archivos temporales con más de 24 horas?';
}

/** `porKerni`: la propuesta es iniciativa de Kerni (no un botón que apretaste), así que se pone en alerta. */
function proponer(accion, porKerni = false) {
  pendiente = accion;
  alertaActiva = porKerni;
  actualizarModo();
  $('confirmar-texto').textContent = describir(accion);
  $('confirmar-motivo').textContent = accion.motivo ?? '';
  $('confirmar').hidden = false;
}

async function ejecutar(a) {
  if (a.accion === 'terminar_proceso') {
    const msg = await llamar('terminar_proceso', { pid: a.pid, nombre: a.nombre });
    decir(msg);
  } else if (a.accion === 'limpiar_temporales') {
    const r = await llamar('limpiar_temporales');
    decir(r.archivos
      ? `¡Rico! Me comí ${r.archivos} archivos y liberé ${r.liberadoMb.toFixed(0)} MB.`
      : 'No había temporales viejos que limpiar. Tu compu está ordenada.');
  }
}

$('aprobar').addEventListener('click', async () => {
  const a = pendiente;
  pendiente = null;
  alertaActiva = false;
  $('confirmar').hidden = true;
  if (!a) return;
  try {
    await ejecutar(a);
    reaccionar();
  } catch (err) {
    decir(`No pude hacerlo: ${err}`);
  }
  actualizar();
});

$('rechazar').addEventListener('click', () => {
  pendiente = null;
  alertaActiva = false;
  actualizarModo();
  $('confirmar').hidden = true;
  decir('Está bien, no toco nada.', 4000);
});

$('limpiar').addEventListener('click', () => proponer({
  accion: 'limpiar_temporales', motivo: 'Libera espacio sin tocar tus documentos.',
}));

// ---------- Chat ----------
$('chat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('mensaje');
  const mensaje = input.value.trim();
  if (!mensaje) return;
  input.value = '';

  // Pedidos simples (ej. "cuánto disco me queda") se responden con reglas, sin backend.
  const local = responderLocal(mensaje, ultimas);
  if (local) {
    decir(local.texto, 15000);
    if (local.proponer && !pendiente) proponer(local.proponer, true);
    return;
  }

  input.disabled = true;
  pensando = true;
  actualizarModo();
  decir('Pensando…', 30000);
  try {
    const res = await fetch(`${BACKEND}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mensaje,
        session_id: sessionId ?? undefined,
        ...(ultimas ? { snapshot: snapshotParaBackend(ultimas) } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `error ${res.status}`);
    sessionId = data.session_id;
    decir(data.respuesta, 20000);
    // Solo la última propuesta espera aprobación; la persona decide, no el modelo.
    const propuesta = data.acciones.filter((a) => a.tipo === 'proponer_accion').at(-1);
    if (propuesta) proponer(propuesta, true);
  } catch (err) {
    decir(err instanceof TypeError ? 'No logro hablar con mi cerebro (¿está encendido el backend?).' : String(err.message ?? err));
  } finally {
    pensando = false;
    actualizarModo();
    input.disabled = false;
    input.focus();
  }
});

// ---------- Ventana: zonas con clic y menú ----------
async function avisarZonas() {
  if (!enTauri) return;
  const zonas = [...document.querySelectorAll('.zona')]
    .filter((el) => !el.hidden && el.offsetParent !== null)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, ancho: r.width, alto: r.height };
    });
  try { await llamar('zonas_interactivas', { zonas }); } catch { /* aún no listo */ }
}

$('mascota').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  llamar('menu_contextual').catch(() => {});
});

setInterval(avisarZonas, 250);
actualizar();
setInterval(actualizar, CADA_MS);
decir('¡Hola! Soy Kerni. Estoy cuidando tu compu.', 6000);
setTimeout(() => personaje.saludar(), 600);
