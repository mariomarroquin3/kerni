import { calcularAnimo, crearDetectorPanico, crearNivelCarga, duracionGlobo, modoKerni, MODOS_REPOSO, snapshotParaBackend, sospechosos } from './estado.js';
import { createCharacter } from './character.js';
import { crearVigilanteRam } from './reglas.js';
import { enlaceParaRevisar, resumenEnlace, responderLocal } from './intenciones.js';
import { NIVELES, pistaDeArchivo, resumenArchivos, tamanoLegible } from './archivos.js';
import { describirNueva, detallePapelera, panelActualizaciones, panelEquipo, panelEspacio, panelInicio, panelRed } from './herramientas.js';

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
    // En la demo del navegador la batería se cambia con ?bateria=25 (o ?bateria=ninguna para un equipo de escritorio).
    const pedida = new URLSearchParams(location.search).get('bateria');
    const bateria = pedida === 'ninguna' ? null : { porcentaje: Number(pedida ?? 97), cargando: false, enchufada: false };
    return {
      cpu,
      bateria,
      ram: { usadaMb: 9800, totalMb: 16000 },
      disco: { libreGb: 120, totalGb: 476 },
      procesos: [
        { pid: 4321, nombre: 'chrome.exe', cpu: panico ? 62 : 12, memoriaMb: 2400, protegido: false },
        { pid: 5555, nombre: 'miner.exe', cpu: panico ? 31 : 2, memoriaMb: 300, protegido: false },
        { pid: 900, nombre: 'svchost.exe', cpu: 3, memoriaMb: 80, protegido: true },
      ],
    };
  }
  if (comando === 'info_equipo') return { fabricante: 'Dell Inc.', modelo: 'Latitude 3120', so: 'Microsoft Windows 11 Home', version: '10.0.22631', cpu: 'Intel(R) Pentium(R) Silver N6000', nucleos: 4, ramMb: 3912 };
  if (comando === 'programas_inicio') {
    return [
      { nombre: 'OneDrive', comando: '"C:/Program Files/Microsoft OneDrive/OneDrive.exe" /background', ambito: 'usuario', activo: true, puedeCambiar: true },
      { nombre: 'Spotify', comando: 'C:/Users/demo/AppData/Roaming/Spotify/Spotify.exe', ambito: 'usuario', activo: true, puedeCambiar: true },
      { nombre: 'Discord', comando: 'C:/Users/demo/AppData/Local/Discord/Update.exe', ambito: 'usuario', activo: false, puedeCambiar: true },
      { nombre: 'SecurityHealth', comando: 'C:/Windows/system32/SecurityHealthSystray.exe', ambito: 'equipo', activo: true, puedeCambiar: false },
    ];
  }
  if (comando === 'cambiar_inicio') return `${args.nombre} ${args.activar ? 'vuelve a abrirse' : 'ya no se abre'} al iniciar Windows (demo)`;
  if (comando === 'espacio_por_carpeta') {
    return { completa: true, elementos: [
      { ruta: '~/Videos/clases', nombre: 'clases', carpeta: '~/Videos', esCarpeta: true, tamanoMb: 9200, diasSinUso: 3 },
      { ruta: '~/Descargas/pelicula.mkv', nombre: 'pelicula.mkv', carpeta: '~/Descargas', esCarpeta: false, tamanoMb: 4300, diasSinUso: 310 },
      { ruta: '~/Documentos/proyectos', nombre: 'proyectos', carpeta: '~/Documentos', esCarpeta: true, tamanoMb: 1850, diasSinUso: 20 },
    ] };
  }
  if (comando === 'estado_red') return { internet: true, latenciaMs: 48, dns: true, adaptadores: [{ nombre: 'Wi-Fi', tipo: 'Wi-Fi', velocidad: '866 Mbps' }] };
  if (comando === 'actualizaciones_windows') return [{ titulo: 'Actualización acumulativa 2026-10 para Windows 11', mb: 512, critica: true, reinicio: true }, { titulo: 'Actualización de definiciones de seguridad', mb: 28, critica: false, reinicio: false }];
  if (comando === 'papelera') return { elementos: 7, mb: 120 };
  if (comando === 'vaciar_papelera') return { elementos: 7, mb: 120 };
  if (comando === 'abrir_ajuste' || comando === 'mostrar_en_carpeta') return undefined;
  if (comando === 'terminar_proceso') return `Cerré ${args.nombre} (demo)`;
  if (comando === 'limpiar_temporales') return { archivos: 128, liberadoMb: 412.5 };
  if (comando === 'archivos_pesados') {
    return {
      completa: true,
      elementos: [
        { ruta: '~/Descargas/pelicula.mkv', nombre: 'pelicula.mkv', carpeta: '~/Descargas', esCarpeta: false, tamanoMb: 4300, diasSinUso: 310 },
        { ruta: '~/Documentos/proyecto-viejo', nombre: 'proyecto-viejo', carpeta: '~/Documentos', esCarpeta: true, tamanoMb: 1850, diasSinUso: 520 },
        { ruta: '~/Escritorio/instalador.exe', nombre: 'instalador.exe', carpeta: '~/Escritorio', esCarpeta: false, tamanoMb: 640, diasSinUso: 120 },
      ],
    };
  }
  return undefined;
}

const detector = crearDetectorPanico();
const personaje = createCharacter($('mascota'));
// Solo en desarrollo (tauri dev / vite): deja que scripts/probar-tauri.mjs maneje al personaje. No existe en el build final.
if (import.meta.env?.DEV) window.__kerni = { personaje, mostrarMetricas: (v) => mostrarMetricas(v) };

// ---------- Modo del personaje (Rive) ----------
let enPanico = false;
let pensando = false;       // esperando la respuesta del modelo
let alertaActiva = false;   // Kerni propuso algo (vigilante, modelo, disco lleno) y espera tu respuesta
let reaccionHasta = 0;      // acción exitosa: Kerni se alegra un momento
let ultimaInteraccion = Date.now();
// Sin interacción durante este tiempo, Kerni se duerme (3 min; `?sueno=5` lo baja a 5 s para ver la demo).
const SUENO_MS = Number(new URLSearchParams(location.search).get('sueno') ?? 180) * 1000;
const ACTIVO_MS = 4000;      // tras tocar a Kerni, sigue opaco este tiempo antes de volver a la transparencia
const nivelCarga = crearNivelCarga({ muestras: 1 }); // la batería cambia despacio: solo hace falta la histéresis
let carga = 'alta';          // nivel de la BATERÍA (70 % o más / 30-69 % / menos): decide la cara en reposo

function actualizarModo() {
  const ahora = Date.now();
  const dormido = ahora - ultimaInteraccion > SUENO_MS;
  const antes = personaje.modo();
  const nuevo = modoKerni({ panico: enPanico, alerta: alertaActiva, analizando: pensando, reaccion: ahora < reaccionHasta, dormido, carga });
  personaje.setModo(nuevo);
  pintarReposo();
  // Si se despierta (alguien lo tocó), saluda; un susto no es para saludar.
  if (antes === 'dormido' && nuevo !== 'dormido' && nuevo !== 'asustado') personaje.saludar();
}
/** En reposo (nadie lo usa y no tiene nada que decir) Kerni se ve un poco transparente. */
function pintarReposo() {
  const activo = Date.now() - ultimaInteraccion < ACTIVO_MS;
  const ocupado = pendiente !== null || !$('globo').hidden;
  document.body.dataset.reposo = MODOS_REPOSO.includes(personaje.modo()) && !activo && !ocupado ? '1' : '0';
}

/** Cualquier cosa que haga la persona sobre Kerni lo despierta y lo vuelve opaco un rato. */
let timerReposo;
function interaccion() {
  const dormia = personaje.modo() === 'dormido';
  ultimaInteraccion = Date.now();
  if (dormia) actualizarModo();
  pintarReposo();
  clearTimeout(timerReposo);
  timerReposo = setTimeout(pintarReposo, ACTIVO_MS + 100);
}
for (const ev of ['pointerdown', 'pointermove', 'keydown']) document.addEventListener(ev, interaccion, { passive: true });

// ---------- Arrastre de la ventana con mouse ----------
// data-tauri-drag-region="deep" no siempre funciona cuando el canvas de Rive
// cubre todo el área (Rive captura los eventos antes que Tauri). Se llama a
// startDragging() explícitamente en el pointerdown del botón izquierdo.
// En el navegador (vite dev) la API no existe: se ignora silenciosamente.
$('mascota').addEventListener('pointerdown', async (e) => {
  // Solo con el botón izquierdo del mouse (0) o un solo dedo (pointerType touch).
  if (e.button !== 0) return;
  if (!enTauri) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  } catch (err) {
    // Si falla (p. ej. foco perdido), no es crítico: el arrastre simplemente no inicia.
    console.warn('[drag] startDragging falló:', err);
  }
});
function reaccionar(ms = 4000) {
  reaccionHasta = Date.now() + ms;
  actualizarModo();
  setTimeout(actualizarModo, ms + 50);
}
const vigilanteRam = crearVigilanteRam();
let ultimas = null;
let pendiente = null; // acción que espera aprobación
let sessionId = null;

// Identidad anónima de esta PC para la memoria (un UUID al azar; no es un dato personal).
function idDeEstaPc() {
  const clave = 'kerni.deviceId';
  try {
    let id = localStorage.getItem(clave);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(clave, id); }
    return id;
  } catch { return null; }
}
const deviceId = idDeEstaPc();

// ---------- Globo de texto ----------
let timerGlobo;
function ocultarGlobo() {
  $('globo').hidden = true;
  pintarReposo();
}
/** `ms` es el mínimo: si el texto es largo se queda lo que se tarda en leerlo (ver `duracionGlobo`). */
function decir(texto, ms = 15000) {
  const globo = $('globo');
  globo.textContent = texto; // textContent: lo que dice el modelo nunca se interpreta como HTML
  globo.hidden = false;
  clearTimeout(timerGlobo);
  timerGlobo = setTimeout(ocultarGlobo, duracionGlobo(texto, ms));
  pintarReposo();
}
// Mientras el puntero está encima no se cierra (para leer con calma); al salir queda unos segundos más. Un clic lo cierra.
$('globo').addEventListener('mouseenter', () => clearTimeout(timerGlobo));
$('globo').addEventListener('mouseleave', () => {
  if (!$('globo').hidden) timerGlobo = setTimeout(ocultarGlobo, 6000);
});
$('globo').addEventListener('click', () => { clearTimeout(timerGlobo); ocultarGlobo(); });

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
    // Sin batería (un equipo de escritorio) no hay nivel que mostrar: queda la cara de siempre.
    carga = m.bateria ? nivelCarga.actualizar(m.bateria.porcentaje) : 'alta';
    actualizarModo();
    pintar(m);
    pintarPanico(m, panico);
    if (panico && !eraPanico) decir('¡Ay, ay, ay! La CPU lleva rato al 95% o más y tu compu anda sudando. ¡Mirá quién la está usando!', 15000);
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
  const nueva = describirNueva(a);
  if (nueva) return nueva;
  if (a.accion === 'recordar') return `¿Querés que recuerde esto? "${a.valor}"`;
  if (a.accion === 'ver_archivos_pesados') return '¿Busco los archivos y carpetas pesados que no usás hace rato? Solo los listo en pantalla; no borro ni muevo nada.';
  if (a.accion === 'terminar_proceso') return `¿Cerrar ${a.nombre} (pid ${a.pid})? Si tiene trabajo sin guardar, se pierde.`;
  if (a.accion === 'limpiar_temporales') return '¿Borrar los archivos temporales con más de 24 horas?';
  // Una acción que esta versión de la app no conoce (por ejemplo, un backend más nuevo): se dice tal cual, nunca se disfraza de otra.
  return `¿Aprobás esto? ${a.motivo ?? a.accion}`;
}

/** `porKerni`: la propuesta es iniciativa de Kerni (no un botón que apretaste), así que se pone en alerta. */
let propuestaSeq = 0;
function proponer(accion, porKerni = false) {
  const mia = ++propuestaSeq;
  // La tarjeta de la papelera dice cuánto hay, así que primero se mide (solo lectura). Si mientras tanto salió otra tarjeta, no la pisa.
  if (accion.accion === 'vaciar_papelera' && accion.detalle === undefined) {
    (async () => {
      let detalle = '';
      try { detalle = detallePapelera(await llamar('papelera')); } catch { /* sin dato: la tarjeta lo dice sin cifras */ }
      if (mia === propuestaSeq) proponer({ ...accion, detalle }, porKerni);
    })();
    return;
  }
  pendiente = accion;
  alertaActiva = porKerni;
  actualizarModo();
  $('confirmar-texto').textContent = describir(accion);
  $('confirmar-motivo').textContent = accion.motivo ?? '';
  $('confirmar').hidden = false;
}

async function ejecutar(a) {
  if (a.accion === 'recordar') {
    const res = await fetch(`${BACKEND}/memoria/hechos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, clave: a.clave, valor: a.valor }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `error ${res.status}`);
    decir('¡Anotado! Me lo voy a acordar.');
  } else if (a.accion === 'ver_archivos_pesados') {
    await buscarArchivosPesados();
  } else if (Object.hasOwn(VISTAS, a.accion)) {
    await VISTAS[a.accion]();
  } else if (a.accion === 'abrir_ajuste') {
    await llamar('abrir_ajuste', { destino: a.destino });
    decir('Listo, te lo abrí en los ajustes de Windows.', 6000);
  } else if (a.accion === 'vaciar_papelera') {
    const r = await llamar('vaciar_papelera');
    decir(r.elementos ? `Listo, vacié la papelera y liberé ${tamanoLegible(r.mb)}.` : 'La papelera ya estaba vacía.');
  } else if (a.accion === 'cambiar_inicio') {
    decir(await llamar('cambiar_inicio', { nombre: a.nombre, activar: a.activar }));
    await verInicio();
  } else if (a.accion === 'terminar_proceso') {
    const msg = await llamar('terminar_proceso', { pid: a.pid, nombre: a.nombre });
    decir(msg);
  } else if (a.accion === 'limpiar_temporales') {
    const r = await llamar('limpiar_temporales');
    decir(r.archivos
      ? `¡Ñam! Me comí ${r.archivos} archivos y liberé ${r.liberadoMb.toFixed(0)} MB.`
      : 'No había temporales viejos que limpiar. ¡Tu compu está ordenada!');
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
    decir(`Ay, no pude hacerlo: ${err}`);
  }
  actualizar();
});

$('rechazar').addEventListener('click', () => {
  pendiente = null;
  alertaActiva = false;
  actualizarModo();
  $('confirmar').hidden = true;
  decir('Listo, no toco nada. ¡Tranqui!', 4000);
});

// ---------- Archivos pesados sin uso: solo lectura, Kerni lista y la persona decide ----------
function haceCuanto(dias) {
  if (dias < 60) return `hace ${dias} días`;
  if (dias < 365) return `hace ${Math.round(dias / 30)} meses`;
  return `hace ${(dias / 365).toFixed(1)} años`;
}

async function buscarArchivosPesados() {
  const estado = $('archivos-estado');
  const lista = $('archivos-lista');
  $('archivos').hidden = false;
  lista.replaceChildren();
  estado.textContent = 'Buscando en tus carpetas… puede tardar unos segundos.';
  try {
    const { elementos: items, completa } = await llamar('archivos_pesados');
    // Si se acabó el tiempo antes de revisar todo, se dice: la lista puede estar corta.
    if (!items.length) {
      estado.textContent = resumenArchivos(items, completa);
      decir(estado.textContent, 8000);
      return;
    }
    const resumen = resumenArchivos(items, completa);
    estado.textContent = resumen;
    decir(resumen, 20000);
    for (const a of items) {
      // Nombres y rutas vienen del disco: son datos no confiables, siempre textContent.
      const li = document.createElement('li');
      const info = document.createElement('div');
      info.className = 'archivo-info';
      const nombre = document.createElement('b');
      nombre.textContent = a.esCarpeta ? `${a.nombre} (carpeta)` : a.nombre;
      const detalle = document.createElement('small');
      detalle.textContent = `${tamanoLegible(a.tamanoMb)} · sin tocar ${haceCuanto(a.diasSinUso)} · ${a.carpeta}`;
      const pista = pistaDeArchivo(a);
      const etiqueta = document.createElement('small');
      etiqueta.className = `pista pista-${pista.nivel}`;
      etiqueta.textContent = `${NIVELES[pista.nivel]}: ${pista.texto}`;
      info.append(nombre, detalle, etiqueta);
      const ver = document.createElement('button');
      ver.type = 'button';
      ver.className = 'secundario';
      ver.textContent = 'Ver';
      ver.addEventListener('click', () => llamar('mostrar_en_carpeta', { ruta: a.ruta }).catch((err) => decir(String(err))));
      li.append(info, ver);
      lista.append(li);
    }
  } catch (err) {
    estado.textContent = `No pude revisar tus carpetas: ${err}`;
  }
}
$('archivos-cerrar').addEventListener('click', () => { $('archivos').hidden = true; });

// ---------- Otras herramientas: un panel con lo que se encontró; la persona decide qué hacer ----------
const ACCIONES_DEL_PANEL = {
  mostrar: (ruta) => llamar('mostrar_en_carpeta', { ruta }),
  ajuste: (destino) => llamar('abrir_ajuste', { destino }),
  // Cambiar el inicio siempre pasa por la tarjeta de confirmación.
  cambiar_inicio: ({ nombre, activar }) => proponer({ accion: 'cambiar_inicio', nombre, activar, motivo: '' }, false),
};

function boton(b, secundario = true) {
  const el = document.createElement('button');
  el.type = 'button';
  if (secundario) el.className = 'secundario';
  el.textContent = b.texto;
  el.addEventListener('click', () => Promise.resolve(Object.hasOwn(ACCIONES_DEL_PANEL, b.tipo) ? ACCIONES_DEL_PANEL[b.tipo](b.dato) : undefined).catch((err) => decir(String(err))));
  return el;
}

/** Nombres y textos vienen del sistema: son datos no confiables, siempre textContent. */
function mostrarPanel(titulo, { estado, filas, boton: extra }, hablar = true) {
  $('panel-titulo').textContent = titulo;
  $('panel-estado').textContent = estado;
  const lista = $('panel-lista');
  lista.replaceChildren();
  for (const f of filas) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'archivo-info';
    const t = document.createElement('b');
    t.textContent = f.titulo;
    info.append(t);
    if (f.detalle) {
      const d = document.createElement('small');
      d.textContent = f.detalle;
      info.append(d);
    }
    if (f.pista) {
      const p = document.createElement('small');
      p.className = 'pista';
      p.textContent = f.pista.texto;
      info.append(p);
    }
    li.append(info);
    if (f.boton) li.append(boton(f.boton));
    lista.append(li);
  }
  const bExtra = $('panel-extra');
  bExtra.hidden = !extra;
  if (extra) {
    const nuevo = bExtra.cloneNode(false);
    nuevo.textContent = extra.texto;
    nuevo.hidden = false;
    nuevo.addEventListener('click', () => Promise.resolve(Object.hasOwn(ACCIONES_DEL_PANEL, extra.tipo) ? ACCIONES_DEL_PANEL[extra.tipo](extra.dato) : undefined).catch((err) => decir(String(err))));
    bExtra.replaceWith(nuevo);
  }
  $('panel').hidden = false;
  if (hablar) decir(estado, 20000);
}

let panelSeq = 0;
async function conPanel(titulo, espera, leer, armar) {
  const mia = ++panelSeq;
  $('panel-titulo').textContent = titulo;
  $('panel-estado').textContent = espera;
  $('panel-lista').replaceChildren();
  $('panel-extra').hidden = true;
  $('panel').hidden = false;
  try {
    const resultado = armar(await leer());
    if (mia === panelSeq) mostrarPanel(titulo, resultado);
  } catch (err) {
    if (mia === panelSeq) $('panel-estado').textContent = `No pude hacerlo: ${err}`;
  }
}

const verEquipo = () => conPanel('Tu equipo', 'Mirando tu equipo…', () => llamar('info_equipo'), panelEquipo);
const verInicio = () => conPanel('Programas de inicio', 'Mirando qué se abre al iniciar…', () => llamar('programas_inicio'), panelInicio);
const verEspacio = () => conPanel('Espacio por carpeta', 'Midiendo tus carpetas… puede tardar unos segundos.', () => llamar('espacio_por_carpeta'), panelEspacio);
const verRed = () => conPanel('Estado de la red', 'Probando la conexión…', () => llamar('estado_red'), panelRed);
const verActualizaciones = () => conPanel('Actualizaciones de Windows', 'Preguntándole a Windows Update… puede tardar unos minutos.', () => llamar('actualizaciones_windows'), panelActualizaciones);
const VISTAS = {
  ver_info_equipo: verEquipo,
  ver_programas_inicio: verInicio,
  ver_espacio_carpetas: verEspacio,
  ver_estado_red: verRed,
  ver_actualizaciones: verActualizaciones,
};
$('panel-cerrar').addEventListener('click', () => { $('panel').hidden = true; });

/** Siempre con tarjeta de confirmación: nada se borra sin Aprobar. */
function pedirLimpieza() {
  proponer({ accion: 'limpiar_temporales', motivo: 'Libera espacio sin tocar tus documentos.' });
}
$('limpiar').addEventListener('click', pedirLimpieza);

// ---------- Chat ----------
$('chat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('mensaje');
  const mensaje = input.value.trim();
  if (!mensaje) return;
  input.value = '';

  // "¿Es seguro este enlace?": lo revisa el backend sin modelo (sin gastar cupo). Si no responde, lo intenta el modelo.
  const enlace = enlaceParaRevisar(mensaje);
  if (enlace) {
    decir('Revisando el enlace…', 8000);
    try {
      const res = await fetch(`${BACKEND}/enlaces/revisar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: enlace }),
      });
      if (res.ok) {
        decir(resumenEnlace(await res.json()), 25000);
        return;
      }
    } catch { /* sin backend: sigue el camino normal y el chat avisa */ }
  }

  // Pedidos simples (ej. "cuánto disco me queda") se responden con reglas, sin backend.
  const local = responderLocal(mensaje, ultimas);
  if (local) {
    decir(local.texto, 20000);
    if (local.proponer && !pendiente) proponer(local.proponer, true);
    return;
  }

  input.disabled = true;
  pensando = true;
  actualizarModo();
  decir('Mmm, dejame pensar…', 30000);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(`${BACKEND}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mensaje,
        session_id: sessionId ?? undefined,
        ...(deviceId ? { device_id: deviceId } : {}),
        ...(equipo ? { equipo: { fabricante: equipo.fabricante, modelo: equipo.modelo, so: equipo.so } } : {}),
        ...(ultimas ? { snapshot: snapshotParaBackend(ultimas) } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `error ${res.status}`);
    sessionId = data.session_id;
    decir(data.respuesta, 25000);
    // Solo la última propuesta espera aprobación; la persona decide, no el modelo.
    const propuesta = data.acciones.filter((a) => a.tipo === 'proponer_accion').at(-1);
    const recuerdo = data.acciones.find((a) => a.tipo === 'proponer_recuerdo');
    if (propuesta) proponer(propuesta, true);
    else if (recuerdo) proponer({ accion: 'recordar', clave: recuerdo.clave, valor: recuerdo.valor }, false);
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      decir('Uy, me tardé demasiado pensando. ¿Probamos de nuevo?');
    } else {
      decir(err instanceof TypeError ? 'Ay, no logro hablar con mi cerebro. ¿Está encendido el backend?' : String(err.message ?? err));
    }
  } finally {
    pensando = false;
    actualizarModo();
    input.disabled = false;
    input.focus();
  }
});

// ---------- Métricas: ocultas siempre al arrancar; se ven desde el menú del clic con dos dedos ----------
function mostrarMetricas(visible) {
  $('hud').hidden = !visible;
}
const alternarMetricas = () => mostrarMetricas($('hud').hidden);
$('alternar-metricas').addEventListener('click', () => mostrarMetricas(false));
// En el navegador (demo) no hay menú nativo: ?metricas las muestra desde el inicio.
mostrarMetricas(new URLSearchParams(location.search).has('metricas'));

// ---------- Ventana: zonas con clic y menú ----------
// Rust emite la posición física del cursor cada 66 ms ('cursor-movio').
// JS la convierte a CSS dividiendo por devicePixelRatio (siempre correcto sin
// importar el DPI del monitor) y usa elementFromPoint para saber si el cursor
// está sobre una zona interactiva (.zona). El resultado va a Rust via
// set_interactivo: Rust lo usa para llamar set_ignore_cursor_events.
// Al mover la detección a JS se evita cualquier desajuste de escala.
if (enTauri) {
  (async () => {
    const { listen } = await import('@tauri-apps/api/event');
    // Opciones del menú nativo (clic con dos dedos sobre Kerni, o el icono de la bandeja).
    await listen('alternar-metricas', alternarMetricas);
    await listen('pedir-limpiar', () => { if (!pendiente) pedirLimpieza(); });
    // La eligió la persona en el menú: se muestra directo (es solo lectura).
    await listen('pedir-archivos', buscarArchivosPesados);
    await listen('pedir-equipo', verEquipo);
    await listen('pedir-inicio', verInicio);
    await listen('pedir-espacio', verEspacio);
    await listen('pedir-red', verRed);
    await listen('pedir-actualizaciones', verActualizaciones);
    await listen('pedir-papelera', () => proponer({ accion: 'vaciar_papelera', motivo: 'Libera el espacio que ocupa la papelera.' }, false));
    await listen('cursor-movio', ({ payload }) => {
      const dpr = window.devicePixelRatio || 1;
      const x = payload.x / dpr;
      const y = payload.y / dpr;
      const el = document.elementFromPoint(x, y);
      // ¿El elemento (o algún ancestro) pertenece a una zona interactiva?
      const interactivo = el?.closest('.zona') !== null;
      llamar('set_interactivo', { interactivo }).catch(() => {});
    });
  })();
}

const menuContextual = $('menu-contextual');
const itemMetricasMenu = menuContextual.querySelector('[data-menu-accion="metricas"]');
function ocultarMenuContextual() {
  menuContextual.hidden = true;
}

$('mascota').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!enTauri) { alternarMetricas(); return; } // sin menú nativo en el navegador: el clic derecho alterna las métricas
  itemMetricasMenu.textContent = $('hud').hidden ? 'Ver métricas' : 'Ocultar métricas';
  menuContextual.hidden = false;
  const maxX = window.innerWidth - menuContextual.offsetWidth - 8;
  const maxY = window.innerHeight - menuContextual.offsetHeight - 8;
  menuContextual.style.left = `${Math.max(8, Math.min(e.clientX, maxX))}px`;
  menuContextual.style.top = `${Math.max(8, Math.min(e.clientY, maxY))}px`;
  itemMetricasMenu.focus();
});

document.addEventListener('pointerdown', (e) => {
  if (!menuContextual.hidden && !menuContextual.contains(e.target)) ocultarMenuContextual();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menuContextual.hidden) ocultarMenuContextual();
});
menuContextual.addEventListener('click', async (e) => {
  const item = e.target.closest('[data-menu-accion]');
  if (!item) return;
  ocultarMenuContextual();
  try {
    switch (item.dataset.menuAccion) {
      case 'metricas':
        alternarMetricas();
        break;
      case 'pesados':
        await buscarArchivosPesados();
        break;
      case 'limpiar':
        if (!pendiente) pedirLimpieza();
        break;
      case 'ocultar': {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().hide();
        break;
      }
      case 'cerrar': {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
        break;
      }
    }
  } catch (err) {
    console.error('[menu-contextual] No se pudo ejecutar la opción:', err);
    decir('No pude completar esa opción. Probá de nuevo.', 6000);
  }
});

actualizar();
setInterval(actualizar, CADA_MS);

// Historial de salud para la memoria: una lectura resumida cada 10 min, solo con datos reales (no la demo).
if (enTauri && deviceId) {
  setInterval(() => {
    if (!ultimas) return;
    fetch(`${BACKEND}/memoria/salud`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, snapshot: snapshotParaBackend(ultimas) }),
    }).catch(() => { /* sin backend o sin memoria: no pasa nada */ });
  }, 10 * 60_000);
}
// El modelo de la PC se lee una vez: sirve para que Kerni busque en el manual correcto. Si falla, el chat sigue igual.
let equipo = null;
(async () => { try { equipo = await llamar('info_equipo'); } catch { /* sin dato de equipo */ } })();
decir('¡Hola! Soy Kerni y estoy cuidando tu compu.', 6000);
setTimeout(() => personaje.saludar(), 600);
