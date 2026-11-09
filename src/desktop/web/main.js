import { calcularAnimo, conInicioActivos, crearDetectorPanico, crearNivelCarga, duracionGlobo, modoKerni, MODOS_REPOSO, snapshotParaBackend, sospechosos } from './estado.js';
import { createCharacter } from './character.js';
import { estadoIA, motivoDeRespuesta } from './estado-ia.js';
import { avisoReinicio, crearVigilanteRam } from './reglas.js';
import { enlaceParaRevisar, esTiempoAgotado, MENSAJE_TARDO, resumenEnlace, responderLocal, textoDeError } from './intenciones.js';
import { NIVELES, pistaDeArchivo, resumenArchivos, tamanoLegible } from './archivos.js';
import { armarReporte, describirNueva, detalleCache, textoLimpiezaCache, detallePapelera,panelActualizaciones, panelArranque, panelConsumoBateria, panelDispositivosRed, panelDuplicados, panelEquipo, panelEspacio, panelInicio, panelPuntos, panelProgramasSinUso, panelRed, panelReporte, panelSaludBateria, panelSaludDisco, panelSeguridad } from './herramientas.js';
import { ayudaContada, contarAyuda, contarTarjeta, debeOfrecerLeccion, estadoDeHoy, listaVistos, marcarLeccion, marcarOfrecida, nivelDeXp, puedeMostrarConsejo, textoInsignia } from './progreso.js';
import { proximosConsejos, siguienteConsejo } from './consejos.js';
import { explicarAccion } from './explicaciones.js';
import { crearVigilanteEnlaces, debeLeerPortapapeles } from './vigilancia.js';
import { debeMostrarResumen, diaSV, textoResumenDiario } from './resumen.js';
import { BOTONES_GUIA, etiquetaGuia, guiaVisible, pideGuia } from './guias.js';
import { leerRespuestaSse } from './chat-stream.js';
import { crearBienvenida } from './bienvenida-ui.js';

const BACKEND = 'http://127.0.0.1:8788';
/** Ninguna llamada al backend (memoria, enlaces, salud) espera más de esto: un backend colgado no deja la app esperando. */
const PLAZO_BACKEND_MS = 15000;
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
      encendidaS: Number(new URLSearchParams(location.search).get('dias') ?? 2) * 86400,
      disco: { libreGb: 120, totalGb: 476 },
      procesos: [
        { pid: 4321, nombre: 'chrome.exe', cpu: panico ? 62 : 12, memoriaMb: 2400, protegido: false },
        { pid: 5555, nombre: 'miner.exe', cpu: panico ? 31 : 2, memoriaMb: 300, protegido: false },
        { pid: 900, nombre: 'svchost.exe', cpu: 3, memoriaMb: 80, protegido: true },
      ],
    };
  }
  if (comando === 'info_equipo') return { fabricante: 'Dell Inc.', modelo: 'Latitude 3120', so: 'Microsoft Windows 11 Home', version: '10.0.22631', cpu: 'Intel(R) Pentium(R) Silver N6000', nucleos: 4, ramMb: 3912 };
  if (comando === 'ver_salud_disco') return { discos: [{ nombre: 'SSD demo', tipo: 'SSD', gb: 476, nivel: 'sin_alertas', motivos: [], temperaturaC: 34, desgastePct: 3, erroresLectura: 0, datosParciales: false }], nota: '' };
  if (comando === 'ver_puntos_restauracion') return { puntos: [{ numero: 5, descripcion: 'Instalación de Office', fecha: '2026-10-28 18:01:00', tipo: 'instalación de un programa' }], nota: 'Solo los listo: Kerni no crea ni borra puntos de restauración.' };
  if (comando === 'ver_duplicados_posibles') return { grupos: [{ nombre: 'foto.jpg', tamanoMb: 2.1, cantidad: 2, totalMb: 4.2, copias: [{ ruta: 'C:/Users/demo/Downloads/foto.jpg', carpeta: '~/Downloads' }, { ruta: 'C:/Users/demo/Pictures/foto.jpg', carpeta: '~/Pictures' }] }], completa: true, nota: 'Mismo nombre y mismo tamaño no siempre es el mismo archivo: revisá antes de borrar.' };
  if (comando === 'ver_programas_sin_uso') return { programas: [{ nombre: 'Git', version: '2.4', editor: 'Git', instalado: '2022-03-01' }], total: 1, usoDisponible: false, nota: 'Windows no me dice cuándo usaste cada programa sin permisos de administrador, así que solo muestro cuándo se instaló.' };
  if (comando === 'ver_salud_bateria') return { tiene: true, nombre: 'DELL XPHX837', disenoMwh: 54000, cargaMwh: 36390, ciclos: 456, saludPct: 67, nivel: 'desgaste', nota: 'Conserva el 67 % de su capacidad original: ya dura bastante menos que cuando era nueva. Es esperable con el uso; si te falta autonomía, conviene pensar en cambiarla.' };
  if (comando === 'ver_estado_seguridad') return { revisiones: [{ nombre: 'Antivirus', estado: 'ok', detalle: 'Windows Defender está activo con protección en tiempo real.' }, { nombre: 'Definiciones del antivirus', estado: 'ok', detalle: 'Están al día (0 días).' }, { nombre: 'Cortafuegos', estado: 'alerta', detalle: 'El cortafuegos de Windows está apagado en: redes públicas.' }, { nombre: 'Control de cuentas (UAC)', estado: 'ok', detalle: 'Está activado: los cambios importantes te piden permiso.' }], alertas: 1, nota: 'Hay 1 cosa para revisar. Kerni solo mira: no cambia ninguna configuración.' };
  if (comando === 'ver_consumo_bateria') return { hayBateria: true, porcentaje: 62, cargando: false, enchufada: false, programas: [{ nombre: 'chrome.exe', cpuPromedio: 12.4 }], muestras: 3, nota: 'Aproximado, según la CPU de cada programa en unas pocas muestras. No mide cuánta energía gasta cada uno.' };
  if (comando === 'ver_arranque') return { duracionS: 48.2, fecha: '2026-10-31 08:02:11', programasActivos: 7, programasTotal: 12, nota: 'Lo tomé del último registro de arranque de Windows.' };
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
  if (comando === 'congelar_proceso') return `Congelé ${args.nombre} (demo). Lo pausé, no lo cerré.`;
  if (comando === 'medir_cache_navegador') return { archivos: 1280, mb: 412.5, carpetas: 4, completa: true };
  if (comando === 'limpiar_cache_navegador') return { archivos: 1280, liberadoMb: 412.5, saltados: 3, completa: true };
  if (comando === 'reanudar_proceso') return `Reanudé ${args.nombre} (demo)`;
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
let guia = null; // guía paso a paso en curso: { id, titulo, paso, total } o null (lo manda el backend)
let guiaOcupada = false; // evita dos avances seguidos con doble clic

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

// ---------- Aprendizaje: insignia de nivel y "¿Por qué?" ----------
// El XP solo llega por aprender (ayuda, consejos, lección); aprobar una acción no suma nada. El backend decide el tope.
let progreso = { disponible: null, xp: 0, xpHoy: 0, topeDiario: 20, leccionHoy: false };
let consejosActivos = leerConsejosActivos();
let consejoDeSesion = false;
let leccionEnCurso = false;

// La opción "Consejos" vive en localStorage; sin almacenamiento queda activada.
function leerConsejosActivos() {
  try { return localStorage.getItem('kerni.consejos') !== '0'; } catch { return true; }
}
function pintarMenuConsejos() {
  $('menu-consejos').textContent = consejosActivos ? 'Consejos: activados' : 'Consejos: desactivados';
}
function alternarConsejos() {
  consejosActivos = !consejosActivos;
  try { localStorage.setItem('kerni.consejos', consejosActivos ? '1' : '0'); } catch { /* sin almacenamiento: dura lo que la sesión */ }
  pintarMenuConsejos();
  pintarProgreso();
  if (!consejosActivos) $('leccion').hidden = true;
}

// ---------- Vigilar enlaces copiados (opcional, apagado por defecto) ----------
// Solo lee el portapapeles con la ventana enfocada, cada pocos segundos y con la opción encendida. Lo último visto
// vive en memoria (ver vigilancia.js). El enlace solo sale de la PC si la persona aprieta "Revisar".
const VIGILA_CADA_MS = 4000;
let vigilaEnlaces = leerVigilaEnlaces();
const vigilante = crearVigilanteEnlaces();
let timerPortapapeles = null;
function leerVigilaEnlaces() {
  try { return localStorage.getItem('kerni.vigilarEnlaces') === '1'; } catch { return false; }
}
function pintarMenuVigilaEnlaces() {
  $('menu-vigila-enlaces').textContent = vigilaEnlaces ? 'Vigilar enlaces copiados: activado' : 'Vigilar enlaces copiados: desactivado';
}
function alternarVigilaEnlaces() {
  vigilaEnlaces = !vigilaEnlaces;
  try { localStorage.setItem('kerni.vigilarEnlaces', vigilaEnlaces ? '1' : '0'); } catch { /* sin almacenamiento: dura lo que la sesión */ }
  pintarMenuVigilaEnlaces();
  arrancarVigilanciaPortapapeles();
}
function arrancarVigilanciaPortapapeles() {
  clearInterval(timerPortapapeles);
  timerPortapapeles = null;
  if (!vigilaEnlaces) return; // apagada: ni timer ni lecturas
  // Lo que ya estaba copiado al encenderla no molesta: se toma como visto.
  revisarPortapapeles({ base: true });
  timerPortapapeles = setInterval(revisarPortapapeles, VIGILA_CADA_MS);
}
async function revisarPortapapeles({ base = false } = {}) {
  if (!debeLeerPortapapeles({ activo: vigilaEnlaces, enfocada: document.hasFocus(), panico: enPanico, tarjetaAbierta: pendiente !== null })) return;
  let texto;
  try {
    texto = await navigator.clipboard.readText();
  } catch {
    return; // sin permiso o sin texto: se intenta en la próxima vuelta, sin registrar nada
  }
  if (base) { vigilante.marcarVisto(texto); return; }
  const enlace = vigilante.mirar(texto);
  if (enlace) ofrecerRevisarEnlace(enlace);
}
/** Burbuja con un botón. El texto es fijo; el enlace no se muestra ni sale de la PC hasta el clic. */
function ofrecerRevisarEnlace(enlace) {
  const globo = $('globo');
  globo.textContent = 'Copiaste un enlace. ¿Lo reviso?';
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.textContent = 'Revisar';
  boton.addEventListener('click', (e) => {
    e.stopPropagation(); // que el clic no cierre la burbuja antes de la respuesta
    revisarEnlaceCopiado(enlace);
  });
  globo.append(' ', boton);
  globo.hidden = false;
  clearTimeout(timerGlobo);
  timerGlobo = setTimeout(ocultarGlobo, 20000);
  pintarReposo();
}
async function revisarEnlaceCopiado(enlace) {
  decir('Lo reviso, un momento.', 8000);
  try {
    const res = await fetch(`${BACKEND}/enlaces/revisar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: enlace }),
      signal: AbortSignal.timeout(PLAZO_BACKEND_MS),
    });
    if (!res.ok) throw new Error('No pude revisar ese enlace ahora. Probá de nuevo más tarde.');
    decir(resumenEnlace(await res.json()), 25000);
  } catch (err) {
    decir(err instanceof TypeError ? 'No pude conectar para revisar ese enlace.' : textoDeError(err), 8000);
  }
}

function pintarProgreso() {
  const texto = textoInsignia({ xp: progreso.xp, disponible: progreso.disponible, activos: consejosActivos });
  const ancho = progreso.disponible ? nivelDeXp(progreso.xp).porcentaje : 0;
  for (const el of document.querySelectorAll('[data-insignia]')) {
    el.querySelector('.insignia-texto').textContent = texto; // textContent: el texto no se interpreta como HTML
    el.querySelector('.barra i').style.width = `${ancho}%`;
  }
}

async function cargarProgreso() {
  if (!deviceId) { progreso.disponible = false; pintarProgreso(); return; }
  try {
    const res = await fetch(`${BACKEND}/progreso?device_id=${deviceId}`, { signal: AbortSignal.timeout(PLAZO_BACKEND_MS) });
    if (res.ok) {
      const d = await res.json();
      progreso = { disponible: true, xp: d.xp, xpHoy: d.xpHoy, topeDiario: d.topeDiario, leccionHoy: d.leccionHoy };
    } else {
      progreso.disponible = false;
    }
  } catch {
    progreso.disponible = false;
  }
  pintarProgreso();
}

/** Manda un evento de la lista cerrada. Sin backend o con la memoria apagada no hace nada: la función se ve apagada. */
async function enviarEvento(evento) {
  if (!deviceId || !consejosActivos || progreso.disponible !== true) return null;
  try {
    const res = await fetch(`${BACKEND}/progreso/evento`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, evento }),
      signal: AbortSignal.timeout(PLAZO_BACKEND_MS),
    });
    if (res.status === 503) { progreso.disponible = false; pintarProgreso(); return null; }
    if (!res.ok) return null;
    const d = await res.json();
    progreso = { disponible: true, xp: d.xp, xpHoy: d.xpHoy, topeDiario: d.topeDiario, leccionHoy: d.leccionHoy };
    pintarProgreso();
    return d;
  } catch {
    return null;
  }
}

// Estado del día en este PC (localStorage, con try/catch: sin almacenamiento no pasa nada grave).
const CLAVE_HOY = 'kerni.aprendizaje.hoy';
function diaHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function estadoHoy() {
  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem(CLAVE_HOY)); } catch { /* sin almacenamiento o dato roto */ }
  return estadoDeHoy(guardado, diaHoy());
}
function guardarHoy(estado) {
  try { localStorage.setItem(CLAVE_HOY, JSON.stringify(estado)); } catch { /* idem */ }
}

// ---------- Consejos y mini-lección: static tips, one per session at most; the lesson is offered once a day ----------
const CLAVE_VISTOS = 'kerni.consejos.vistos';
function leerVistos() {
  try { return listaVistos(JSON.parse(localStorage.getItem(CLAVE_VISTOS))); } catch { return []; }
}
/** Marca el consejo como visto en este PC y lo cuenta en el backend (consejo_visto). */
function marcarVisto(id) {
  try { localStorage.setItem(CLAVE_VISTOS, JSON.stringify(listaVistos([...leerVistos(), id]))); } catch { /* sin almacenamiento */ }
  enviarEvento('consejo_visto');
}

/** Muestra un consejo si ahora se puede. Devuelve true si lo mostró. */
function mostrarConsejo() {
  const siguiente = siguienteConsejo(leerVistos());
  const puede = puedeMostrarConsejo({
    activos: consejosActivos,
    disponible: progreso.disponible === true,
    panico: enPanico,
    tarjetaAbierta: pendiente !== null,
    globoVisible: !$('globo').hidden,
    yaEnSesion: consejoDeSesion,
    hayConsejo: Boolean(siguiente),
  });
  if (!puede) return false;
  consejoDeSesion = true;
  decir(`Un consejo: ${siguiente.texto}`, 12000);
  marcarVisto(siguiente.id);
  return true;
}
/** Lo intenta al arrancar y luego cada 30 s, hasta que sale una vez en la sesión. */
function intentarConsejo() {
  if (consejoDeSesion) return;
  if (!mostrarConsejo()) setTimeout(intentarConsejo, 30000);
}

/** Una tarjeta aprobada o rechazada cuenta para la lección del día. No suma XP: solo cuenta. */
function tarjetaResuelta() {
  guardarHoy(contarTarjeta(estadoHoy()));
  setTimeout(ofrecerLeccionSiToca, 1500);
}
function ofrecerLeccionSiToca() {
  const hoy = estadoHoy();
  const puede = debeOfrecerLeccion(hoy, {
    activos: consejosActivos,
    disponible: progreso.disponible === true,
    panico: enPanico,
    tarjetaAbierta: pendiente !== null,
    hayConsejos: proximosConsejos(leerVistos(), 1).length > 0,
  });
  if (!puede) return;
  guardarHoy(marcarOfrecida(hoy));
  $('leccion').hidden = false;
}

/** Tres consejos seguidos, cada uno con su tiempo para leer; al final, la lección cuenta una vez por día. */
async function correrLeccion() {
  if (leccionEnCurso) return;
  leccionEnCurso = true;
  try {
    const tres = proximosConsejos(leerVistos(), 3);
    if (!tres.length) { decir('Ya viste todos mis consejos. ¡Buen trabajo!', 6000); return; }
    for (const [i, c] of tres.entries()) {
      const texto = `Lección ${i + 1} de ${tres.length}: ${c.texto}`;
      decir(texto, 12000);
      marcarVisto(c.id);
      await new Promise((r) => setTimeout(r, duracionGlobo(texto, 12000)));
    }
    guardarHoy(marcarLeccion(estadoHoy()));
    decir('Listo, lección terminada. ¡Buen trabajo!', 6000);
    await enviarEvento('leccion_completa');
  } finally {
    leccionEnCurso = false;
  }
}
$('leccion-si').addEventListener('click', () => { $('leccion').hidden = true; correrLeccion(); });
$('leccion-no').addEventListener('click', () => { $('leccion').hidden = true; decir('Dale, cuando quieras.', 3000); });

// ---------- Globo de texto ----------
let timerGlobo;
let animacionTipeo = null;

function cancelarTipeo() {
  if (animacionTipeo !== null) {
    cancelAnimationFrame(animacionTipeo);
    animacionTipeo = null;
  }
}

function ocultarGlobo() {
  cancelarTipeo();
  $('globo').hidden = true;
  pintarReposo();
}

/** `ms` es el mínimo: si el texto es largo se queda lo que se tarda en leerlo (ver `duracionGlobo`). */
function decir(texto, ms = 15000) {
  const globo = $('globo');
  cancelarTipeo();
  globo.hidden = false;
  clearTimeout(timerGlobo);
  timerGlobo = setTimeout(ocultarGlobo, duracionGlobo(texto, ms));
  pintarReposo();

  const reduceMovimiento = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMovimiento || !texto || texto.length <= 15) {
    globo.textContent = texto; // textContent: lo que dice el modelo nunca se interpreta como HTML
    return;
  }

  let i = 0;
  globo.textContent = '';
  const paso = Math.max(1, Math.floor(texto.length / 50));
  let ultimo = performance.now();
  function escribir(ahora) {
    if (ahora - ultimo >= 16) {
      i = Math.min(texto.length, i + paso);
      globo.textContent = texto.slice(0, i);
      ultimo = ahora;
    }
    if (i < texto.length) {
      animacionTipeo = requestAnimationFrame(escribir);
    } else {
      animacionTipeo = null;
    }
  }
  animacionTipeo = requestAnimationFrame(escribir);
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

  const badge = $('salud-badge');
  const texto = $('salud-texto');
  if (badge && texto) {
    if (m.cpu >= 90 || ramPct >= 90) {
      badge.className = 'salud-badge salud-critico';
      texto.textContent = 'Exigido';
    } else if (m.cpu >= 70 || ramPct >= 75 || discoPct >= 85) {
      badge.className = 'salud-badge salud-aviso';
      texto.textContent = 'Atención';
    } else {
      badge.className = 'salud-badge salud-optimo';
      texto.textContent = 'Óptimo';
    }
  }
}

// Filas del panel de pánico. Se reconstruyen solo si cambia el conjunto o el orden de pids: si no, una fila
// se movería bajo el puntero cada 2 s y el clic caería en otra. Entre medias solo se actualizan los números.
let panicoClave = null;
let panicoFilas = [];
function pintarPanico(m, activo) {
  const panel = $('panico');
  panel.hidden = !activo;
  if (!activo) {
    panicoClave = null;
    return;
  }
  const lista = $('panico-lista');
  // Los congelados por Kerni van aunque ya no usen CPU (congelado no gasta CPU): así se pueden reanudar.
  const congelados = new Set(m.congelados ?? []);
  const sospechosasCpu = sospechosos(m.procesos);
  const procesos = [...sospechosasCpu, ...m.procesos.filter((p) => congelados.has(p.pid) && !sospechosasCpu.some((s) => s.pid === p.pid))];
  const clave = procesos.map((p) => `${p.pid}${congelados.has(p.pid) ? 'c' : ''}`).join(',');
  if (clave === panicoClave) {
    procesos.forEach((p, i) => {
      panicoFilas[i].dato.p = p;
      panicoFilas[i].nombre.textContent = `${p.nombre} · ${p.cpu.toFixed(0)}%${congelados.has(p.pid) ? ' · congelado' : ''}`;
    });
    return;
  }
  panicoClave = clave;
  lista.replaceChildren();
  panicoFilas = procesos.map((p) => {
    const dato = { p };
    const estaCongelado = congelados.has(p.pid);
    const li = document.createElement('li');
    const nombre = document.createElement('span');
    nombre.textContent = `${p.nombre} · ${p.cpu.toFixed(0)}%${estaCongelado ? ' · congelado' : ''}`;
    li.append(nombre);
    if (estaCongelado) {
      const reanudar = document.createElement('button');
      reanudar.type = 'button';
      reanudar.textContent = 'Reanudar';
      reanudar.addEventListener('click', () => proponer({
        accion: 'reanudar_proceso', pid: dato.p.pid, nombre: dato.p.nombre, inicio: dato.p.inicio,
        motivo: 'Lo congelaste desde el modo pánico; lo vuelvo a correr.',
      }));
      li.append(reanudar);
    } else {
      const congelar = document.createElement('button');
      congelar.type = 'button';
      congelar.textContent = 'Congelar';
      congelar.addEventListener('click', () => proponer({
        accion: 'congelar_proceso', pid: dato.p.pid, nombre: dato.p.nombre, inicio: dato.p.inicio,
        motivo: `Usa ${dato.p.cpu.toFixed(0)}% de CPU; lo pauso sin cerrarlo.`,
      }));
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.textContent = 'Cerrar…';
      boton.addEventListener('click', () => proponer({
        accion: 'terminar_proceso', pid: dato.p.pid, nombre: dato.p.nombre, inicio: dato.p.inicio,
        motivo: `Usa ${dato.p.cpu.toFixed(0)}% de CPU mientras la PC está al tope.`,
      }));
      li.append(congelar, boton);
    }
    lista.append(li);
    return { nombre, dato };
  });
  if (!procesos.length) {
    const li = document.createElement('li');
    li.textContent = 'No veo un culpable claro; puede ser Windows trabajando.';
    lista.append(li);
  }
}

// ---------- Resumen diario (opcional, encendido por defecto) ----------
// Un mensaje por día, a partir de las 9:00 (El Salvador), con lo que la app ya mide. No abre tarjetas ni llama a nada.
let resumenDiarioActivo = leerResumenDiario();
function leerResumenDiario() {
  try { return localStorage.getItem('kerni.resumenDiario') !== '0'; } catch { return true; }
}
function pintarMenuResumenDiario() {
  $('menu-resumen-diario').textContent = resumenDiarioActivo ? 'Resumen diario: activado' : 'Resumen diario: desactivado';
}
function alternarResumenDiario() {
  resumenDiarioActivo = !resumenDiarioActivo;
  try { localStorage.setItem('kerni.resumenDiario', resumenDiarioActivo ? '1' : '0'); } catch { /* sin almacenamiento: dura lo que la sesión */ }
  pintarMenuResumenDiario();
}
function revisarResumenDiario(m) {
  const ahora = Date.now();
  let ultimoDia = null;
  try { ultimoDia = localStorage.getItem('kerni.resumenDiarioDia'); } catch { /* sin almacenamiento: puede repetirse en la sesión */ }
  const toca = debeMostrarResumen({
    activo: resumenDiarioActivo, ahora, ultimoDia, panico: enPanico,
    tarjetaAbierta: pendiente !== null, burbujaAbierta: !$('globo').hidden, lectura: m,
  });
  if (!toca) return;
  try { localStorage.setItem('kerni.resumenDiarioDia', diaSV(ahora)); } catch { /* idem */ }
  decir(textoResumenDiario(m), 20000);
}

let eraPanico = false;
let avisoReinicioRevisado = false;
let leyendo = null;
/** Si ya hay una lectura en curso (el ciclo y un Aprobar a la vez), se espera esa en vez de pedir otra. */
function actualizar() {
  leyendo ??= leerYPintar().finally(() => { leyendo = null; });
  return leyendo;
}
async function leerYPintar() {
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
    revisarResumenDiario(m);
    if (panico && !eraPanico) decir('¡Ay, ay, ay! La CPU lleva rato al 95% o más y tu compu anda sudando. ¡Mirá quién la está usando!', 15000);
    eraPanico = panico;

    // Vigilante de RAM por reglas: funciona sin backend ni API key.
    if (!avisoReinicioRevisado && Number.isFinite(m.encendidaS)) {
      avisoReinicioRevisado = true;
      const aviso = avisoReinicio(m.encendidaS);
      const hoy = new Date().toISOString().slice(0, 10);
      let yaAvisado = false;
      try { yaAvisado = localStorage.getItem('kerni.avisoReinicio') === hoy; } catch { /* sin almacenamiento: se avisa igual */ }
      if (aviso && !yaAvisado) {
        try { localStorage.setItem('kerni.avisoReinicio', hoy); } catch { /* idem */ }
        // Después del saludo, para que no lo pise.
        setTimeout(() => { if (!enPanico && !pendiente) decir(aviso.texto, 25000); }, 9000);
      }
    }
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
// Una tarjeta abierta NUNCA se reemplaza: si llega otra propuesta (una respuesta lenta del chat, la bandeja, la papelera
// medida tarde), espera su turno. Si no, la persona podría aprobar algo que no alcanzó a leer.
const colaPropuestas = [];
const MAX_COLA = 3;
// Aprobar no cuenta hasta que la tarjeta lleve un momento a la vista (un doble clic o un clic ya en camino no aprueba lo nuevo).
const ESPERA_APROBAR_MS = 600;
let tarjetaMostradaEn = 0;
const mismaPropuesta = (a, b) => a.accion === b.accion && a.pid === b.pid && a.nombre === b.nombre && a.inicio === b.inicio && a.destino === b.destino && a.clave === b.clave;

function proponer(accion, porKerni = false) {
  const mia = ++propuestaSeq;
  // La tarjeta de la papelera dice cuánto hay, así que primero se mide (solo lectura).
  if (accion.accion === 'vaciar_papelera' && accion.detalle === undefined) {
    (async () => {
      // Las cifras que se miden aquí son las que la persona aprueba: se mandan a Rust para comparar al vaciar.
      let medida = null;
      try { medida = await llamar('papelera'); } catch { /* sin dato: la tarjeta lo dice sin cifras */ }
      const datos = medida
        ? { detalle: detallePapelera(medida), elementos: medida.elementos, mb: medida.mb }
        : { detalle: '' };
      if (mia === propuestaSeq) proponer({ ...accion, ...datos }, porKerni);
    })();
    return;
  }
  // La caché se mide antes (solo lectura) para que la tarjeta diga cuántos MB hay. Si no hay nada, no se pregunta.
  if (accion.accion === 'limpiar_cache_navegador' && accion.detalle === undefined) {
    (async () => {
      let medida = null;
      try { medida = await llamar('medir_cache_navegador'); } catch { /* sin dato: la tarjeta lo dice sin cifras */ }
      if (mia !== propuestaSeq) return;
      if (medida && medida.archivos === 0) {
        decir('No veo caché de Chrome ni Edge que borrar.', 6000);
        return;
      }
      proponer({ ...accion, detalle: medida ? detalleCache(medida) : '' }, porKerni);
    })();
    return;
  }
  if (pendiente) {
    const repetida = mismaPropuesta(pendiente, accion) || colaPropuestas.some((p) => mismaPropuesta(p.accion, accion));
    if (!repetida && colaPropuestas.length < MAX_COLA) colaPropuestas.push({ accion, porKerni });
    return;
  }
  mostrarTarjeta(accion, porKerni);
}

function mostrarTarjeta(accion, porKerni) {
  pendiente = accion;
  alertaActiva = porKerni;
  actualizarModo();
  $('confirmar-texto').textContent = describir(accion);
  $('confirmar-motivo').textContent = accion.motivo ?? '';
  // Cada tarjeta nueva empieza con la explicación cerrada.
  $('confirmar-explicacion').hidden = true;
  $('confirmar-por-que').setAttribute('aria-expanded', 'false');
  $('leccion').hidden = true;
  $('confirmar').hidden = false;
  tarjetaMostradaEn = performance.now();
}

/** Cierra la tarjeta y, si había otra esperando, la muestra después de una pausa para que se note que es otra. */
function cerrarTarjeta() {
  pendiente = null;
  alertaActiva = false;
  $('confirmar').hidden = true;
  actualizarModo();
  const siguiente = colaPropuestas.shift();
  if (siguiente) setTimeout(() => { if (!pendiente) mostrarTarjeta(siguiente.accion, siguiente.porKerni); else colaPropuestas.unshift(siguiente); }, 400);
}

async function ejecutar(a) {
  if (a.accion === 'recordar') {
    const res = await fetch(`${BACKEND}/memoria/hechos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, clave: a.clave, valor: a.valor }),
      signal: AbortSignal.timeout(PLAZO_BACKEND_MS),
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
    const r = await llamar('vaciar_papelera', { elementos: a.elementos, mb: a.mb });
    decir(r.elementos ? `Listo, vacié la papelera y liberé ${tamanoLegible(r.mb)}.` : 'La papelera ya estaba vacía.');
  } else if (a.accion === 'cambiar_inicio') {
    decir(await llamar('cambiar_inicio', { nombre: a.nombre, activar: a.activar }));
    await verInicio();
  } else if (a.accion === 'terminar_proceso') {
    // Sin `inicio` (propuesta del modelo, que no lo trae) Rust solo compara el nombre del proceso.
    const msg = await llamar('terminar_proceso', { pid: a.pid, nombre: a.nombre, inicio: a.inicio });
    decir(msg);
  } else if (a.accion === 'limpiar_cache_navegador') {
    decir(textoLimpiezaCache(await llamar('limpiar_cache_navegador')), 8000);
  } else if (a.accion === 'congelar_proceso') {
    decir(await llamar('congelar_proceso', { pid: a.pid, nombre: a.nombre, inicio: a.inicio }), 8000);
  } else if (a.accion === 'reanudar_proceso') {
    decir(await llamar('reanudar_proceso', { pid: a.pid, nombre: a.nombre, inicio: a.inicio }), 8000);
  } else if (a.accion === 'limpiar_temporales') {
    const r = await llamar('limpiar_temporales');
    decir(r.archivos
      ? `¡Ñam! Me comí ${r.archivos} archivos y liberé ${r.liberadoMb.toFixed(0)} MB.`
      : 'No había temporales viejos que limpiar. ¡Tu compu está ordenada!');
  }
}

$('aprobar').addEventListener('click', async () => {
  if (performance.now() - tarjetaMostradaEn < ESPERA_APROBAR_MS) return;
  const a = pendiente;
  cerrarTarjeta();
  if (!a) return;
  tarjetaResuelta();
  try {
    await ejecutar(a);
    reaccionar();
  } catch (err) {
    decir(`Ay, no pude hacerlo: ${err}`);
  }
  actualizar();
});

$('rechazar').addEventListener('click', () => {
  cerrarTarjeta();
  tarjetaResuelta();
  decir('Listo, no toco nada. ¡Tranqui!', 4000);
});

// "¿Por qué?": abre la explicación de la tarjeta. Funciona aunque los consejos estén apagados; solo el XP depende de la opción.
$('confirmar-por-que').addEventListener('click', () => {
  if (!pendiente) return;
  const accion = pendiente.accion;
  const exp = $('confirmar-explicacion');
  exp.textContent = explicarAccion(accion) ?? 'Todavía no tengo una explicación para esta acción. Lo que dice la tarjeta es lo que va a pasar.';
  exp.hidden = false;
  $('confirmar-por-que').setAttribute('aria-expanded', 'true');
  // Una vez por tipo de tarjeta y día.
  const hoy = estadoHoy();
  if (consejosActivos && !ayudaContada(hoy, accion)) {
    guardarHoy(contarAyuda(hoy, accion));
    enviarEvento('ayuda_leida');
  }
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
      ver.addEventListener('click', () => llamar('mostrar_en_carpeta', { ruta: a.ruta }).catch((err) => decir(textoDeError(err))));
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
  copiar: async (texto) => {
    await navigator.clipboard.writeText(texto);
    decir('Listo, copié el resumen. Pegalo en el correo o en el chat de soporte.', 8000);
  },
  // Cambiar el inicio siempre pasa por la tarjeta de confirmación.
  cambiar_inicio: ({ nombre, activar }) => proponer({ accion: 'cambiar_inicio', nombre, activar, motivo: '' }, false),
};

function boton(b, secundario = true) {
  const el = document.createElement('button');
  el.type = 'button';
  if (secundario) el.className = 'secundario';
  el.textContent = b.texto;
  el.addEventListener('click', () => Promise.resolve(Object.hasOwn(ACCIONES_DEL_PANEL, b.tipo) ? ACCIONES_DEL_PANEL[b.tipo](b.dato) : undefined).catch((err) => decir(textoDeError(err))));
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
    if (f.largo) li.className = 'largo';
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
    nuevo.addEventListener('click', () => Promise.resolve(Object.hasOwn(ACCIONES_DEL_PANEL, extra.tipo) ? ACCIONES_DEL_PANEL[extra.tipo](extra.dato) : undefined).catch((err) => decir(textoDeError(err))));
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
// Última lista de programas de inicio que leyó la app: de ahí sale el conteo para el diagnóstico (ver estado.js).
let inicioLeido = null; // { lista, cuando } | null
async function leerInicio() {
  const lista = await llamar('programas_inicio');
  inicioLeido = { lista, cuando: Date.now() };
  return lista;
}
/** La última lectura del sistema, con el conteo de inicio si la lista es reciente. */
const lecturaConInicio = () => conInicioActivos(ultimas, inicioLeido, Date.now());
const verInicio = () => conPanel('Programas de inicio', 'Mirando qué se abre al iniciar…', leerInicio, panelInicio);
const verEspacio = () => conPanel('Espacio por carpeta', 'Midiendo tus carpetas… puede tardar unos segundos.', () => llamar('espacio_por_carpeta'), panelEspacio);
const verRed = () => conPanel('Estado de la red', 'Probando la conexión…', () => llamar('estado_red'), panelRed);
const verActualizaciones = () => conPanel('Actualizaciones de Windows', 'Preguntándole a Windows Update… puede tardar unos minutos.', () => llamar('actualizaciones_windows'), panelActualizaciones);
const verDispositivosRed = () => conPanel('Dispositivos en la red', 'Escanando la red local…', async () => {
    const resultado = await llamar('ver_dispositivos_red');
    return panelDispositivosRed(resultado.dispositivos, resultado.miIpLocal);
  }, (r) => r); // pasamos directo el resultado ya armado
const verSaludDisco = () => conPanel('Salud de tus discos', 'Mirando la salud de tus discos…', () => llamar('ver_salud_disco'), panelSaludDisco);
const verPuntos = () => conPanel('Puntos de restauración', 'Mirando los puntos de restauración…', () => llamar('ver_puntos_restauracion'), panelPuntos);
const verDuplicados = () => conPanel('Archivos repetidos', 'Buscando archivos con el mismo nombre y tamaño… puede tardar unos segundos.', () => llamar('ver_duplicados_posibles'), panelDuplicados);
const verProgramasSinUso = () => conPanel('Programas instalados', 'Leyendo la lista de programas…', () => llamar('ver_programas_sin_uso'), panelProgramasSinUso);
const verSaludBateria = () => conPanel('Salud de la batería', 'Mirando cuánto se gastó tu batería… unos segundos.', () => llamar('ver_salud_bateria'), panelSaludBateria);
const verSeguridad = () => conPanel('Seguridad de Windows', 'Revisando el antivirus y el cortafuegos…', () => llamar('ver_estado_seguridad'), panelSeguridad);
const verBateria = () => conPanel('Consumo con batería', 'Midiendo qué programas gastan más CPU… unos segundos.', () => llamar('ver_consumo_bateria'), panelConsumoBateria);
const verArranque = () => conPanel('Por qué tarda en prender', 'Mirando tu último arranque…', () => llamar('ver_arranque'), panelArranque);
/** Junta lo que ya sabe la app (equipo, memoria, disco, inicio y red). Lo que no se pueda leer simplemente no aparece. */
async function juntarReporte() {
  const seguro = async (fn) => { try { return await fn(); } catch { return undefined; } };
  const [info, inicio, red] = await Promise.all([seguro(() => llamar('info_equipo')), seguro(leerInicio), seguro(() => llamar('estado_red'))]);
  return armarReporte({ equipo: info ?? equipo ?? undefined, metricas: ultimas ?? undefined, inicio, red });
}
const verReporte = () => conPanel('Resumen para soporte técnico', 'Juntando los datos de tu equipo…', juntarReporte, panelReporte);
const VISTAS = {
  ver_reporte_soporte: verReporte,
  ver_info_equipo: verEquipo,
  ver_programas_inicio: verInicio,
  ver_espacio_carpetas: verEspacio,
  ver_estado_red: verRed,
  ver_actualizaciones: verActualizaciones,
  ver_dispositivos_red: verDispositivosRed,
  ver_arranque: verArranque,
  ver_salud_disco: verSaludDisco,
  ver_puntos_restauracion: verPuntos,
  ver_duplicados_posibles: verDuplicados,
  ver_programas_sin_uso: verProgramasSinUso,
  ver_consumo_bateria: verBateria,
  ver_salud_bateria: verSaludBateria,
  ver_estado_seguridad: verSeguridad,
};
$('panel-cerrar').addEventListener('click', () => { $('panel').hidden = true; });

function rutaMemoria(ruta) {
  const separador = ruta.includes('?') ? '&' : '?';
  return `${BACKEND}${ruta}${separador}${new URLSearchParams({ device_id: deviceId })}`;
}

async function pedirMemoria(ruta, opciones = {}) {
  if (!deviceId) throw new Error('No pude identificar esta PC para consultar su memoria.');
  const respuesta = await fetch(rutaMemoria(ruta), { ...opciones, signal: opciones.signal ?? AbortSignal.timeout(PLAZO_BACKEND_MS) });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(datos?.error ?? `No pude completar la solicitud (error ${respuesta.status}).`);
  if (!datos) throw new Error('El backend respondió con datos que no pude leer.');
  return datos;
}

function filaMemoria(lista, titulo, contenido, etiqueta, borrar) {
  const tituloTexto = String(titulo ?? 'Sin título');
  const fila = document.createElement('li');
  const info = document.createElement('div');
  info.className = 'memoria-info';
  const nombre = document.createElement('b');
  nombre.textContent = tituloTexto;
  const valor = document.createElement('span');
  valor.textContent = String(contenido ?? 'Sin detalle');
  info.append(nombre, valor);
  const botonBorrar = document.createElement('button');
  botonBorrar.type = 'button';
  botonBorrar.className = 'secundario memoria-panel-boton';
  botonBorrar.textContent = 'Borrar';
  botonBorrar.setAttribute('aria-label', `Borrar ${etiqueta}: ${tituloTexto}`);
  botonBorrar.addEventListener('click', async () => {
    botonBorrar.disabled = true;
    $('memoria-estado').textContent = `Borrando ${etiqueta}…`;
    try {
      await borrar();
      await cargarMemoria(`${etiqueta} borrado.`);
    } catch (err) {
      $('memoria-estado').textContent = `No pude borrar ${etiqueta}: ${err.message}`;
      botonBorrar.disabled = false;
    }
  });
  fila.append(info, botonBorrar);
  lista.append(fila);
}

async function cargarMemoria(mensaje = 'Cargando recuerdos…') {
  const estado = $('memoria-estado');
  const hechosLista = $('hechos-lista');
  const reflexionesLista = $('reflexiones-lista');
  $('aprendizaje-auto').disabled = true;
  $('memoria-olvidar-todo').disabled = true;
  estado.textContent = mensaje;
  hechosLista.replaceChildren();
  reflexionesLista.replaceChildren();
  try {
    const [memoria, reflexiones, ajustes] = await Promise.all([
      pedirMemoria('/memoria'),
      pedirMemoria('/memoria/reflexiones?limite=100'),
      pedirMemoria('/memoria/reflexiones/ajustes'),
    ]);
    if (!memoria.habilitada) {
      estado.textContent = 'La memoria no está habilitada en este momento.';
      return;
    }
    $('aprendizaje-auto').disabled = false;
    $('memoria-olvidar-todo').disabled = false;
    $('aprendizaje-auto').checked = Boolean(ajustes.aprendizaje_auto);
    for (const hecho of memoria.hechos ?? []) {
      filaMemoria(hechosLista, hecho.clave, hecho.valor, 'recuerdo', () => pedirMemoria(
        `/memoria/hechos/${encodeURIComponent(hecho.clave)}`,
        { method: 'DELETE' },
      ));
    }
    for (const reflexion of reflexiones.reflexiones ?? []) {
      filaMemoria(reflexionesLista, reflexion.categoria, reflexion.contenido, 'reflexión', () => pedirMemoria(
        `/memoria/reflexiones/${encodeURIComponent(reflexion.id)}`,
        { method: 'DELETE' },
      ));
    }
    if (!hechosLista.childElementCount) {
      const vacio = document.createElement('li');
      vacio.textContent = 'Todavía no hay recuerdos guardados.';
      hechosLista.append(vacio);
    }
    if (!reflexionesLista.childElementCount) {
      const vacio = document.createElement('li');
      vacio.textContent = 'Todavía no hay reflexiones aprendidas.';
      reflexionesLista.append(vacio);
    }
    estado.textContent = mensaje.endsWith('…')
      ? `${memoria.hechos?.length ?? 0} recuerdos y ${reflexiones.reflexiones?.length ?? 0} reflexiones.`
      : mensaje;
  } catch (err) {
    estado.textContent = `No pude cargar la memoria: ${err.message}`;
    console.error('[memoria] No se pudo cargar:', err);
  }
}

async function verMemoria() {
  $('panel').hidden = true;
  $('memoria-panel').hidden = false;
  await cargarMemoria();
}

$('memoria-cerrar').addEventListener('click', () => { $('memoria-panel').hidden = true; });
$('memoria-actualizar').addEventListener('click', () => { void cargarMemoria(); });
$('aprendizaje-auto').addEventListener('change', async (e) => {
  const control = e.currentTarget;
  const nuevo = control.checked;
  control.disabled = true;
  $('memoria-estado').textContent = 'Guardando el ajuste…';
  try {
    const resultado = await pedirMemoria('/memoria/reflexiones/ajustes', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, aprendizaje_auto: nuevo }),
    });
    control.checked = Boolean(resultado.aprendizaje_auto);
    $('memoria-estado').textContent = nuevo
      ? 'El aprendizaje automático está activado.'
      : 'El aprendizaje automático está desactivado.';
  } catch (err) {
    control.checked = !nuevo;
    $('memoria-estado').textContent = `No pude guardar el ajuste: ${err.message}`;
    console.error('[memoria] No se pudo guardar el ajuste:', err);
  } finally {
    control.disabled = false;
  }
});
$('memoria-olvidar-todo').addEventListener('click', async () => {
  const confirma = window.confirm('¿Borrar todo lo que Kerni guarda de esta PC? Se eliminarán los recuerdos, las reflexiones, el historial de conversación y el historial resumido de salud. Esta acción no se puede deshacer.');
  if (!confirma) return;
  const boton = $('memoria-olvidar-todo');
  boton.disabled = true;
  $('memoria-estado').textContent = 'Borrando la memoria…';
  try {
    await pedirMemoria('/memoria', { method: 'DELETE' });
    await cargarMemoria('Se borraron los recuerdos, las reflexiones y los historiales.');
  } catch (err) {
    $('memoria-estado').textContent = `No pude borrar la memoria: ${err.message}`;
    console.error('[memoria] No se pudo borrar todo:', err);
  } finally {
    boton.disabled = false;
  }
});

function responderAutomatico(mensaje) {
  const local = responderLocal(mensaje, lecturaConInicio());
  if (!local) return false;
  decir(local.texto, 20000);
  $('chat-estado').textContent = 'Kerni respondió con información local.';
  // Lo que reconoce una regla local también pasa por la tarjeta (AGENTS.md): una regex puede equivocarse,
  // y abrir Configuración o buscar actualizaciones (hasta 5 min) sin preguntar no es "Kerni propone, la persona decide".
  // Si ya hay una tarjeta abierta, `proponer` la deja esperando en la cola.
  if (local.proponer) proponer(local.proponer, false);
  return true;
}

/** Siempre con tarjeta de confirmación: nada se borra sin Aprobar. */
function pedirLimpieza() {
  proponer({ accion: 'limpiar_temporales', motivo: 'Libera espacio sin tocar tus documentos.' });
}
$('limpiar').addEventListener('click', pedirLimpieza);

// ---------- Guías paso a paso ----------
// La línea de guía se ve solo con una guía en curso. Los textos llegan del backend; aquí solo se pintan (textContent).
function pintarGuia() {
  const visible = guiaVisible(guia);
  $('guia').hidden = !visible;
  if (visible) $('guia-etiqueta').textContent = etiquetaGuia(guia);
}

/** Manda Listo, No pude o Salir al backend. Sin modelo: el paso lo decide la base, no la pantalla. */
async function enviarRespuestaGuia(respuesta) {
  if (!deviceId || !guiaVisible(guia) || guiaOcupada) return;
  guiaOcupada = true;
  try {
    const res = await fetch(`${BACKEND}/guias/responder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, respuesta }),
      signal: AbortSignal.timeout(PLAZO_BACKEND_MS),
    });
    const data = await res.json();
    if (res.status === 409) guia = null; // ya no hay guía en el backend
    if (!res.ok) {
      decir(data.error ?? 'No pude seguir la guía.');
    } else {
      guia = data.guia ?? null;
      decir(data.respuesta, 25000);
      // La tarjeta de un paso de acción: la persona la aprueba o no; la guía no ejecuta nada.
      if (data.propuesta) proponer(data.propuesta, true);
    }
  } catch (err) {
    decir(textoDeError(err));
  } finally {
    guiaOcupada = false;
    pintarGuia();
  }
}
BOTONES_GUIA.forEach((b) => $(b.id).addEventListener('click', () => enviarRespuestaGuia(b.respuesta)));

// ---------- Chat ----------
$('chat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('mensaje');
  const mensaje = input.value.trim();
  if (!mensaje) return;
  input.value = '';

  // Solicitudes breves y deterministas usan las reglas/datos locales. Las dudas y preguntas abiertas van al modelo.
  // Con una guía en curso, o si la persona pide una guía, el backend decide (las reglas locales podrían cortar el paso).
  if (!guiaVisible(guia) && !pideGuia(mensaje) && responderAutomatico(mensaje)) return;

  input.disabled = true;
  pensando = true;
  $('chat').setAttribute('aria-busy', 'true');
  $('chat-estado').textContent = 'Kerni está pensando…';
  actualizarModo();
  decir('Mmm, dejame pensar…', 30000);
  let respuestaRecibida = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(`${BACKEND}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json' },
      body: JSON.stringify({
        mensaje,
        session_id: sessionId ?? undefined,
        ...(deviceId ? { device_id: deviceId } : {}),
        ...(equipo ? { equipo: { fabricante: equipo.fabricante, modelo: equipo.modelo, so: equipo.so } } : {}),
        ...(ultimas ? { snapshot: snapshotParaBackend(lecturaConInicio()) } : {}),
      }),
      signal: controller.signal,
    });
    respuestaRecibida = true;
    // El plazo cubre también la lectura del cuerpo (JSON o stream): se limpia recién al terminar de leer.
    let data;
    try {
    if (res.headers.get('content-type')?.includes('text/event-stream') && res.body) {
      let acumulado = '';
      data = await leerRespuestaSse(res.body, {
        alDelta: (texto) => {
          acumulado += texto;
          const globo = $('globo');
          globo.textContent = acumulado;
          globo.hidden = false;
        },
        alEstado: (estado) => {
          if (estado.herramienta === 'buscar_conocimiento') $('chat-estado').textContent = 'Kerni está consultando sus guías…';
        },
      });
    } else {
      data = await res.json();
    }
    } finally {
      clearTimeout(timeout);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('El backend respondió, pero no recibí una respuesta de chat válida.');
    }
    if (!data.error && (typeof data.respuesta !== 'string' || typeof data.session_id !== 'string' || !Array.isArray(data.acciones))) {
      throw new Error('El backend respondió, pero la respuesta del chat llegó incompleta. Revisá la consola del backend.');
    }

    // Con streaming, un error llega como evento dentro de una respuesta 200: cuenta como fallo igual.
    const ok = res.ok && !data?.error;
    const motivo = motivoDeRespuesta(ok, data ?? {});
    if (motivo) {
      ultimaIA = motivo;
      pintarIA();
    }
    if (!ok) {
      if (data.fallbackLocal) {
        const enlace = enlaceParaRevisar(mensaje);
        if (enlace) {
          try {
            const revision = await fetch(`${BACKEND}/enlaces/revisar`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ url: enlace }),
              signal: AbortSignal.timeout(PLAZO_BACKEND_MS),
            });
            if (!revision.ok) throw new Error('No pude revisar ese enlace sin el modelo. Probá de nuevo más tarde.');
            decir(resumenEnlace(await revision.json()), 25000);
            return;
          } catch (err) {
            if (err instanceof TypeError) throw new Error('No pude conectar para revisar ese enlace sin el modelo.');
            throw err;
          }
        }
        if (responderAutomatico(mensaje)) return;
      }
      throw new Error(data.error ?? `error ${res.status}`);
    }
    sessionId = data.session_id;
    // `guia` solo viene cuando el turno tiene que ver con una guía (empezarla, avanzarla, cerrarla o preguntar en medio).
    if ('guia' in data) {
      guia = data.guia ?? null;
      pintarGuia();
    }
    decir(data.respuesta, 25000);
    $('chat-estado').textContent = 'Kerni respondió.';
    // Solo la última propuesta espera aprobación; la persona decide, no el modelo.
    const propuesta = data.acciones.filter((a) => a.tipo === 'proponer_accion').at(-1);
    const recuerdo = data.acciones.find((a) => a.tipo === 'proponer_recuerdo');
    if (propuesta) proponer(propuesta, true);
    else if (recuerdo) proponer({ accion: 'recordar', clave: recuerdo.clave, valor: recuerdo.valor }, false);
  } catch (err) {
    if (esTiempoAgotado(err)) {
      decir(MENSAJE_TARDO);
      $('chat-estado').textContent = 'La respuesta tardó demasiado.';
    } else {
      console.error('[chat] No se pudo procesar la respuesta:', err);
      const mensajeError = err instanceof TypeError && !respuestaRecibida
        ? 'No pude recibir la respuesta del backend. Si su consola muestra POST /chat con 200, cerrá Kerni por completo y abrilo de nuevo con la interfaz actualizada.'
        : String(err.message ?? err);
      decir(mensajeError);
      $('chat-estado').textContent = 'Kerni no pudo completar la respuesta.';
    }
  } finally {
    pensando = false;
    $('chat').setAttribute('aria-busy', 'false');
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
    await listen('pedir-red-local', verDispositivosRed);
    await listen('pedir-actualizaciones', verActualizaciones);
    await listen('pedir-reporte', verReporte);
    await listen('pedir-ia', () => bienvenida.abrir());
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
function posicionarMenuContextual(x, y) {
  const { width, height } = menuContextual.getBoundingClientRect();
  const maxX = window.innerWidth - width - 8;
  const maxY = window.innerHeight - height - 8;
  menuContextual.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
  menuContextual.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
}

function ocultarMenuContextual() {
  menuContextual.hidden = true;
  $('menu-principal').hidden = false;
  $('menu-mas').hidden = true;
  $('menu-mas-boton').setAttribute('aria-expanded', 'false');
}

$('mascota').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!enTauri) { alternarMetricas(); return; } // sin menú nativo en el navegador: el clic derecho alterna las métricas
  itemMetricasMenu.textContent = $('hud').hidden ? 'Ver métricas' : 'Ocultar métricas';
  $('menu-principal').hidden = false;
  $('menu-mas').hidden = true;
  $('menu-mas-boton').setAttribute('aria-expanded', 'false');
  menuContextual.hidden = false;
  posicionarMenuContextual(e.clientX, e.clientY);
  itemMetricasMenu.focus();
});

document.addEventListener('pointerdown', (e) => {
  if (!menuContextual.hidden && !menuContextual.contains(e.target)) ocultarMenuContextual();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menuContextual.hidden) ocultarMenuContextual();
});
menuContextual.addEventListener('click', async (e) => {
  if (e.target.closest('[data-menu-volver]')) {
    $('menu-mas').hidden = true;
    $('menu-principal').hidden = false;
    $('menu-mas-boton').setAttribute('aria-expanded', 'false');
    const x = Number.parseFloat(menuContextual.style.left);
    const y = Number.parseFloat(menuContextual.style.top);
    requestAnimationFrame(() => posicionarMenuContextual(x, y));
    $('menu-mas-boton').focus();
    return;
  }
  // Las herramientas ocupan una vista propia y desplazable, sin alargar el menú principal.
  if (e.target.closest('#menu-mas-boton')) {
    $('menu-principal').hidden = true;
    $('menu-mas').hidden = false;
    $('menu-mas').scrollTop = 0;
    $('menu-mas-boton').setAttribute('aria-expanded', 'true');
    const x = Number.parseFloat(menuContextual.style.left);
    const y = Number.parseFloat(menuContextual.style.top);
    requestAnimationFrame(() => posicionarMenuContextual(x, y));
    menuContextual.querySelector('[data-menu-volver]').focus();
    return;
  }
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
      case 'consejos':
        alternarConsejos();
        break;
      case 'vigilar_enlaces':
        alternarVigilaEnlaces();
        break;
      case 'resumen_diario':
        alternarResumenDiario();
        break;
      case 'equipo': await verEquipo(); break;
      case 'reporte': await verReporte(); break;
      case 'inicio': await verInicio(); break;
      case 'espacio': await verEspacio(); break;
      case 'red': await verRed(); break;
      case 'red_local': await verDispositivosRed(); break;
      case 'actualizaciones': await verActualizaciones(); break;
      // La papelera borra: desde el menú solo abre la tarjeta de confirmación.
      case 'papelera':
        if (!pendiente) proponer({ accion: 'vaciar_papelera', motivo: 'Libera el espacio que ocupa la papelera.' }, false);
        break;
      case 'memoria': await verMemoria(); break;
      case 'cambiar_ia': await bienvenida.abrir(); break;
      // Cerrar y ocultar los hace Rust: la interfaz no tiene permiso para manejar la ventana.
      case 'ocultar': await llamar('ocultar_kerni'); break;
      case 'cerrar': await llamar('salir_de_kerni'); break;
    }
  } catch (err) {
    console.error('[menu-contextual] No se pudo ejecutar la opción:', err);
    decir('No pude completar esa opción. Probá de nuevo.', 6000);
  }
});

// ---------- Con IA / Sin IA: una etiqueta junto al chat (solo texto, con textContent) ----------
let saludIA; // undefined = todavía no se preguntó; null = no hubo respuesta; objeto = cuerpo de /health
let ultimaIA = null; // 'ok' | 'sin_cupo' | null: lo que dijo la última respuesta de /chat
function pintarIA() {
  const e = estadoIA(saludIA, ultimaIA);
  const chip = $('ia-chip');
  chip.textContent = e.texto;
  chip.dataset.estado = e.clave;
  chip.title = e.detalle;
}
async function refrescarIA() {
  try {
    const res = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(PLAZO_BACKEND_MS) });
    saludIA = res.ok ? await res.json() : null;
  } catch {
    saludIA = null;
  }
  pintarIA();
}
refrescarIA();
setInterval(refrescarIA, 60000);

// Primer arranque: la persona elige qué IA usar (o ninguna). También se abre desde el menú ("Cambiar IA o llave…").
const bienvenida = crearBienvenida({ backend: BACKEND, plazoMs: PLAZO_BACKEND_MS, alCambiar: refrescarIA, decir });
bienvenida.iniciar({ forzar: new URLSearchParams(location.search).has('bienvenida') });

// Progreso: se lee al arrancar y, si el backend no respondió, se vuelve a intentar cada minuto.
pintarProgreso();
cargarProgreso();
setInterval(() => { if (progreso.disponible !== true) cargarProgreso(); }, 60000);
pintarMenuConsejos();
pintarMenuVigilaEnlaces();
arrancarVigilanciaPortapapeles();
pintarMenuResumenDiario();
// Un consejo a lo sumo por sesión, después del saludo (ver intentarConsejo).
setTimeout(intentarConsejo, 14000);

// Una lectura a la vez: la siguiente se programa cuando termina la anterior. Con setInterval, si Rust tardaba
// (una limpieza grande), las lecturas se apilaban y llegaban juntas, todas altas, y podían disparar un pánico falso.
(async function ciclo() {
  await actualizar();
  setTimeout(ciclo, CADA_MS);
})();

// Historial de salud para la memoria: una lectura resumida cada 10 min, solo con datos reales (no la demo).
if (enTauri && deviceId) {
  setInterval(() => {
    if (!ultimas) return;
    fetch(`${BACKEND}/memoria/salud`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, snapshot: snapshotParaBackend(ultimas) }),
      signal: AbortSignal.timeout(PLAZO_BACKEND_MS),
    }).catch(() => { /* sin backend o sin memoria: no pasa nada */ });
  }, 10 * 60_000);
}
// El modelo de la PC se lee una vez: sirve para que Kerni busque en el manual correcto. Si falla, el chat sigue igual.
let equipo = null;
(async () => { try { equipo = await llamar('info_equipo'); } catch { /* sin dato de equipo */ } })();
decir('¡Hola! Soy Kerni y estoy cuidando tu compu.', 6000);
setTimeout(() => personaje.saludar(), 600);
