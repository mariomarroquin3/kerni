//! Congelar y reanudar procesos (modo pánico). "Congelar" no cierra nada: suspende todos los hilos
//! del proceso con `NtSuspendProcess` y lo deja así hasta que la persona lo reanude. Kerni recuerda
//! qué congeló (pid, nombre y hora de inicio) para reanudarlo, y reanuda todo al salir.
//!
//! Las mismas revisiones que `terminar_proceso` van antes de tocar nada: protegido, uno mismo, pid
//! reutilizado. Las revisiones están en funciones puras para poder probarlas sin Windows.

use std::sync::{Arc, Mutex};

use sysinfo::{ProcessesToUpdate, System};

use crate::sistema::{bloquear, es_protegido, Monitor};

/// Un proceso que Kerni dejó congelado. La hora de inicio distingue el proceso de otro que reutilice el pid.
#[derive(Clone, Debug, PartialEq)]
pub struct Congelado {
    pub pid: u32,
    pub nombre: String,
    pub inicio: u64,
}

/// Lo que Kerni tiene congelado ahora mismo. Vive mientras la app corre; al salir se reanuda todo.
static CONGELADOS: Mutex<Vec<Congelado>> = Mutex::new(Vec::new());

fn lista() -> std::sync::MutexGuard<'static, Vec<Congelado>> {
    CONGELADOS.lock().unwrap_or_else(|e| e.into_inner())
}

/// Revisa el objetivo contra el proceso real (si existe). Devuelve el nombre real si todo cuadra.
/// `real` es `(nombre, hora de inicio)` del proceso con ese pid, o `None` si ya no existe.
pub fn revisar_objetivo(real: Option<(&str, u64)>, pid: u32, nombre: &str, inicio: Option<u64>, propio: u32) -> Result<String, String> {
    if es_protegido(nombre) {
        return Err(format!("{nombre} es un proceso protegido y no se puede congelar"));
    }
    if pid == propio {
        return Err("Kerni no se congela a sí mismo desde aquí".into());
    }
    let (real_nombre, real_inicio) = real.ok_or_else(|| "ese proceso ya no existe".to_string())?;
    if !real_nombre.eq_ignore_ascii_case(nombre.trim()) {
        return Err(format!("el pid {pid} ahora es {real_nombre}, no {nombre}; no hice nada"));
    }
    if let Some(esperado) = inicio {
        if real_inicio != esperado {
            return Err(format!("el pid {pid} ya es otro proceso ({real_nombre} se inició después); no hice nada"));
        }
    }
    if es_protegido(real_nombre) {
        return Err(format!("{real_nombre} es un proceso protegido y no se puede congelar"));
    }
    Ok(real_nombre.to_string())
}

/// Anota un proceso congelado (reemplaza si el pid ya estaba).
pub fn anotar(lista: &mut Vec<Congelado>, c: Congelado) {
    lista.retain(|x| x.pid != c.pid);
    lista.push(c);
}

/// Saca un proceso de la lista y lo devuelve si estaba.
pub fn quitar(lista: &mut Vec<Congelado>, pid: u32) -> Option<Congelado> {
    let pos = lista.iter().position(|x| x.pid == pid)?;
    Some(lista.remove(pos))
}

/// Quita de la lista los procesos que ya no existen (o cuyo pid fue reutilizado). `vivos` es `(pid, inicio)`.
pub fn podar(lista: &mut Vec<Congelado>, vivos: &[(u32, u64)]) {
    lista.retain(|c| vivos.iter().any(|(pid, inicio)| *pid == c.pid && *inicio == c.inicio));
}

/// Los pids que Kerni tiene congelados, después de quitar los que ya no existen. Lo usa la lectura de métricas.
pub fn podar_y_listar(vivos: &[(u32, u64)]) -> Vec<u32> {
    let mut l = lista();
    podar(&mut l, vivos);
    l.iter().map(|c| c.pid).collect()
}

/// Congela un proceso. Pide pid, nombre y, si la lista la trae, la hora de inicio.
#[tauri::command]
pub async fn congelar_proceso(pid: u32, nombre: String, inicio: Option<u64>, monitor: tauri::State<'_, Monitor>) -> Result<String, String> {
    let sys = Arc::clone(&monitor.0);
    tauri::async_runtime::spawn_blocking(move || congelar(&mut bloquear(&sys), pid, &nombre, inicio, std::process::id()))
        .await
        .map_err(|e| e.to_string())?
}

/// Reanuda un proceso que Kerni congeló. Solo reanuda lo que está en su lista, con el mismo pid, nombre y hora.
#[tauri::command]
pub async fn reanudar_proceso(pid: u32, nombre: String, inicio: Option<u64>, monitor: tauri::State<'_, Monitor>) -> Result<String, String> {
    let sys = Arc::clone(&monitor.0);
    tauri::async_runtime::spawn_blocking(move || reanudar(&mut bloquear(&sys), pid, &nombre, inicio, std::process::id()))
        .await
        .map_err(|e| e.to_string())?
}

/// Lo que se llama al cerrar Kerni: nada de lo congelado debe quedar suspendido sin que la app esté para reanudarlo.
pub fn reanudar_todos() {
    let pendientes: Vec<Congelado> = std::mem::take(&mut *lista());
    for c in pendientes {
        let _ = suspender(c.pid, false);
    }
}

fn congelar(sys: &mut System, pid: u32, nombre: &str, inicio: Option<u64>, propio: u32) -> Result<String, String> {
    if lista().iter().any(|c| c.pid == pid) {
        return Ok(format!("{nombre} ya estaba congelado"));
    }
    let real = buscar_vivo(sys, pid);
    let real_ref = real.as_ref().map(|(n, i)| (n.as_str(), *i));
    let nombre_real = revisar_objetivo(real_ref, pid, nombre, inicio, propio)?;
    let inicio_real = real.map(|(_, i)| i).unwrap_or_default();
    suspender(pid, true).map_err(|e| format!("{e}; no lo congelé"))?;
    anotar(&mut lista(), Congelado { pid, nombre: nombre_real.clone(), inicio: inicio_real });
    Ok(format!("Congelé {nombre_real}. Lo pausé, no lo cerré: sigue congelado hasta que lo reanudes."))
}

fn reanudar(sys: &mut System, pid: u32, nombre: &str, inicio: Option<u64>, propio: u32) -> Result<String, String> {
    let guardado = lista().iter().find(|c| c.pid == pid).cloned();
    let Some(guardado) = guardado else {
        return Err(format!("Kerni no tiene congelado {nombre}; no hice nada"));
    };
    let real = buscar_vivo(sys, pid);
    let real_ref = real.as_ref().map(|(n, i)| (n.as_str(), *i));
    if let Err(e) = revisar_objetivo(real_ref, pid, nombre, inicio.or(Some(guardado.inicio)), propio) {
        // Si el proceso ya no es el que se congeló, la entrada es vieja: se olvida para no tocar un pid reutilizado.
        if real.is_none() || real.as_ref().is_some_and(|(_, i)| *i != guardado.inicio) {
            quitar(&mut lista(), pid);
        }
        return Err(e);
    }
    suspender(pid, false).map_err(|e| format!("{e}; sigue congelado"))?;
    quitar(&mut lista(), pid);
    Ok(format!("Reanudé {}", guardado.nombre))
}

/// Busca el proceso vivo con ese pid: `(nombre, hora de inicio)`.
fn buscar_vivo(sys: &mut System, pid: u32) -> Option<(String, u64)> {
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.processes()
        .values()
        .find(|p| p.pid().as_u32() == pid)
        .map(|p| (p.name().to_string_lossy().to_string(), p.start_time()))
}

#[cfg(windows)]
mod nt {
    pub type Handle = *mut std::ffi::c_void;
    /// NTSTATUS: 0 o positivo es éxito.
    pub type NtFn = unsafe extern "system" fn(Handle) -> i32;
    pub const PROCESS_SUSPEND_RESUME: u32 = 0x0800;

    #[link(name = "kernel32")]
    extern "system" {
        pub fn OpenProcess(acceso: u32, heredar: i32, pid: u32) -> Handle;
        pub fn CloseHandle(h: Handle) -> i32;
        pub fn LoadLibraryW(nombre: *const u16) -> Handle;
        pub fn GetProcAddress(modulo: Handle, nombre: *const u8) -> *const std::ffi::c_void;
    }
}

/// Suspende (`suspender = true`) o reanuda todos los hilos de un proceso con `NtSuspendProcess` / `NtResumeProcess`
/// de ntdll. Se busca la función en tiempo de ejecución, sin añadir dependencias.
#[cfg(windows)]
fn suspender(pid: u32, suspender: bool) -> Result<(), String> {
    use nt::*;
    let ntdll: Vec<u16> = "ntdll.dll".encode_utf16().chain(std::iter::once(0)).collect();
    let nombre_fn: &[u8] = if suspender { b"NtSuspendProcess\0" } else { b"NtResumeProcess\0" };
    // SAFETY: las firmas coinciden con las funciones de la API de Windows; el handle se cierra siempre.
    unsafe {
        let modulo = LoadLibraryW(ntdll.as_ptr());
        if modulo.is_null() {
            return Err("No pude cargar ntdll para congelar procesos".into());
        }
        let f = GetProcAddress(modulo, nombre_fn.as_ptr());
        if f.is_null() {
            return Err("No encontré la función de Windows para congelar procesos".into());
        }
        let op: NtFn = std::mem::transmute::<*const std::ffi::c_void, NtFn>(f);
        let h = OpenProcess(PROCESS_SUSPEND_RESUME, 0, pid);
        if h.is_null() {
            return Err("Windows no me dejó tocar ese proceso (puede que necesite permisos de administrador)".into());
        }
        let estado = op(h);
        CloseHandle(h);
        if estado < 0 {
            return Err(format!("Windows no pudo {} el proceso (código {estado:#x})", if suspender { "congelarlo" } else { "reanudarlo" }));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn suspender(_pid: u32, _suspender: bool) -> Result<(), String> {
    Err("Congelar y reanudar procesos solo está disponible en Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(pid: u32, nombre: &str, inicio: u64) -> Congelado {
        Congelado { pid, nombre: nombre.into(), inicio }
    }

    #[test]
    fn rechaza_procesos_protegidos_aunque_coincidan_pid_y_nombre() {
        let r = revisar_objetivo(Some(("svchost.exe", 5)), 10, "svchost.exe", Some(5), 99);
        assert!(r.unwrap_err().contains("protegido"));
        let r = revisar_objetivo(Some(("Explorer.exe", 5)), 10, "explorer.exe", None, 99);
        assert!(r.is_err());
    }

    #[test]
    fn no_se_congela_a_si_mismo() {
        let r = revisar_objetivo(Some(("miapp.exe", 5)), 42, "miapp.exe", None, 42);
        assert!(r.unwrap_err().contains("sí mismo"));
    }

    #[test]
    fn rechaza_si_el_nombre_no_coincide() {
        let r = revisar_objetivo(Some(("otro.exe", 5)), 10, "miapp.exe", None, 99);
        assert!(r.unwrap_err().contains("ahora es otro.exe"));
    }

    #[test]
    fn rechaza_si_el_pid_fue_reutilizado() {
        let r = revisar_objetivo(Some(("miapp.exe", 500)), 10, "miapp.exe", Some(5), 99);
        assert!(r.unwrap_err().contains("ya es otro proceso"));
    }

    #[test]
    fn acepta_y_devuelve_el_nombre_real() {
        let r = revisar_objetivo(Some(("MiApp.exe", 5)), 10, " miapp.exe ", Some(5), 99);
        assert_eq!(r.unwrap(), "MiApp.exe");
    }

    #[test]
    fn un_proceso_que_ya_no_existe_se_rechaza() {
        assert!(revisar_objetivo(None, 10, "miapp.exe", None, 99).unwrap_err().contains("ya no existe"));
    }

    #[test]
    fn la_lista_reemplaza_quita_y_poda() {
        let mut l = Vec::new();
        anotar(&mut l, c(10, "a.exe", 1));
        anotar(&mut l, c(10, "a.exe", 2));
        assert_eq!(l, vec![c(10, "a.exe", 2)]);
        anotar(&mut l, c(11, "b.exe", 3));
        assert_eq!(quitar(&mut l, 10), Some(c(10, "a.exe", 2)));
        assert_eq!(quitar(&mut l, 10), None);
        anotar(&mut l, c(12, "c.exe", 4));
        anotar(&mut l, c(13, "d.exe", 5));
        // 11 murió; 12 reutilizó el pid con otra hora; 13 sigue igual.
        podar(&mut l, &[(12, 9), (13, 5)]);
        assert_eq!(l, vec![c(13, "d.exe", 5)]);
    }
}
