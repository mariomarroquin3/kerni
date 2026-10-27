//! Núcleo de salud de Kerni: lee métricas reales de la PC y ejecuta, solo
//! cuando la persona lo aprobó en pantalla, las acciones del hito 1: cerrar un
//! proceso y limpiar archivos temporales. También puede, solo leyendo, listar
//! los archivos y carpetas pesados que ya no se usan.
//!
//! Aunque el backend ya validó la propuesta del modelo, aquí se revisa otra
//! vez: este es el único lugar que toca el sistema.

use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;
use sysinfo::{Disks, ProcessesToUpdate, System};

/// Procesos que nunca se cierran. Misma lista que `PROCESOS_PROTEGIDOS` del backend.
const PROTEGIDOS: &[&str] = &[
    "system", "system idle process", "registry", "smss.exe", "csrss.exe", "wininit.exe",
    "winlogon.exe", "services.exe", "lsass.exe", "svchost.exe", "explorer.exe", "dwm.exe",
    "fontdrvhost.exe", "msmpeng.exe", "securityhealthservice.exe", "memory compression",
    "kerni.exe",
    "audiodg.exe", "spoolsv.exe", "sihost.exe", "taskhostw.exe", "msedgewebview2.exe",
    // Linux: PID 1 y supervisores del kernel, sesiones graficas, audio, red, servicios base.
    "kthreadd", "kworker", "pid", "systemd", "init", "udevd", "dbus", "dbus-daemon",
    "systemd-journald", "systemd-logind", "systemd-resolved", "systemd-networkd", "avahi-daemon",
    "xorg", "gdm", "lightdm", "xdm", "sddm", "weston", "sway", "mutter", "gnome-shell", "kwin", "xfwm", "wayfire",
    "pipewire", "pipewire-pulse", "wireplumber", "pulseaudio", "jackd",
    "networkmanager", "dhcpcd", "wpa_supplicant", "modemmanager", "bluetoothd", "cron", "rsyslog",
];

/// Cuántos procesos se reportan (los que más CPU y más memoria usan).
const PROCESOS_REPORTADOS: usize = 15;
/// Los temporales con menos de este tiempo se dejan: pueden estar en uso.
#[cfg(not(target_os = "linux"))]
const EDAD_MINIMA_TEMPORALES: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Proceso {
    pub pid: u32,
    pub nombre: String,
    pub cpu: f32,
    pub memoria_mb: f64,
    pub protegido: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ram {
    pub usada_mb: f64,
    pub total_mb: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disco {
    pub libre_gb: f64,
    pub total_gb: f64,
}

/// Batería de la PC. `None` si no tiene (un equipo de escritorio) o Windows no sabe el nivel.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Bateria {
    pub porcentaje: u8,
    /// Cargándose ahora mismo.
    pub cargando: bool,
    /// Conectada a la corriente (puede estar al 100 % sin "cargar").
    pub enchufada: bool,
}

/// Misma forma que `SnapshotSchema` del backend (más `protegido` y `bateria`, que el backend ignora).
#[derive(Serialize)]
pub struct Metricas {
    pub cpu: f32,
    pub ram: Ram,
    pub disco: Disco,
    pub procesos: Vec<Proceso>,
    pub bateria: Option<Bateria>,
}

#[cfg(windows)]
#[repr(C)]
struct SystemPowerStatus {
    ac_line_status: u8,
    battery_flag: u8,
    battery_life_percent: u8,
    system_status_flag: u8,
    battery_life_time: u32,
    battery_full_life_time: u32,
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn GetSystemPowerStatus(estado: *mut SystemPowerStatus) -> i32;
}

/// Interpreta el estado de energía de Windows. Separada de la llamada al sistema para poder probarla.
/// `flag`: 128 = sin batería, 8 = cargando, 255 = desconocido. `porcentaje`: 255 = desconocido.
#[cfg(any(windows, test))]
pub fn interpretar_bateria(ac: u8, flag: u8, porcentaje: u8) -> Option<Bateria> {
    if flag == 255 || flag & 128 != 0 || porcentaje > 100 {
        return None;
    }
    Some(Bateria { porcentaje, cargando: flag & 8 != 0, enchufada: ac == 1 })
}

#[cfg(windows)]
pub fn leer_bateria() -> Option<Bateria> {
    let mut e = SystemPowerStatus {
        ac_line_status: 0,
        battery_flag: 0,
        battery_life_percent: 0,
        system_status_flag: 0,
        battery_life_time: 0,
        battery_full_life_time: 0,
    };
    // SAFETY: `e` es una estructura válida y con el mismo diseño que SYSTEM_POWER_STATUS de Win32.
    let ok = unsafe { GetSystemPowerStatus(&mut e) };
    if ok == 0 {
        return None;
    }
    interpretar_bateria(e.ac_line_status, e.battery_flag, e.battery_life_percent)
}

#[cfg(not(windows))]
pub fn leer_bateria() -> Option<Bateria> {
    None
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultadoLimpieza {
    pub archivos: u32,
    pub liberado_mb: f64,
}

pub struct Monitor(Mutex<System>);

impl Default for Monitor {
    fn default() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        Monitor(Mutex::new(sys))
    }
}

pub fn es_protegido(nombre: &str) -> bool {
    let n = nombre.trim().to_lowercase();
    PROTEGIDOS.contains(&n.as_str())
}

const MB: f64 = 1024.0 * 1024.0;
const GB: f64 = 1024.0 * 1024.0 * 1024.0;

#[tauri::command]
pub fn metricas(monitor: tauri::State<Monitor>) -> Metricas {
    let mut sys = monitor.0.lock().unwrap();
    leer_metricas(&mut sys)
}

/// Lee el estado real de la PC. Separada del comando para poder probarla sin Tauri.
pub fn leer_metricas(sys: &mut System) -> Metricas {
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    // `cpu_usage` de un proceso es por núcleo (puede pasar de 100): se normaliza.
    let nucleos = sys.cpus().len().max(1) as f32;
    let mut procesos: Vec<Proceso> = sys
        .processes()
        .values()
        .map(|p| {
            let nombre = p.name().to_string_lossy().to_string();
            Proceso {
                pid: p.pid().as_u32(),
                protegido: es_protegido(&nombre),
                nombre,
                cpu: (p.cpu_usage() / nucleos).min(100.0),
                memoria_mb: p.memory() as f64 / MB,
            }
        })
        .filter(|p| p.pid != 0)
        .collect();

    // Los que más CPU usan, y si sobran lugares, los que más memoria.
    procesos.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    let mut elegidos: Vec<Proceso> = procesos.iter().take(PROCESOS_REPORTADOS - 5).cloned().collect();
    procesos.sort_by(|a, b| b.memoria_mb.partial_cmp(&a.memoria_mb).unwrap_or(std::cmp::Ordering::Equal));
    for p in procesos {
        if elegidos.len() >= PROCESOS_REPORTADOS {
            break;
        }
        if !elegidos.iter().any(|e| e.pid == p.pid) {
            elegidos.push(p);
        }
    }
    elegidos.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));

    // El disco del sistema (C:\ en Windows); si no se encuentra, el más grande.
    let discos = Disks::new_with_refreshed_list();
    let disco = discos
        .list()
        .iter()
        .find(|d| d.mount_point() == Path::new("C:\\") || d.mount_point() == Path::new("/"))
        .or_else(|| discos.list().iter().max_by_key(|d| d.total_space()));
    let (libre, total) = disco.map_or((0.0, 1.0), |d| {
        (d.available_space() as f64 / GB, (d.total_space() as f64 / GB).max(0.1))
    });

    Metricas {
        cpu: sys.global_cpu_usage().clamp(0.0, 100.0),
        ram: Ram { usada_mb: sys.used_memory() as f64 / MB, total_mb: (sys.total_memory() as f64 / MB).max(1.0) },
        disco: Disco { libre_gb: libre, total_gb: total },
        procesos: elegidos,
        bateria: leer_bateria(),
    }
}

/// Cierra un proceso. Pide pid y nombre para no cerrar otro que reutilizó el pid.
#[tauri::command]
pub fn terminar_proceso(pid: u32, nombre: String, monitor: tauri::State<Monitor>) -> Result<String, String> {
    let mut sys = monitor.0.lock().unwrap();
    cerrar_proceso(&mut sys, pid, &nombre, std::process::id())
}

/// Las revisiones van antes de tocar nada: protegido, uno mismo, pid reutilizado.
/// `propio` es el pid de Kerni (parámetro para poder probarlo).
pub fn cerrar_proceso(sys: &mut System, pid: u32, nombre: &str, propio: u32) -> Result<String, String> {
    if es_protegido(nombre) {
        return Err(format!("{nombre} es un proceso protegido y no se puede cerrar"));
    }
    if pid == propio {
        return Err("Kerni no se cierra a sí mismo desde aquí".into());
    }
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let proceso = sys
        .processes()
        .values()
        .find(|p| p.pid().as_u32() == pid)
        .ok_or_else(|| "ese proceso ya no existe".to_string())?;
    let real = proceso.name().to_string_lossy().to_string();
    if !real.eq_ignore_ascii_case(nombre.trim()) {
        return Err(format!("el pid {pid} ahora es {real}, no {nombre}; no se cerró nada"));
    }
    if es_protegido(&real) {
        return Err(format!("{real} es un proceso protegido y no se puede cerrar"));
    }
    if proceso.kill() {
        Ok(format!("Cerré {real}"))
    } else if cfg!(target_os = "linux") {
        Err(format!("No pude cerrar {real} (puede que necesite permisos de administrador)"))
    } else {
        Err(format!("Windows no me dejó cerrar {real} (puede que necesite permisos de administrador)"))
    }
}

/// Borra archivos temporales viejos del usuario. No sigue enlaces simbólicos
/// y solo trabaja dentro de una carpeta que se llame temp o tmp.
#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub fn limpiar_temporales() -> Result<ResultadoLimpieza, String> {
    let dir = std::env::temp_dir();
    let nombre = dir.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if dir.components().count() < 3 || !(nombre == "temp" || nombre == "tmp") {
        return Err(format!("La carpeta temporal ({}) no parece segura; no borré nada", dir.display()));
    }
    let limite = SystemTime::now() - EDAD_MINIMA_TEMPORALES;
    let (mut archivos, mut bytes) = (0u32, 0u64);
    limpiar_dir(&dir, limite, &mut archivos, &mut bytes);
    Ok(ResultadoLimpieza { archivos, liberado_mb: bytes as f64 / MB })
}

#[cfg(any(not(target_os = "linux"), test))]
fn limpiar_dir(dir: &Path, limite: SystemTime, archivos: &mut u32, bytes: &mut u64) {
    let Ok(entradas) = fs::read_dir(dir) else { return };
    for entrada in entradas.flatten() {
        let ruta = entrada.path();
        let Ok(meta) = fs::symlink_metadata(&ruta) else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            limpiar_dir(&ruta, limite, archivos, bytes);
            // Solo se borra si quedó vacía; si no, falla y se deja.
            let _ = fs::remove_dir(&ruta);
        } else if meta.modified().map_or(false, |m| m < limite) && fs::remove_file(&ruta).is_ok() {
            *archivos += 1;
            *bytes += meta.len();
        }
    }
}

// ---------- Archivos y carpetas pesados que ya no se usan (solo lectura) ----------
//
// Solo mira nombres, tamaños y fechas dentro de las carpetas personales (Descargas, Escritorio, Documentos,
// Videos, Imágenes y Música). No lee el contenido, no sigue enlaces simbólicos y NO borra ni mueve nada:
// la persona decide qué hacer con lo que ve. Un archivo cuenta como "sin uso" cuando ni su fecha de
// modificación ni la de último acceso son recientes (la más nueva de las dos manda).

const DIAS_SIN_USO_POR_DEFECTO: u32 = 90;
const MB_MINIMOS_POR_DEFECTO: u32 = 200;
const MAX_RESULTADOS: usize = 25;
const MAX_ENTRADAS: u32 = 400_000;
const TIEMPO_MAXIMO: Duration = Duration::from_secs(20);
const PROFUNDIDAD_MAXIMA: u32 = 12;
const CARPETAS_PERSONALES: &[&str] = &["Downloads", "Desktop", "Documents", "Videos", "Pictures", "Music"];
/// Carpetas de dependencias y de compilación de programadores: son cientos de miles de archivos que nadie quiere
/// ver uno por uno y volverían lentísima la búsqueda. No se recorren (sí cuenta su fecha, ver `analizar_dir`).
const CARPETAS_AJENAS: &[&str] = &["node_modules", ".git", "__pycache__", ".venv", "venv", ".gradle", ".m2", "$recycle.bin", "system volume information"];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BusquedaArchivos {
    pub elementos: Vec<ArchivoPesado>,
    /// `false` si se acabó el tiempo o el tope de entradas antes de revisar todo: puede haber más.
    pub completa: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArchivoPesado {
    pub ruta: String,
    pub nombre: String,
    /// Carpeta que lo contiene, con `~` en lugar de la carpeta personal (así no viaja el nombre de usuario).
    pub carpeta: String,
    pub es_carpeta: bool,
    pub tamano_mb: f64,
    pub dias_sin_uso: u32,
}

struct Hallazgo {
    ruta: std::path::PathBuf,
    es_carpeta: bool,
    bytes: u64,
    ultimo_uso: SystemTime,
}

struct Resumen {
    bytes: u64,
    mas_reciente: SystemTime,
    hallazgos: Vec<Hallazgo>,
}

struct Limites {
    ahora: SystemTime,
    edad_minima: Duration,
    min_bytes: u64,
}

impl Limites {
    fn sin_uso(&self, ultimo_uso: SystemTime) -> bool {
        // Una fecha en el futuro (reloj raro) nunca cuenta como sin uso.
        self.ahora.duration_since(ultimo_uso).map_or(false, |d| d >= self.edad_minima)
    }
}

/// Tope de trabajo: un disco enorme no debe dejar a Kerni pensando para siempre.
struct Presupuesto {
    entradas: u32,
    max_entradas: u32,
    inicio: Instant,
    tiempo_maximo: Duration,
}

impl Presupuesto {
    fn nuevo(max_entradas: u32, tiempo_maximo: Duration) -> Self {
        Presupuesto { entradas: 0, max_entradas, inicio: Instant::now(), tiempo_maximo }
    }
    fn agotado(&self) -> bool {
        self.entradas >= self.max_entradas || self.inicio.elapsed() >= self.tiempo_maximo
    }
}

/// La fecha de uso es la más nueva entre modificación y último acceso: así nunca se marca como "sin uso"
/// algo que se abrió hace poco, aunque no se haya cambiado.
fn ultimo_uso(meta: &fs::Metadata) -> SystemTime {
    match (meta.modified().ok(), meta.accessed().ok()) {
        (Some(m), Some(a)) => m.max(a),
        (Some(x), None) | (None, Some(x)) => x,
        (None, None) => SystemTime::now(),
    }
}

fn es_carpeta_ajena(nombre: &str, junto_a_cargo_toml: bool) -> bool {
    let n = nombre.to_lowercase();
    CARPETAS_AJENAS.contains(&n.as_str()) || (junto_a_cargo_toml && n == "target")
}

fn analizar_dir(dir: &Path, profundidad: u32, lim: &Limites, pres: &mut Presupuesto) -> Resumen {
    let mut r = Resumen { bytes: 0, mas_reciente: SystemTime::UNIX_EPOCH, hallazgos: Vec::new() };
    // Si no se pudo mirar todo (carpeta ilegible, demasiado profunda o sin presupuesto), se asume que
    // hay algo reciente: jamás se informa como "sin uso" una carpeta que no se revisó completa.
    let incompleto = |r: &mut Resumen| r.mas_reciente = lim.ahora;
    if profundidad > PROFUNDIDAD_MAXIMA || pres.agotado() {
        incompleto(&mut r);
        return r;
    }
    let Ok(entradas) = fs::read_dir(dir) else {
        incompleto(&mut r);
        return r;
    };
    let es_proyecto_rust = dir.join("Cargo.toml").is_file();
    for entrada in entradas.flatten() {
        pres.entradas += 1;
        if pres.agotado() {
            incompleto(&mut r);
            break;
        }
        let ruta = entrada.path();
        // `DirEntry::metadata` no sigue enlaces y en Windows sale de los datos que ya trae la lectura de la carpeta
        // (sin abrir cada archivo): es varias veces más rápido que `symlink_metadata(ruta)`.
        let Ok(meta) = entrada.metadata() else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() && es_carpeta_ajena(&entrada.file_name().to_string_lossy(), es_proyecto_rust) {
            // No se recorre, pero su fecha cuenta: un `npm install` o una compilación de ayer indica que el proyecto se usa.
            r.mas_reciente = r.mas_reciente.max(ultimo_uso(&meta));
            continue;
        }
        if meta.is_dir() {
            let hijo = analizar_dir(&ruta, profundidad + 1, lim, pres);
            r.bytes += hijo.bytes;
            r.mas_reciente = r.mas_reciente.max(hijo.mas_reciente);
            if hijo.bytes >= lim.min_bytes && lim.sin_uso(hijo.mas_reciente) {
                // Toda la carpeta está sin uso: se informa ella sola, no uno por uno sus archivos.
                r.hallazgos.push(Hallazgo { ruta, es_carpeta: true, bytes: hijo.bytes, ultimo_uso: hijo.mas_reciente });
            } else {
                r.hallazgos.extend(hijo.hallazgos);
            }
        } else if meta.is_file() {
            let uso = ultimo_uso(&meta);
            r.bytes += meta.len();
            r.mas_reciente = r.mas_reciente.max(uso);
            if meta.len() >= lim.min_bytes && lim.sin_uso(uso) {
                r.hallazgos.push(Hallazgo { ruta, es_carpeta: false, bytes: meta.len(), ultimo_uso: uso });
            }
        }
    }
    r
}

/// Quita el prefijo `\\?\` que Windows agrega al canonizar una ruta, para mostrarla y abrirla normalmente.
fn sin_prefijo_verbatim(p: &Path) -> std::path::PathBuf {
    let texto = p.to_string_lossy();
    match texto.strip_prefix(r"\\?\") {
        Some(resto) if resto.chars().nth(1) == Some(':') => std::path::PathBuf::from(resto),
        _ => p.to_path_buf(),
    }
}

/// Deja solo las carpetas que existen y no están dentro de otra de la lista (para no contar dos veces).
fn sin_anidadas(raices: Vec<std::path::PathBuf>) -> Vec<std::path::PathBuf> {
    let mut canonicas: Vec<std::path::PathBuf> =
        raices.iter().filter_map(|r| fs::canonicalize(r).ok()).map(|r| sin_prefijo_verbatim(&r)).collect();
    canonicas.sort();
    canonicas.dedup();
    let todas = canonicas.clone();
    canonicas.retain(|r| !todas.iter().any(|otra| otra != r && r.starts_with(otra)));
    canonicas
}

fn carpeta_personal() -> Option<std::path::PathBuf> {
    let variable = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(variable).map(std::path::PathBuf::from).filter(|p| p.is_dir())
}

/// Las únicas carpetas que Kerni mira (y desde donde deja abrir algo): las personales de la persona.
fn raices_del_usuario() -> Vec<std::path::PathBuf> {
    let Some(casa) = carpeta_personal() else { return Vec::new() };
    let mut raices: Vec<std::path::PathBuf> = CARPETAS_PERSONALES.iter().map(|n| casa.join(n)).collect();
    // Con OneDrive, Escritorio, Documentos e Imágenes suelen vivir ahí.
    if let Some(onedrive) = std::env::var_os("OneDrive").map(std::path::PathBuf::from) {
        raices.extend(["Desktop", "Documents", "Pictures"].iter().map(|n| onedrive.join(n)));
    }
    sin_anidadas(raices.into_iter().filter(|r| r.is_dir()).collect())
}

fn mostrar_ruta(p: &Path, casa: Option<&Path>) -> String {
    match casa.and_then(|c| p.strip_prefix(c).ok()) {
        Some(resto) => format!("~{}{}", std::path::MAIN_SEPARATOR, resto.display()),
        None => p.display().to_string(),
    }
}

/// Parte pura y probable: recorre `raices` (una por hilo, en paralelo) y devuelve lo más pesado que no se usa
/// desde hace `dias`. `max_entradas` y `tiempo` son el tope de trabajo de cada carpeta raíz.
fn buscar_archivos_pesados(
    raices: &[std::path::PathBuf],
    ahora: SystemTime,
    dias: u32,
    min_bytes: u64,
    casa: Option<&Path>,
    max_entradas: u32,
    tiempo: Duration,
) -> BusquedaArchivos {
    let lim = Limites { ahora, edad_minima: Duration::from_secs(dias as u64 * 86_400), min_bytes };
    let por_raiz: Vec<(Vec<Hallazgo>, bool)> = std::thread::scope(|s| {
        let hilos: Vec<_> = raices
            .iter()
            .map(|raiz| {
                let lim = &lim;
                s.spawn(move || {
                    let mut pres = Presupuesto::nuevo(max_entradas, tiempo);
                    // La carpeta personal en sí nunca se informa como "sin uso": solo lo que hay dentro.
                    let r = analizar_dir(raiz, 0, lim, &mut pres);
                    (r.hallazgos, !pres.agotado())
                })
            })
            .collect();
        hilos.into_iter().map(|h| h.join().unwrap_or((Vec::new(), false))).collect()
    });
    let completa = por_raiz.iter().all(|(_, ok)| *ok);
    let mut todos: Vec<Hallazgo> = por_raiz.into_iter().flat_map(|(h, _)| h).collect();
    todos.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    todos.truncate(MAX_RESULTADOS);
    let elementos = todos
        .into_iter()
        .map(|h| {
            let dias_sin_uso = ahora.duration_since(h.ultimo_uso).map_or(0, |d| (d.as_secs() / 86_400) as u32);
            ArchivoPesado {
                nombre: h.ruta.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                carpeta: h.ruta.parent().map(|p| mostrar_ruta(p, casa)).unwrap_or_default(),
                ruta: h.ruta.display().to_string(),
                es_carpeta: h.es_carpeta,
                tamano_mb: h.bytes as f64 / MB,
                dias_sin_uso,
            }
        })
        .collect();
    BusquedaArchivos { elementos, completa }
}

/// Busca archivos y carpetas pesados que no se usan hace rato. Solo lectura. Los parámetros se acotan
/// aquí aunque la interfaz ya los acote: de 30 a 3650 días y de 50 MB a 100 GB.
#[tauri::command]
pub async fn archivos_pesados(dias_sin_uso: Option<u32>, min_mb: Option<u32>) -> Result<BusquedaArchivos, String> {
    let dias = dias_sin_uso.unwrap_or(DIAS_SIN_USO_POR_DEFECTO).clamp(30, 3650);
    let min_mb = min_mb.unwrap_or(MB_MINIMOS_POR_DEFECTO).clamp(50, 100_000);
    let raices = raices_del_usuario();
    if raices.is_empty() {
        return Err("No encontré tus carpetas personales para revisar".to_string());
    }
    let casa = carpeta_personal().and_then(|c| fs::canonicalize(c).ok()).map(|c| sin_prefijo_verbatim(&c));
    tauri::async_runtime::spawn_blocking(move || {
        buscar_archivos_pesados(
            &raices,
            SystemTime::now(),
            dias,
            min_mb as u64 * 1024 * 1024,
            casa.as_deref(),
            MAX_ENTRADAS,
            TIEMPO_MAXIMO,
        )
    })
    .await
    .map_err(|e| e.to_string())
}

/// Devuelve la ruta limpia solo si existe y está DENTRO de una de las carpetas personales. Resuelve `..` y
/// enlaces antes de comparar, así una ruta inventada o con rodeos no sale de ahí.
fn ruta_permitida(ruta: &Path, raices: &[std::path::PathBuf]) -> Option<std::path::PathBuf> {
    let real = sin_prefijo_verbatim(&fs::canonicalize(ruta).ok()?);
    raices.iter().any(|r| real != *r && real.starts_with(r)).then_some(real)
}

/// Abre el Explorador de archivos con ese archivo seleccionado (o su carpeta). No borra ni modifica nada.
#[tauri::command]
pub fn mostrar_en_carpeta(ruta: String) -> Result<(), String> {
    let permitida = ruta_permitida(Path::new(&ruta), &raices_del_usuario())
        .ok_or_else(|| "Solo puedo mostrar cosas que estén dentro de tus carpetas personales".to_string())?;
    abrir_en_explorador(&permitida)
}

#[cfg(windows)]
fn abrir_en_explorador(ruta: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("explorer")
        .raw_arg(format!("/select,\"{}\"", ruta.display()))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn abrir_en_explorador(ruta: &Path) -> Result<(), String> {
    let carpeta = if ruta.is_dir() { ruta } else { ruta.parent().unwrap_or(ruta) };
    std::process::Command::new("xdg-open").arg(carpeta).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconoce_procesos_protegidos() {
        assert!(es_protegido("lsass.exe"));
        assert!(es_protegido("msedgewebview2.exe"));
        assert!(es_protegido("audiodg.exe"));
        assert!(es_protegido("  SVCHOST.EXE "));
        assert!(!es_protegido("chrome.exe"));
    }

    #[test]
    fn limpia_solo_archivos_viejos() {
        let base = std::env::temp_dir().join(format!("kerni-test-{}", std::process::id()));
        fs::create_dir_all(base.join("sub")).unwrap();
        fs::write(base.join("nuevo.tmp"), b"nuevo").unwrap();
        fs::write(base.join("sub").join("viejo.tmp"), b"viejo!").unwrap();

        // Con límite en el futuro todo cuenta como viejo; con límite en el pasado, nada.
        let (mut n, mut b) = (0, 0);
        limpiar_dir(&base, SystemTime::now() - Duration::from_secs(3600), &mut n, &mut b);
        assert_eq!(n, 0);
        limpiar_dir(&base, SystemTime::now() + Duration::from_secs(3600), &mut n, &mut b);
        assert_eq!(n, 2);
        assert_eq!(b, 11);
        assert!(!base.join("sub").exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn las_metricas_reales_son_coherentes() {
        let mut sys = System::new();
        let m = leer_metricas(&mut sys);
        assert!(m.ram.total_mb > 0.0 && m.ram.usada_mb <= m.ram.total_mb);
        assert!(m.disco.total_gb > 0.0 && m.disco.libre_gb <= m.disco.total_gb);
        assert!((0.0..=100.0).contains(&m.cpu));
        assert!(!m.procesos.is_empty() && m.procesos.len() <= PROCESOS_REPORTADOS);
        for p in &m.procesos {
            assert_ne!(p.pid, 0);
            assert!((0.0..=100.0).contains(&p.cpu), "cpu fuera de rango en {}", p.nombre);
            assert_eq!(p.protegido, es_protegido(&p.nombre), "protegido mal marcado en {}", p.nombre);
        }
    }

    #[test]
    fn interpreta_el_estado_de_energia_de_windows() {
        // 97 % y enchufada, sin cargar: el caso de la captura del usuario.
        assert_eq!(interpretar_bateria(1, 1, 97), Some(Bateria { porcentaje: 97, cargando: false, enchufada: true }));
        // con la batería baja y cargándose (flag 8 = cargando; 1 = alta, 2 = baja, 4 = crítica)
        assert_eq!(interpretar_bateria(1, 8 | 2, 20), Some(Bateria { porcentaje: 20, cargando: true, enchufada: true }));
        // con batería y sin corriente
        assert_eq!(interpretar_bateria(0, 2, 25), Some(Bateria { porcentaje: 25, cargando: false, enchufada: false }));
        // sin batería (equipo de escritorio), desconocida o un porcentaje imposible: no hay dato
        assert_eq!(interpretar_bateria(1, 128, 255), None);
        assert_eq!(interpretar_bateria(1, 255, 255), None);
        assert_eq!(interpretar_bateria(0, 1, 255), None);
    }

    #[test]
    fn la_bateria_real_es_coherente_o_no_existe() {
        if let Some(b) = leer_bateria() {
            assert!(b.porcentaje <= 100);
            if b.cargando {
                assert!(b.enchufada, "no se puede cargar sin estar enchufada");
            }
        }
    }

    #[test]
    fn no_cierra_protegidos_ni_a_si_mismo() {
        let mut sys = System::new();
        let r = cerrar_proceso(&mut sys, 4, "System", 99999);
        assert!(r.unwrap_err().contains("protegido"));
        let r = cerrar_proceso(&mut sys, 4242, "algo.exe", 4242);
        assert!(r.unwrap_err().contains("a sí mismo"));
        let r = cerrar_proceso(&mut sys, u32::MAX - 7, "fantasma.exe", 1);
        assert!(r.unwrap_err().contains("ya no existe"));
    }

    /// Un proceso de verdad: con el nombre equivocado no se cierra; con el correcto, sí.
    #[cfg(windows)]
    #[test]
    fn cierra_un_proceso_real_solo_si_el_nombre_coincide() {
        let mut hijo = std::process::Command::new("ping")
            .args(["-n", "120", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .spawn()
            .expect("no pude lanzar ping");
        let pid = hijo.id();
        std::thread::sleep(Duration::from_millis(400));
        let mut sys = System::new();

        let r = cerrar_proceso(&mut sys, pid, "otra-cosa.exe", std::process::id());
        assert!(r.unwrap_err().contains("no se cerró nada"));
        assert!(hijo.try_wait().unwrap().is_none(), "el proceso no debía cerrarse con otro nombre");

        let r = cerrar_proceso(&mut sys, pid, "PING.EXE", std::process::id());
        assert!(r.is_ok(), "{r:?}");
        let estado = hijo.wait().expect("el proceso debía terminar");
        assert!(!estado.success());
    }

    // ---------- archivos pesados sin uso ----------

    /// Carpeta de prueba propia de cada test (se borra al final).
    fn carpeta_de_prueba(nombre: &str) -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!("kerni-archivos-{}-{}", nombre, std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        base
    }

    /// Crea un archivo de `bytes` bytes cuya fecha de modificación y de acceso son de hace `dias` días.
    fn archivo(ruta: &Path, bytes: usize, dias: u64) {
        fs::create_dir_all(ruta.parent().unwrap()).unwrap();
        fs::write(ruta, vec![b'x'; bytes]).unwrap();
        let fecha = SystemTime::now() - Duration::from_secs(dias * 86_400);
        let f = fs::OpenOptions::new().write(true).open(ruta).unwrap();
        f.set_times(fs::FileTimes::new().set_accessed(fecha).set_modified(fecha)).unwrap();
    }

    fn buscar(base: &Path, dias: u32, min_bytes: u64) -> Vec<ArchivoPesado> {
        buscar_archivos_pesados(&[base.to_path_buf()], SystemTime::now(), dias, min_bytes, Some(base), MAX_ENTRADAS, TIEMPO_MAXIMO).elementos
    }

    #[test]
    fn lista_el_pesado_y_viejo_pero_no_el_reciente_ni_el_liviano() {
        let base = carpeta_de_prueba("basico");
        archivo(&base.join("viejo_grande.iso"), 5000, 200);
        archivo(&base.join("reciente_grande.iso"), 5000, 2);
        archivo(&base.join("viejo_chico.txt"), 100, 400);
        let r = buscar(&base, 90, 1000);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].nombre, "viejo_grande.iso");
        assert!(!r[0].es_carpeta);
        assert!(r[0].dias_sin_uso >= 199 && r[0].dias_sin_uso <= 201);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn una_carpeta_entera_sin_uso_se_informa_sola() {
        let base = carpeta_de_prueba("carpeta");
        for n in 0..3 {
            archivo(&base.join("proyecto_viejo").join(format!("a{n}.bin")), 2000, 300);
        }
        let r = buscar(&base, 90, 1000);
        assert_eq!(r.len(), 1, "{r:?}");
        assert!(r[0].es_carpeta);
        assert_eq!(r[0].nombre, "proyecto_viejo");
        assert!((r[0].tamano_mb - 6000.0 / MB).abs() < 1e-9);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn una_carpeta_con_algo_reciente_no_se_resume_y_solo_salen_los_archivos_viejos() {
        let base = carpeta_de_prueba("mixta");
        archivo(&base.join("obra").join("viejo.bin"), 3000, 300);
        archivo(&base.join("obra").join("actual.txt"), 10, 1);
        let r = buscar(&base, 90, 1000);
        assert_eq!(r.len(), 1, "{r:?}");
        assert_eq!(r[0].nombre, "viejo.bin");
        assert!(!r[0].es_carpeta);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn ordena_por_tamano_y_limita_la_lista() {
        let base = carpeta_de_prueba("orden");
        for n in 0..(MAX_RESULTADOS + 5) {
            archivo(&base.join(format!("f{n:02}.bin")), 1000 + n * 10, 300);
        }
        let r = buscar(&base, 90, 1000);
        assert_eq!(r.len(), MAX_RESULTADOS);
        assert!(r.windows(2).all(|w| w[0].tamano_mb >= w[1].tamano_mb));
        assert_eq!(r[0].nombre, format!("f{:02}.bin", MAX_RESULTADOS + 4));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn la_ruta_mostrada_cambia_la_carpeta_personal_por_una_tilde() {
        let base = carpeta_de_prueba("tilde");
        archivo(&base.join("Descargas").join("pelicula.mkv"), 4000, 300);
        let r = buscar(&base, 90, 1000);
        assert!(r[0].carpeta.starts_with('~'), "{}", r[0].carpeta);
        assert!(!r[0].carpeta.contains(&base.to_string_lossy().to_string()));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn si_se_acaba_el_presupuesto_no_se_informa_como_sin_uso_lo_que_no_se_reviso() {
        let base = carpeta_de_prueba("presupuesto");
        for n in 0..5 {
            archivo(&base.join("grande").join(format!("a{n}.bin")), 2000, 300);
        }
        let b = buscar_archivos_pesados(&[base.clone()], SystemTime::now(), 90, 1000, Some(&base), 2, TIEMPO_MAXIMO);
        assert!(b.elementos.iter().all(|x| !x.es_carpeta), "no debe resumir una carpeta a medio revisar: {:?}", b.elementos);
        assert!(!b.completa, "tiene que avisar que quedó incompleto");
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn no_sigue_enlaces_simbolicos() {
        let base = carpeta_de_prueba("enlace");
        let fuera = carpeta_de_prueba("enlace-fuera");
        archivo(&fuera.join("enorme.bin"), 5000, 300);
        std::os::unix::fs::symlink(&fuera, base.join("atajo")).unwrap();
        assert!(buscar(&base, 90, 1000).is_empty());
        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_dir_all(&fuera);
    }

    #[test]
    fn solo_deja_mostrar_rutas_dentro_de_las_carpetas_personales() {
        let base = carpeta_de_prueba("permitida");
        let fuera = carpeta_de_prueba("permitida-fuera");
        archivo(&base.join("dentro.txt"), 10, 1);
        archivo(&fuera.join("fuera.txt"), 10, 1);
        let raices = sin_anidadas(vec![base.clone()]);
        assert!(ruta_permitida(&base.join("dentro.txt"), &raices).is_some());
        assert!(ruta_permitida(&fuera.join("fuera.txt"), &raices).is_none());
        // un rodeo con ".." para salir de la carpeta no engaña
        let rodeo = base.join("..").join(fuera.file_name().unwrap()).join("fuera.txt");
        assert!(ruta_permitida(&rodeo, &raices).is_none());
        // la carpeta personal en sí y lo que no existe tampoco
        assert!(ruta_permitida(&base, &raices).is_none());
        assert!(ruta_permitida(&base.join("no_existe.txt"), &raices).is_none());
        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_dir_all(&fuera);
    }

    #[test]
    fn descarta_carpetas_anidadas_para_no_contar_dos_veces() {
        let base = carpeta_de_prueba("anidadas");
        fs::create_dir_all(base.join("a").join("b")).unwrap();
        let r = sin_anidadas(vec![base.join("a"), base.join("a").join("b"), base.join("no_existe")]);
        assert_eq!(r.len(), 1);
        assert!(r[0].ends_with("a"));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn quita_el_prefijo_verbatim_de_windows() {
        assert_eq!(sin_prefijo_verbatim(Path::new(r"\\?\C:\Users\x")), std::path::PathBuf::from(r"C:\Users\x"));
        assert_eq!(sin_prefijo_verbatim(Path::new(r"\\?\UNC\srv\share")), std::path::PathBuf::from(r"\\?\UNC\srv\share"));
        assert_eq!(sin_prefijo_verbatim(Path::new("/home/x")), std::path::PathBuf::from("/home/x"));
    }

    /// Mira las carpetas personales REALES de esta PC (solo lectura). No corre sola: `cargo test escaneo_real -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn escaneo_real_del_usuario() {
        let raices = raices_del_usuario();
        let casa = carpeta_personal().and_then(|c| fs::canonicalize(c).ok()).map(|c| sin_prefijo_verbatim(&c));
        let t = Instant::now();
        let b = buscar_archivos_pesados(
            &raices, SystemTime::now(), DIAS_SIN_USO_POR_DEFECTO, MB_MINIMOS_POR_DEFECTO as u64 * 1024 * 1024,
            casa.as_deref(), MAX_ENTRADAS, TIEMPO_MAXIMO,
        );
        println!("raices: {}  resultados: {}  completa: {}  tardo: {:?}", raices.len(), b.elementos.len(), b.completa, t.elapsed());
        for x in b.elementos.iter().take(8) {
            println!("  {:>8.0} MB  {:>4} dias  {}{}  [{}]", x.tamano_mb, x.dias_sin_uso, x.nombre, if x.es_carpeta { " (carpeta)" } else { "" }, x.carpeta);
        }
    }

    #[test]
    fn no_recorre_node_modules_ni_target_de_rust_pero_si_cuenta_su_fecha() {
        let base = carpeta_de_prueba("ajenas");
        archivo(&base.join("web").join("node_modules").join("pesado.bin"), 5000, 300);
        archivo(&base.join("rust").join("Cargo.toml"), 10, 300);
        archivo(&base.join("rust").join("target").join("pesado.bin"), 5000, 300);
        archivo(&base.join("target").join("suelto.bin"), 5000, 300); // sin Cargo.toml al lado: es una carpeta cualquiera
        let r = buscar(&base, 90, 1000);
        let nombres: Vec<&str> = r.iter().map(|x| x.nombre.as_str()).collect();
        assert!(!nombres.contains(&"pesado.bin"), "{nombres:?}");
        assert!(nombres.contains(&"target"), "{nombres:?}");
        // un proyecto cuyo node_modules se tocó hace poco no se da por abandonado
        let base2 = carpeta_de_prueba("ajenas2");
        archivo(&base2.join("app").join("viejo.bin"), 5000, 300);
        fs::create_dir_all(base2.join("app").join("node_modules")).unwrap(); // fecha de hoy
        assert!(buscar(&base2, 90, 1000).iter().all(|x| !(x.es_carpeta && x.nombre == "app")));
        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_dir_all(&base2);
    }

    #[test]
    fn varias_raices_se_revisan_juntas_y_se_ordenan_entre_si() {
        let a = carpeta_de_prueba("multi-a");
        let b = carpeta_de_prueba("multi-b");
        archivo(&a.join("uno.bin"), 3000, 300);
        archivo(&b.join("dos.bin"), 9000, 300);
        let r = buscar_archivos_pesados(&[a.clone(), b.clone()], SystemTime::now(), 90, 1000, None, MAX_ENTRADAS, TIEMPO_MAXIMO);
        assert!(r.completa);
        assert_eq!(r.elementos.iter().map(|x| x.nombre.as_str()).collect::<Vec<_>>(), ["dos.bin", "uno.bin"]);
        let _ = fs::remove_dir_all(&a);
        let _ = fs::remove_dir_all(&b);
    }
}
