//! Núcleo de salud de Kerni: lee métricas reales de la PC y ejecuta, solo
//! cuando la persona lo aprobó en pantalla, las dos acciones del hito 1:
//! cerrar un proceso y limpiar archivos temporales.
//!
//! Aunque el backend ya validó la propuesta del modelo, aquí se revisa otra
//! vez: este es el único lugar que toca el sistema.

#[cfg(any(not(target_os = "linux"), test))]
use std::fs;
use std::path::Path;
use std::sync::Mutex;
#[cfg(any(not(target_os = "linux"), test))]
use std::time::{Duration, SystemTime};

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
}
