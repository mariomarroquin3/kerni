//! Herramientas extra de Kerni: datos del equipo, programas de inicio, red, papelera, actualizaciones y ajustes de Windows.
//!
//! Igual que `sistema.rs`, este es código que toca el sistema, así que cada comando vuelve a validar lo que recibe
//! aunque el backend y la interfaz ya lo hayan revisado (regla 2). Casi todo es de solo lectura. Lo único que cambia
//! algo es `cambiar_inicio` (reversible: es el mismo interruptor del Administrador de tareas) y `vaciar_papelera`
//! (irreversible, por eso la tarjeta de confirmación lo dice).
//!
//! Nada de lo que viene del sistema (nombres de programas, títulos de actualizaciones) se trata como instrucción:
//! se limpia con `limpiar_texto` y la interfaz lo pinta con `textContent`.

use std::io::Read;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

#[cfg(not(windows))]
const SOLO_WINDOWS: &str = "Esta función por ahora solo está disponible en Windows";
const MB: f64 = 1024.0 * 1024.0;
/// Todo lo que se pida a PowerShell sale en UTF-8 y sin barras de progreso.
const PS_PREFIJO: &str = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;$ProgressPreference='SilentlyContinue';";

// ---------- Utilidades ----------

/// Quita caracteres de control y recorta: lo que viene del sistema es dato no confiable.
pub fn limpiar_texto(s: &str, max: usize) -> String {
    let limpio: String = s.chars().filter(|c| !c.is_control()).collect();
    limpio.trim().chars().take(max).collect()
}

/// Corre un comando con tiempo máximo y devuelve su salida estándar (bytes → UTF-8 con pérdida).
fn ejecutar(cmd: &mut Command, limite: Duration) -> Result<String, String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: sin ventanita de consola
    }
    let mut hijo = cmd.spawn().map_err(|e| format!("No pude ejecutar el comando: {e}"))?;
    let mut salida = hijo.stdout.take().ok_or_else(|| "El comando no entregó salida".to_string())?;
    let lector = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = salida.read_to_end(&mut bytes);
        bytes
    });
    let inicio = Instant::now();
    loop {
        match hijo.try_wait() {
            Ok(Some(estado)) => {
                let bytes = lector.join().unwrap_or_default();
                let texto = String::from_utf8_lossy(&bytes).into_owned();
                return if estado.success() { Ok(texto) } else { Err(format!("El comando terminó con error ({estado})")) };
            }
            Ok(None) if inicio.elapsed() >= limite => {
                let _ = hijo.kill();
                let _ = hijo.wait();
                return Err("Tardó demasiado y lo cancelé".to_string());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(60)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for trozo in bytes.chunks(3) {
        let b = [trozo[0], *trozo.get(1).unwrap_or(&0), *trozo.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        s.push(T[(n >> 18) as usize & 63] as char);
        s.push(T[(n >> 12) as usize & 63] as char);
        s.push(if trozo.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        s.push(if trozo.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    s
}

/// PowerShell con un guion fijo (nunca armado con texto de la persona ni del modelo). Va codificado para no depender de comillas.
#[cfg(windows)]
fn ps(script: &str, limite: Duration) -> Result<String, String> {
    let completo = format!("{PS_PREFIJO}{script}");
    let utf16: Vec<u8> = completo.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand"]).arg(base64(&utf16));
    ejecutar(&mut cmd, limite)
}

#[cfg(not(windows))]
fn ps(_script: &str, _limite: Duration) -> Result<String, String> {
    Err(SOLO_WINDOWS.to_string())
}

/// PowerShell devuelve nada, un objeto o una lista según cuántos resultados haya: se normaliza siempre a lista.
fn lista_json(salida: &str) -> Vec<Value> {
    let s = salida.trim().trim_start_matches('\u{feff}');
    if s.is_empty() {
        return Vec::new();
    }
    match serde_json::from_str::<Value>(s) {
        Ok(Value::Array(a)) => a,
        Ok(v @ Value::Object(_)) => vec![v],
        _ => Vec::new(),
    }
}

fn texto(v: &Value, clave: &str, max: usize) -> String {
    v.get(clave).and_then(Value::as_str).map(|s| limpiar_texto(s, max)).unwrap_or_default()
}

fn numero(v: &Value, clave: &str) -> f64 {
    v.get(clave).and_then(Value::as_f64).unwrap_or(0.0)
}

fn booleano(v: &Value, clave: &str) -> bool {
    v.get(clave).and_then(Value::as_bool).unwrap_or(false)
}

// ---------- Información del equipo (solo lectura) ----------

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InfoEquipo {
    pub fabricante: String,
    pub modelo: String,
    pub so: String,
    pub version: String,
    pub cpu: String,
    pub nucleos: u32,
    pub ram_mb: u64,
}

pub fn parsear_equipo(salida: &str) -> Option<InfoEquipo> {
    let v = lista_json(salida).into_iter().next()?;
    let equipo = InfoEquipo {
        fabricante: texto(&v, "fabricante", 60),
        modelo: texto(&v, "modelo", 80),
        so: texto(&v, "so", 80),
        version: texto(&v, "version", 40),
        cpu: texto(&v, "cpu", 100),
        nucleos: numero(&v, "nucleos") as u32,
        ram_mb: numero(&v, "ramMb") as u64,
    };
    (!equipo.modelo.is_empty() || !equipo.fabricante.is_empty()).then_some(equipo)
}

#[cfg(windows)]
fn leer_equipo() -> Result<InfoEquipo, String> {
    let salida = ps(
        "$c=Get-CimInstance Win32_ComputerSystem;$o=Get-CimInstance Win32_OperatingSystem;$p=Get-CimInstance Win32_Processor|Select-Object -First 1;\
         [pscustomobject]@{fabricante=$c.Manufacturer;modelo=$c.Model;so=$o.Caption;version=$o.Version;cpu=$p.Name;nucleos=$p.NumberOfCores;ramMb=[math]::Round($c.TotalPhysicalMemory/1MB)}|ConvertTo-Json -Compress",
        Duration::from_secs(20),
    )?;
    parsear_equipo(&salida).ok_or_else(|| "No pude leer los datos del equipo".to_string())
}

#[cfg(not(windows))]
fn leer_equipo() -> Result<InfoEquipo, String> {
    let dmi = |n: &str| std::fs::read_to_string(format!("/sys/class/dmi/id/{n}")).map(|s| limpiar_texto(&s, 80)).unwrap_or_default();
    let so = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|s| s.lines().find_map(|l| l.strip_prefix("PRETTY_NAME=").map(|v| limpiar_texto(v.trim_matches('"'), 80))))
        .unwrap_or_default();
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();
    let cpu = sys.cpus().first().map(|c| limpiar_texto(c.brand(), 100)).unwrap_or_default();
    Ok(InfoEquipo {
        fabricante: dmi("sys_vendor"),
        modelo: dmi("product_name"),
        so,
        version: String::new(),
        cpu,
        nucleos: sys.cpus().len() as u32,
        ram_mb: (sys.total_memory() as f64 / MB) as u64,
    })
}

static EQUIPO: OnceLock<InfoEquipo> = OnceLock::new();

/// Modelo, sistema, procesador y memoria. Se lee una vez y se guarda: no cambia mientras la app está abierta.
#[tauri::command]
pub async fn info_equipo() -> Result<InfoEquipo, String> {
    if let Some(e) = EQUIPO.get() {
        return Ok(e.clone());
    }
    let e = tauri::async_runtime::spawn_blocking(leer_equipo).await.map_err(|e| e.to_string())??;
    let _ = EQUIPO.set(e.clone());
    Ok(e)
}

// ---------- Programas de inicio ----------

const RUN_USUARIO: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_EQUIPO: &str = r"HKLM\Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_EQUIPO_32: &str = r"HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run";
const APROBADOS_USUARIO: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
const APROBADOS_EQUIPO: &str = r"HKLM\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
/// Lo que escribe el Administrador de tareas: primer byte 02 = activo, 03 = desactivado (el resto, ceros).
const HEX_ACTIVO: &str = "020000000000000000000000";
const HEX_INACTIVO: &str = "030000000000000000000000";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramaInicio {
    pub nombre: String,
    pub comando: String,
    /// "usuario" o "equipo". Solo los del usuario se pueden cambiar sin permisos de administrador.
    pub ambito: String,
    pub activo: bool,
    pub puede_cambiar: bool,
}

#[derive(Debug, PartialEq)]
pub struct EntradaReg {
    pub nombre: String,
    pub tipo: String,
    pub valor: String,
}

/// Lee la salida de `reg query`: renglones "    nombre    REG_TIPO    valor". El nombre puede tener espacios.
pub fn parsear_reg(salida: &str) -> Vec<EntradaReg> {
    salida
        .lines()
        .filter(|l| l.starts_with("    "))
        .filter_map(|l| {
            let pos = l.find("    REG_")?;
            let nombre = l[..pos].trim().to_string();
            let resto = &l[pos + 4..];
            let (tipo, valor) = resto.split_once("    ").unwrap_or((resto, ""));
            (!nombre.is_empty()).then(|| EntradaReg { nombre, tipo: tipo.trim().to_string(), valor: valor.trim().to_string() })
        })
        .collect()
}

/// Un valor de StartupApproved está activo si el primer byte es par (02, 06); desactivado si es impar (03, 07).
pub fn inicio_activo(hex: &str) -> bool {
    hex.get(..2).and_then(|b| u8::from_str_radix(b, 16).ok()).map_or(true, |b| b & 1 == 0)
}

fn consultar_reg(clave: &str) -> Vec<EntradaReg> {
    // Si la clave no existe `reg` falla: es lo mismo que "no hay nada".
    ejecutar(Command::new("reg").args(["query", clave]), Duration::from_secs(10)).map(|s| parsear_reg(&s)).unwrap_or_default()
}

#[cfg(windows)]
fn leer_inicio() -> Result<Vec<ProgramaInicio>, String> {
    let mut todos = Vec::new();
    for (clave, aprobados, ambito, puede_cambiar) in [
        (RUN_USUARIO, APROBADOS_USUARIO, "usuario", true),
        (RUN_EQUIPO, APROBADOS_EQUIPO, "equipo", false),
        (RUN_EQUIPO_32, APROBADOS_EQUIPO, "equipo", false),
    ] {
        let estados = consultar_reg(aprobados);
        for e in consultar_reg(clave).into_iter().filter(|e| e.tipo.starts_with("REG_SZ") || e.tipo.starts_with("REG_EXPAND_SZ")) {
            let activo = estados.iter().find(|a| a.nombre.eq_ignore_ascii_case(&e.nombre)).map_or(true, |a| inicio_activo(&a.valor));
            todos.push(ProgramaInicio {
                nombre: limpiar_texto(&e.nombre, 80),
                comando: limpiar_texto(&e.valor, 160),
                ambito: ambito.to_string(),
                activo,
                puede_cambiar,
            });
        }
    }
    todos.sort_by_key(|p| p.nombre.to_lowercase());
    Ok(todos)
}

#[cfg(not(windows))]
fn leer_inicio() -> Result<Vec<ProgramaInicio>, String> {
    Err(SOLO_WINDOWS.to_string())
}

/// Lista lo que arranca con Windows y si está activo. Solo lectura.
#[tauri::command]
pub async fn programas_inicio() -> Result<Vec<ProgramaInicio>, String> {
    tauri::async_runtime::spawn_blocking(leer_inicio).await.map_err(|e| e.to_string())?
}

/// Activa o desactiva un programa de inicio DEL USUARIO. Revalida contra la lista real: el nombre debe existir ahí.
/// No borra nada: cambia el mismo interruptor que usa el Administrador de tareas, así que se puede deshacer.
#[tauri::command]
pub async fn cambiar_inicio(nombre: String, activar: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let lista = leer_inicio()?;
        let programa = lista
            .iter()
            .find(|p| p.nombre.eq_ignore_ascii_case(nombre.trim()))
            .ok_or_else(|| "No encuentro ese programa en la lista de inicio".to_string())?;
        if !programa.puede_cambiar {
            return Err("Ese programa es del equipo y para cambiarlo hacen falta permisos de administrador. Podés hacerlo desde el Administrador de tareas".to_string());
        }
        // El nombre real (tal como está en el registro) viene de la lista, no de lo que mandó la interfaz.
        let real = consultar_reg(RUN_USUARIO)
            .into_iter()
            .find(|e| limpiar_texto(&e.nombre, 80).eq_ignore_ascii_case(&programa.nombre))
            .map(|e| e.nombre)
            .ok_or_else(|| "No encuentro ese programa en la lista de inicio".to_string())?;
        let hex = if activar { HEX_ACTIVO } else { HEX_INACTIVO };
        ejecutar(
            Command::new("reg").args(["add", APROBADOS_USUARIO, "/v", &real, "/t", "REG_BINARY", "/d", hex, "/f"]),
            Duration::from_secs(10),
        )
        .map_err(|_| "No pude cambiarlo".to_string())?;
        Ok(format!("{} {} al iniciar Windows", programa.nombre, if activar { "vuelve a abrirse" } else { "ya no se abre" }))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- Red (solo lectura) ----------

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Adaptador {
    pub nombre: String,
    pub tipo: String,
    pub velocidad: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstadoRed {
    pub internet: bool,
    pub latencia_ms: Option<u32>,
    pub dns: bool,
    pub adaptadores: Vec<Adaptador>,
}

pub fn tipo_de_adaptador(medio: &str, descripcion: &str) -> String {
    let m = format!("{medio} {descripcion}").to_lowercase();
    if m.contains("802.11") || m.contains("wi-fi") || m.contains("wireless") {
        "Wi-Fi".to_string()
    } else if m.contains("802.3") || m.contains("ethernet") {
        "Cable".to_string()
    } else {
        "Otro".to_string()
    }
}

pub fn parsear_adaptadores(salida: &str) -> Vec<Adaptador> {
    lista_json(salida)
        .iter()
        .map(|v| Adaptador {
            nombre: texto(v, "Name", 60),
            tipo: tipo_de_adaptador(&texto(v, "PhysicalMediaType", 40), &texto(v, "InterfaceDescription", 100)),
            velocidad: texto(v, "LinkSpeed", 30),
        })
        .filter(|a| !a.nombre.is_empty())
        .collect()
}

/// Intenta abrir una conexión TCP corta a un servidor público y mide cuánto tarda. No manda ni recibe datos.
fn probar_conexion(direcciones: &[SocketAddr], limite: Duration) -> Option<u32> {
    direcciones.iter().find_map(|d| {
        let t = Instant::now();
        TcpStream::connect_timeout(d, limite).ok().map(|_| t.elapsed().as_millis() as u32)
    })
}

#[cfg(windows)]
fn leer_adaptadores() -> Vec<Adaptador> {
    ps(
        "Get-NetAdapter -Physical|Where-Object Status -eq 'Up'|Select-Object Name,InterfaceDescription,LinkSpeed,PhysicalMediaType|ConvertTo-Json -Compress",
        Duration::from_secs(15),
    )
    .map(|s| parsear_adaptadores(&s))
    .unwrap_or_default()
}

#[cfg(not(windows))]
fn leer_adaptadores() -> Vec<Adaptador> {
    Vec::new()
}

fn leer_red() -> EstadoRed {
    let publicas: Vec<SocketAddr> = ["1.1.1.1:443", "8.8.8.8:443"].iter().filter_map(|a| a.parse().ok()).collect();
    let latencia_ms = probar_conexion(&publicas, Duration::from_secs(3));
    let dns = ("example.com", 443).to_socket_addrs().map(|mut a| a.next().is_some()).unwrap_or(false);
    EstadoRed { internet: latencia_ms.is_some(), latencia_ms, dns, adaptadores: leer_adaptadores() }
}

/// ¿Hay internet?, ¿cuánto tarda?, ¿resuelve nombres? y qué conexión está activa. Solo lectura.
#[tauri::command]
pub async fn estado_red() -> Result<EstadoRed, String> {
    tauri::async_runtime::spawn_blocking(leer_red).await.map_err(|e| e.to_string())
}

// ---------- Actualizaciones de Windows (solo lectura) ----------

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActualizacionPendiente {
    pub titulo: String,
    pub mb: f64,
    pub critica: bool,
    pub reinicio: bool,
}

pub fn parsear_actualizaciones(salida: &str) -> Vec<ActualizacionPendiente> {
    lista_json(salida)
        .iter()
        .map(|v| ActualizacionPendiente { titulo: texto(v, "titulo", 160), mb: numero(v, "mb"), critica: booleano(v, "critica"), reinicio: booleano(v, "reinicio") })
        .filter(|a| !a.titulo.is_empty())
        .collect()
}

/// Pregunta a Windows Update qué hay pendiente. NO descarga ni instala nada: solo busca. Puede tardar un buen rato.
#[tauri::command]
pub async fn actualizaciones_windows() -> Result<Vec<ActualizacionPendiente>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let salida = ps(
            "$s=New-Object -ComObject Microsoft.Update.Session;$r=$s.CreateUpdateSearcher().Search(\"IsInstalled=0 and IsHidden=0\");\
             @($r.Updates|ForEach-Object{[pscustomobject]@{titulo=$_.Title;mb=[math]::Round($_.MaxDownloadSize/1MB);critica=($_.MsrcSeverity -eq 'Critical');reinicio=($_.InstallationBehavior.RebootBehavior -ne 0)}})|ConvertTo-Json -Compress",
            Duration::from_secs(120),
        )?;
        Ok(parsear_actualizaciones(&salida))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- Papelera ----------

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Papelera {
    pub elementos: u32,
    pub mb: f64,
}

/// La salida es "cantidad,bytes".
pub fn parsear_papelera(salida: &str) -> Option<Papelera> {
    let (n, bytes) = salida.trim().split_once(',')?;
    Some(Papelera { elementos: n.trim().parse().ok()?, mb: bytes.trim().parse::<f64>().ok()? / MB })
}

fn medir_papelera() -> Result<Papelera, String> {
    let salida = ps(
        "$p=(New-Object -ComObject Shell.Application).NameSpace(10);$n=0;$b=[int64]0;foreach($i in $p.Items()){$n++;$b+=[int64]$i.Size};\"$n,$b\"",
        Duration::from_secs(30),
    )?;
    parsear_papelera(&salida).ok_or_else(|| "No pude medir la papelera".to_string())
}

/// Cuántas cosas hay en la papelera y cuánto pesan. Solo lectura.
#[tauri::command]
pub async fn papelera() -> Result<Papelera, String> {
    tauri::async_runtime::spawn_blocking(medir_papelera).await.map_err(|e| e.to_string())?
}

/// Vacía la papelera. NO se puede deshacer. Devuelve lo que había antes de vaciarla.
#[tauri::command]
pub async fn vaciar_papelera() -> Result<Papelera, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let antes = medir_papelera()?;
        if antes.elementos == 0 {
            return Ok(antes);
        }
        ps("Clear-RecycleBin -Force -ErrorAction Stop", Duration::from_secs(120)).map_err(|_| "No pude vaciar la papelera".to_string())?;
        Ok(antes)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- Abrir un ajuste de Windows ----------

/// Lista cerrada: la interfaz y el backend mandan un nombre, nunca una dirección. Lo que no esté aquí no se abre.
pub fn direccion_de_ajuste(destino: &str) -> Option<&'static str> {
    match destino {
        "almacenamiento" => Some("ms-settings:storagesense"),
        "aplicaciones" => Some("ms-settings:appsfeatures"),
        "inicio" => Some("ms-settings:startupapps"),
        "actualizaciones" => Some("ms-settings:windowsupdate"),
        "red" => Some("ms-settings:network"),
        "energia" => Some("ms-settings:powersleep"),
        _ => None,
    }
}

#[tauri::command]
pub fn abrir_ajuste(destino: String) -> Result<(), String> {
    let direccion = direccion_de_ajuste(destino.trim()).ok_or_else(|| "Ese ajuste no está en mi lista".to_string())?;
    abrir_direccion(direccion)
}

#[cfg(windows)]
fn abrir_direccion(direccion: &str) -> Result<(), String> {
    Command::new("explorer").arg(direccion).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn abrir_direccion(_direccion: &str) -> Result<(), String> {
    Err(SOLO_WINDOWS.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limpia_texto_del_sistema() {
        assert_eq!(limpiar_texto("  hola\u{0007}\nmundo  ", 50), "holamundo");
        assert_eq!(limpiar_texto("abcdef", 3), "abc");
    }

    #[test]
    fn base64_coincide_con_los_vectores_conocidos() {
        assert_eq!(base64(b"Man"), "TWFu");
        assert_eq!(base64(b"Ma"), "TWE=");
        assert_eq!(base64(b"M"), "TQ==");
        assert_eq!(base64(b""), "");
    }

    #[test]
    fn lista_json_acepta_nada_un_objeto_o_una_lista() {
        assert!(lista_json("").is_empty());
        assert!(lista_json("basura").is_empty());
        assert_eq!(lista_json("{\"a\":1}").len(), 1);
        assert_eq!(lista_json("\u{feff}[{\"a\":1},{\"a\":2}]").len(), 2);
    }

    #[test]
    fn lee_los_datos_del_equipo_y_los_limpia() {
        let e = parsear_equipo("{\"fabricante\":\"Dell Inc.\",\"modelo\":\"Latitude 3120\",\"so\":\"Microsoft Windows 11 Home\",\"version\":\"10.0.26200\",\"cpu\":\"Intel(R) Pentium(R) Silver N6000\",\"nucleos\":4,\"ramMb\":3912}").unwrap();
        assert_eq!(e.modelo, "Latitude 3120");
        assert_eq!(e.nucleos, 4);
        assert_eq!(e.ram_mb, 3912);
        let raro = parsear_equipo("{\"modelo\":\"X\\u0007<script>\",\"fabricante\":\"\"}").unwrap();
        assert_eq!(raro.modelo, "X<script>"); // sin control; en pantalla se pinta con textContent
        assert!(parsear_equipo("{}").is_none());
        assert!(parsear_equipo("no es json").is_none());
    }

    #[test]
    fn parsea_reg_query_con_nombres_con_espacios() {
        let salida = "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    OneDrive    REG_SZ    \"C:\\Program Files\\OneDrive.exe\" /background\r\n    Mi Programa Raro    REG_EXPAND_SZ    %APPDATA%\\x.exe\r\n    Vacio    REG_SZ    \r\n\r\n";
        let r = parsear_reg(salida);
        assert_eq!(r.len(), 3);
        assert_eq!(r[0].nombre, "OneDrive");
        assert_eq!(r[0].tipo, "REG_SZ");
        assert!(r[0].valor.ends_with("/background"));
        assert_eq!(r[1].nombre, "Mi Programa Raro");
        assert_eq!(r[1].tipo, "REG_EXPAND_SZ");
        assert_eq!(r[2].valor, "");
        assert!(parsear_reg("HKEY_X\r\n\r\n").is_empty());
    }

    #[test]
    fn el_primer_byte_dice_si_el_inicio_esta_activo() {
        assert!(inicio_activo("020000000000000000000000"));
        assert!(inicio_activo("060000000000000000000000"));
        assert!(!inicio_activo("030000000000000000000000"));
        assert!(!inicio_activo("07FFFFFFFFFFFFFFFFFFFFFF"));
        assert!(inicio_activo("")); // sin dato: Windows lo trata como activo
        assert!(inicio_activo("zz"));
        assert_eq!(HEX_ACTIVO.len(), HEX_INACTIVO.len());
        assert!(inicio_activo(HEX_ACTIVO) && !inicio_activo(HEX_INACTIVO));
    }

    #[test]
    fn clasifica_los_adaptadores_de_red() {
        assert_eq!(tipo_de_adaptador("Native 802.11", "Intel Wireless-AC"), "Wi-Fi");
        assert_eq!(tipo_de_adaptador("802.3", "Realtek PCIe GbE"), "Cable");
        assert_eq!(tipo_de_adaptador("", "Algo raro"), "Otro");
        let a = parsear_adaptadores("{\"Name\":\"Wi-Fi\",\"InterfaceDescription\":\"Intel\",\"LinkSpeed\":\"144 Mbps\",\"PhysicalMediaType\":\"Native 802.11\"}");
        assert_eq!(a, vec![Adaptador { nombre: "Wi-Fi".into(), tipo: "Wi-Fi".into(), velocidad: "144 Mbps".into() }]);
        assert!(parsear_adaptadores("").is_empty());
    }

    #[test]
    fn parsea_actualizaciones_pendientes() {
        let a = parsear_actualizaciones("[{\"titulo\":\"Actualización acumulativa 2026-10\",\"mb\":512,\"critica\":true,\"reinicio\":true},{\"titulo\":\"\",\"mb\":1}]");
        assert_eq!(a.len(), 1);
        assert!(a[0].critica && a[0].reinicio);
        assert_eq!(a[0].mb, 512.0);
        assert_eq!(parsear_actualizaciones("{\"titulo\":\"Una sola\",\"mb\":3}").len(), 1);
        assert!(parsear_actualizaciones("").is_empty());
    }

    #[test]
    fn parsea_la_papelera() {
        let p = parsear_papelera("12,1048576\r\n").unwrap();
        assert_eq!(p.elementos, 12);
        assert_eq!(p.mb, 1.0);
        assert_eq!(parsear_papelera("0,0").unwrap().elementos, 0);
        assert!(parsear_papelera("error").is_none());
        assert!(parsear_papelera("a,b").is_none());
    }

    #[test]
    fn solo_abre_ajustes_de_la_lista() {
        assert_eq!(direccion_de_ajuste("almacenamiento"), Some("ms-settings:storagesense"));
        assert_eq!(direccion_de_ajuste("actualizaciones"), Some("ms-settings:windowsupdate"));
        for malo in ["", "cmd.exe", "ms-settings:privacy", "http://malo.com", "almacenamiento && calc", "../x"] {
            assert_eq!(direccion_de_ajuste(malo), None, "{malo}");
        }
        assert!(abrir_ajuste("calc.exe".to_string()).is_err());
    }

    #[test]
    fn un_comando_que_se_cuelga_se_cancela_y_uno_normal_devuelve_su_salida() {
        #[cfg(windows)]
        {
            let ok = ejecutar(Command::new("cmd").args(["/C", "echo hola"]), Duration::from_secs(10)).unwrap();
            assert!(ok.contains("hola"));
            let t = Instant::now();
            let colgado = ejecutar(Command::new("ping").args(["-n", "30", "127.0.0.1"]), Duration::from_millis(300));
            assert!(colgado.is_err());
            assert!(t.elapsed() < Duration::from_secs(5));
        }
        assert!(ejecutar(&mut Command::new("comando-que-no-existe-kerni"), Duration::from_secs(1)).is_err());
    }

    #[test]
    fn la_prueba_de_conexion_falla_rapido_si_no_hay_a_donde_llegar() {
        // 192.0.2.1 es una dirección reservada para documentación: nunca responde.
        let d: Vec<SocketAddr> = vec!["192.0.2.1:9".parse().unwrap()];
        let t = Instant::now();
        assert_eq!(probar_conexion(&d, Duration::from_millis(200)), None);
        assert!(t.elapsed() < Duration::from_secs(3));
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "usa el sistema real: cargo test -- --ignored"]
    fn lecturas_reales_en_este_equipo() {
        let e = leer_equipo().unwrap();
        println!("{e:?}");
        assert!(!e.modelo.is_empty());
        let inicio = leer_inicio().unwrap();
        println!("{} programas de inicio, p.ej. {:?}", inicio.len(), inicio.first());
        let red = leer_red();
        println!("{red:?}");
        println!("{:?}", medir_papelera());
    }
}
