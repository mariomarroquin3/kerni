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
                let texto = String::from_utf8_lossy(&bytes).trim_start_matches('\u{feff}').to_string();
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
fn ps(script: &str, limite: Duration) -> Result<String, String> {
    ps_con_datos(script, limite, &[])
}

/// Igual, pero con datos pasados como variables de entorno (`$env:NOMBRE`): así un nombre con comillas, tildes o símbolos
/// nunca se mezcla con el código del guion.
#[cfg(windows)]
fn ps_con_datos(script: &str, limite: Duration, datos: &[(&str, &str)]) -> Result<String, String> {
    let completo = format!("{PS_PREFIJO}{script}");
    let utf16: Vec<u8> = completo.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand"]).arg(base64(&utf16));
    for (clave, valor) in datos {
        cmd.env(clave, valor);
    }
    ejecutar(&mut cmd, limite)
}

#[cfg(not(windows))]
fn ps_con_datos(_script: &str, _limite: Duration, _datos: &[(&str, &str)]) -> Result<String, String> {
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

const CLAVE_APROBADOS_USUARIO: &str = r"HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

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

/// Lee `Run` de usuario y de equipo y el interruptor de `StartupApproved`: primer byte par = activo, impar = desactivado.
const GUION_INICIO: &str = "$base='Software\\Microsoft\\Windows\\CurrentVersion';\
$f=@(@{c=\"HKCU:\\$base\\Run\";a=\"HKCU:\\$base\\Explorer\\StartupApproved\\Run\";m='usuario';p=$true},\
@{c=\"HKLM:\\$base\\Run\";a=\"HKLM:\\$base\\Explorer\\StartupApproved\\Run\";m='equipo';p=$false},\
@{c=\"HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run\";a=\"HKLM:\\$base\\Explorer\\StartupApproved\\Run\";m='equipo';p=$false});\
$auto=@('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider');\
$r=foreach($x in $f){$k=Get-ItemProperty -Path $x.c -ErrorAction SilentlyContinue;if(-not $k){continue};$ap=Get-ItemProperty -Path $x.a -ErrorAction SilentlyContinue;\
foreach($n in $k.PSObject.Properties){if($auto -contains $n.Name){continue};$act=$true;\
if($ap){$b=$ap.PSObject.Properties[$n.Name];if($b -and $b.Value -is [byte[]] -and $b.Value.Length -gt 0){$act=(($b.Value[0] -band 1) -eq 0)}};\
[pscustomobject]@{nombre=$n.Name;comando=[string]$n.Value;ambito=$x.m;activo=$act;puedeCambiar=$x.p}}};\
if($r){@($r)|ConvertTo-Json -Compress}else{'[]'}";

/// Un nombre que la limpieza cambiaría (muy largo o con caracteres raros) no se puede devolver tal cual al registro: se muestra, pero no se cambia.
pub fn parsear_inicio(salida: &str) -> Vec<ProgramaInicio> {
    let mut lista: Vec<ProgramaInicio> = lista_json(salida)
        .iter()
        .filter_map(|v| {
            let bruto = v.get("nombre").and_then(Value::as_str)?;
            let nombre = limpiar_texto(bruto, 80);
            if nombre.is_empty() {
                return None;
            }
            let ambito = if texto(v, "ambito", 10) == "usuario" { "usuario" } else { "equipo" };
            Some(ProgramaInicio {
                puede_cambiar: ambito == "usuario" && booleano(v, "puedeCambiar") && nombre == bruto,
                nombre,
                comando: texto(v, "comando", 160),
                ambito: ambito.to_string(),
                activo: v.get("activo").and_then(Value::as_bool).unwrap_or(true),
            })
        })
        .collect();
    lista.sort_by_key(|p| p.nombre.to_lowercase());
    lista
}

fn leer_inicio() -> Result<Vec<ProgramaInicio>, String> {
    Ok(parsear_inicio(&ps(GUION_INICIO, Duration::from_secs(20))?))
}

/// Lista lo que arranca con Windows y si está activo. Solo lectura.
#[tauri::command]
pub async fn programas_inicio() -> Result<Vec<ProgramaInicio>, String> {
    tauri::async_runtime::spawn_blocking(leer_inicio).await.map_err(|e| e.to_string())?
}

/// Activa o desactiva un programa de inicio DEL USUARIO. Revalida contra la lista real: el nombre debe existir ahí y ser del usuario.
/// No borra nada: cambia el mismo interruptor que usa el Administrador de tareas, así que se puede deshacer.
fn aplicar_cambio_inicio(nombre: &str, activar: bool) -> Result<String, String> {
    let lista = leer_inicio()?;
    let programa = lista
        .iter()
        .find(|p| p.nombre.eq_ignore_ascii_case(nombre.trim()))
        .ok_or_else(|| "No encuentro ese programa en la lista de inicio".to_string())?;
    if !programa.puede_cambiar {
        return Err("Ese programa es del equipo y para cambiarlo hacen falta permisos de administrador. Podés hacerlo desde el Administrador de tareas".to_string());
    }
    // El nombre viaja por una variable de entorno, no dentro del guion; el valor son los 12 bytes que escribe el Administrador de tareas.
    let guion = format!(
        "$k='{CLAVE_APROBADOS_USUARIO}';if(-not(Test-Path $k)){{New-Item -Path $k -Force|Out-Null}};\
         Set-ItemProperty -Path $k -Name $env:KERNI_NOMBRE -Value ([byte[]](@({},0,0,0,0,0,0,0,0,0,0,0))) -Type Binary -ErrorAction Stop",
        if activar { 2 } else { 3 }
    );
    ps_con_datos(&guion, Duration::from_secs(15), &[("KERNI_NOMBRE", &programa.nombre)]).map_err(|_| "No pude cambiarlo".to_string())?;
    Ok(format!("{} {} al iniciar Windows", programa.nombre, if activar { "vuelve a abrirse" } else { "ya no se abre" }))
}

#[tauri::command]
pub async fn cambiar_inicio(nombre: String, activar: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || aplicar_cambio_inicio(&nombre, activar)).await.map_err(|e| e.to_string())?
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
    // Sin internet, resolver un nombre puede quedarse esperando muchos segundos: se le da un máximo de 4.
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(("example.com", 443).to_socket_addrs().map(|mut a| a.next().is_some()).unwrap_or(false));
    });
    let dns = rx.recv_timeout(Duration::from_secs(4)).unwrap_or(false);
    EstadoRed { internet: latencia_ms.is_some(), latencia_ms, dns, adaptadores: leer_adaptadores() }
}

/// ¿Hay internet?, ¿cuánto tarda?, ¿resuelve nombres? y qué conexión está activa. Solo lectura.
#[tauri::command]
pub async fn estado_red() -> Result<EstadoRed, String> {
    tauri::async_runtime::spawn_blocking(leer_red).await.map_err(|e| e.to_string())
}

// ---------- Dispositivos en la red (solo lectura) ----------

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DispositivoRed {
    pub ip: String,
    pub mac: String,
    pub nombre: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DispositivosRedResultado {
    pub dispositivos: Vec<DispositivoRed>,
    /// IP local de esta máquina (la de la interfaz activa, no loopback, no gateway)
    pub mi_ip_local: Option<String>,
}

pub fn parsear_dispositivos_red(salida: &str) -> Vec<DispositivoRed> {
    // Formatos soportados:
    // Windows `arp -a -n`:
    //   "  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic"
    // Linux `ip neigh show`:
    //   "192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
    // Linux `arp -a -n`:
    //   "? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0"
    let mut resultados = Vec::new();
    for linea in salida.lines() {
        let linea = linea.trim();
        if linea.is_empty()
            || linea.starts_with("Interface")
            || linea.starts_with("---")
            || linea.starts_with("Internet")
            || linea.starts_with("Address")
        {
            continue;
        }
        let partes: Vec<&str> = linea.split_whitespace().collect();
        if partes.len() < 2 {
            continue;
        }

        // Detectar formato por la estructura de la línea
        if linea.starts_with('?') || (partes.len() >= 2 && partes[0] == "?" && partes[1].starts_with('(')) {
            // Linux `arp -a -n`: "? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0"
            // IP en partes[1] (con paréntesis), MAC en partes[3]
            if let Some(ip_con_paren) = partes.get(1) {
                let ip = ip_con_paren.trim_matches(|c| c == '(' || c == ')');
                if ip.contains('.') && ip.split('.').count() == 4 {
                    if let Some(mac_parte) = partes.get(3) {
                        let mac_limpia = limpiar_texto(*mac_parte, 20).trim_end_matches(['[', ']']).to_string();
                        if mac_limpia.chars().all(|c| c.is_ascii_hexdigit() || c == '-' || c == ':') {
                            resultados.push(DispositivoRed { ip: ip.to_string(), mac: mac_limpia, nombre: String::new() });
                        }
                    }
                }
            }
        } else if partes.len() >= 6 && partes[1] == "dev" && partes[3] == "lladdr" {
            // Linux `ip neigh show`: "192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
            let ip = partes[0];
            if ip.contains('.') && ip.split('.').count() == 4 {
                let mac_parte = partes[4];
                let mac_limpia = limpiar_texto(mac_parte, 20).trim_end_matches(['[', ']']).to_string();
                if mac_limpia.chars().all(|c| c.is_ascii_hexdigit() || c == '-' || c == ':') {
                    resultados.push(DispositivoRed { ip: ip.to_string(), mac: mac_limpia, nombre: String::new() });
                }
            }
        } else {
            // Windows `arp -a -n` y fallback genérico: IP en primera posición, MAC en segunda
            let primera = partes[0];
            if primera.contains('.') && primera.split('.').count() == 4 && !primera.starts_with('(') {
                if let Some(mac_parte) = partes.get(1) {
                    let mac_limpia = limpiar_texto(*mac_parte, 20).trim_end_matches(['[', ']']).to_string();
                    if mac_limpia.chars().all(|c| c.is_ascii_hexdigit() || c == '-' || c == ':') {
                        resultados.push(DispositivoRed { ip: primera.to_string(), mac: mac_limpia, nombre: String::new() });
                    }
                }
            }
        }
    }
    resultados
}

/// Obtiene la IP local de la interfaz de red activa (no loopback, no IPv6).
fn obtener_ip_local() -> Option<String> {
    use std::net::{IpAddr, Ipv4Addr, SocketAddrV4, UdpSocket};

    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    // UDP connect selects the route and source address without sending a packet.
    socket
        .connect(SocketAddrV4::new(Ipv4Addr::new(1, 1, 1, 1), 53))
        .ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if !ip.is_unspecified() && !ip.is_loopback() => Some(ip.to_string()),
        _ => None,
    }
}

/// Escanea la tabla ARP local: solo lectura, no envía nada a la red.
/// Windows usa `arp -a -n`, Linux usa `ip neigh show` o `arp -a`.
fn leer_dispositivos_red() -> Result<DispositivosRedResultado, String> {
    let dispositivos = {
        #[cfg(windows)]
        {
            use std::process::Command;
            let mut cmd = Command::new("arp");
            cmd.arg("-a").arg("-n");
            let salida = ejecutar(&mut cmd, Duration::from_secs(10))?;
            parsear_dispositivos_red(&salida)
        }
        #[cfg(target_os = "linux")]
        {
            use std::process::Command;
            let mut cmd = Command::new("ip");
            cmd.arg("neigh").arg("show");
            let salida = ejecutar(&mut cmd, Duration::from_secs(10))
                .or_else(|_| {
                    let mut c = Command::new("arp");
                    c.arg("-a").arg("-n");
                    ejecutar(&mut c, Duration::from_secs(10))
                })?;
            parsear_dispositivos_red(&salida)
        }
        #[cfg(not(any(windows, target_os = "linux")))]
        {
            return Err(SOLO_WINDOWS.to_string());
        }
    };
    let mi_ip_local = obtener_ip_local();
    Ok(DispositivosRedResultado { dispositivos, mi_ip_local })
}

/// Lista los dispositivos que la PC ha visto recientemente en la red local. Solo lectura.
#[tauri::command]
pub async fn ver_dispositivos_red() -> Result<DispositivosRedResultado, String> {
    tauri::async_runtime::spawn_blocking(leer_dispositivos_red).await.map_err(|e| e.to_string())?
}

// ---------- Actualizaciones de Windows (solo lectura) ----------

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActualizacionPendiente {
    pub titulo: String,
    pub mb: f64,
    pub critica: bool,
    pub reinicio: bool,
    /// Las definiciones del antivirus se instalan solas varias veces al día: no son algo que la persona tenga que hacer.
    pub automatica: bool,
}

pub fn es_automatica(titulo: &str) -> bool {
    let t = titulo.to_lowercase();
    ["security intelligence", "definition update", "inteligencia de seguridad", "definiciones de seguridad", "actualización de definiciones"].iter().any(|p| t.contains(p))
}

pub fn parsear_actualizaciones(salida: &str) -> Vec<ActualizacionPendiente> {
    lista_json(salida)
        .iter()
        .map(|v| {
            let titulo = texto(v, "titulo", 160);
            ActualizacionPendiente { automatica: es_automatica(&titulo), titulo, mb: numero(v, "mb"), critica: booleano(v, "critica"), reinicio: booleano(v, "reinicio") }
        })
        .filter(|a| !a.titulo.is_empty())
        .collect()
}

/// Pregunta a Windows Update qué hay pendiente. NO descarga ni instala nada: solo busca. Puede tardar minutos
/// (en esta PC 87 s; en un equipo más lento, más), por eso el tope es de 5 minutos.
#[tauri::command]
pub async fn actualizaciones_windows() -> Result<Vec<ActualizacionPendiente>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let salida = ps(
            "$s=New-Object -ComObject Microsoft.Update.Session;$r=$s.CreateUpdateSearcher().Search(\"IsInstalled=0 and IsHidden=0\");\
             @($r.Updates|ForEach-Object{[pscustomobject]@{titulo=$_.Title;mb=[math]::Round($_.MaxDownloadSize/1MB);critica=($_.MsrcSeverity -eq 'Critical');reinicio=($_.InstallationBehavior.RebootBehavior -ne 0)}})|ConvertTo-Json -Compress",
            Duration::from_secs(300),
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
    fn lee_los_programas_de_inicio_y_no_deja_cambiar_los_dudosos() {
        let salida = "[{\"nombre\":\"Spotify\",\"comando\":\"C:\\\\x\\\\Spotify.exe\",\"ambito\":\"usuario\",\"activo\":true,\"puedeCambiar\":true},\
{\"nombre\":\"Mi Programa Ñandú\",\"comando\":\"y\",\"ambito\":\"usuario\",\"activo\":false,\"puedeCambiar\":true},\
{\"nombre\":\"SecurityHealth\",\"comando\":\"z\",\"ambito\":\"equipo\",\"activo\":true,\"puedeCambiar\":false},\
{\"nombre\":\"Raro\\u0007\",\"comando\":\"z\",\"ambito\":\"usuario\",\"activo\":true,\"puedeCambiar\":true},\
{\"nombre\":\"\",\"comando\":\"vacio\",\"ambito\":\"usuario\",\"activo\":true,\"puedeCambiar\":true}]";
        let l = parsear_inicio(salida);
        assert_eq!(l.len(), 4, "{l:?}");
        let por = |n: &str| l.iter().find(|p| p.nombre == n).unwrap();
        assert!(por("Spotify").puede_cambiar && por("Spotify").activo);
        assert!(por("Mi Programa Ñandú").puede_cambiar && !por("Mi Programa Ñandú").activo); // las tildes y eñes sobreviven
        assert!(!por("SecurityHealth").puede_cambiar); // del equipo: hace falta administrador
        assert!(!por("Raro").puede_cambiar); // el nombre cambiaría al limpiarlo: no se devuelve tal cual al registro
        assert!(l.windows(2).all(|w| w[0].nombre.to_lowercase() <= w[1].nombre.to_lowercase()));
        assert!(parsear_inicio("").is_empty());
        assert!(parsear_inicio("[]").is_empty());
        assert!(aplicar_cambio_inicio("", true).is_err() || cfg!(windows));
    }

    #[test]
    fn el_guion_de_inicio_no_lleva_texto_de_afuera() {
        // El nombre del programa viaja por una variable de entorno: ni el guion de lectura ni el de escritura lo incluyen.
        assert!(!GUION_INICIO.contains("KERNI_NOMBRE"));
        assert!(GUION_INICIO.contains("StartupApproved"));
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
        assert!(a[0].critica && a[0].reinicio && !a[0].automatica);
        assert_eq!(a[0].mb, 512.0);
        assert_eq!(parsear_actualizaciones("{\"titulo\":\"Una sola\",\"mb\":3}").len(), 1);
        assert!(parsear_actualizaciones("").is_empty());
    }

    #[test]
    fn las_definiciones_del_antivirus_se_marcan_como_automaticas() {
        assert!(es_automatica("Security Intelligence Update for Microsoft Defender Antivirus - KB2267602 (Version 1.463.13.0)"));
        assert!(es_automatica("Actualización de inteligencia de seguridad de Microsoft Defender"));
        assert!(!es_automatica("2026-10 Cumulative Update for Windows 11 (KB5043080)"));
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
    fn parsea_dispositivos_red_arp() {
        // Formato real de `arp -a -n` en Windows: IP y MAC en la misma línea
        let salida_windows = "\
Interface: 192.168.1.10 --- 0x12
Internet Address      Physical Address      Type
  192.168.1.1         aa-bb-cc-dd-ee-ff     dynamic
  192.168.1.50        11-22-33-44-55-66     dynamic
  192.168.1.200       ff:ee:dd:cc:bb:aa     dynamic";
        let d = parsear_dispositivos_red(salida_windows);
        assert!(d.len() >= 3, "Windows: debe encontrar al menos 3 dispositivos, encontró {}", d.len());
        assert!(d.iter().all(|x| !x.ip.is_empty() && x.mac.chars().all(|c| c.is_ascii_hexdigit() || c == '-' || c == ':')));

        // Linux `ip neigh show`
        let salida_linux_ip = "\
192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
192.168.1.50 dev eth0 lladdr 11:22:33:44:55:66 STALE
fe80::1 dev eth0 lladdr 00:11:22:33:44:55 REACHABLE";
        let d2 = parsear_dispositivos_red(salida_linux_ip);
        assert!(d2.len() >= 2, "Linux ip: debe encontrar al menos 2 dispositivos IPv4, encontró {}", d2.len());
        assert!(d2.iter().all(|x| x.ip.contains('.') && x.mac.contains(':')));

        // Linux `arp -a -n`
        let salida_linux_arp = "\
? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0
? (192.168.1.50) at 11-22-33-44-55-66 [ether] on eth0";
        let d3 = parsear_dispositivos_red(salida_linux_arp);
        assert!(d3.len() >= 2, "Linux arp: debe encontrar al menos 2 dispositivos, encontró {}", d3.len());

        // Entrada vacía o basura no debe dar falsos positivos
        assert!(parsear_dispositivos_red("").is_empty());
        assert!(parsear_dispositivos_red("solo texto sin ip").is_empty());
    }

    #[test]
    fn resultado_red_serializa_ip_local_en_camel_case() {
        let resultado = DispositivosRedResultado {
            dispositivos: Vec::new(),
            mi_ip_local: Some("192.168.1.29".to_string()),
        };
        let json = serde_json::to_value(resultado).unwrap();
        assert_eq!(json["miIpLocal"], "192.168.1.29");
        assert!(json.get("mi_ip_local").is_none());
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
        let dispositivos = leer_dispositivos_red().unwrap_or_default();
        println!("{} dispositivos en ARP", dispositivos.len());
    }

    /// Crea un programa de inicio temporal con tildes en el registro REAL del usuario, lo desactiva, lo reactiva y lo borra.
    #[cfg(windows)]
    #[test]
    #[ignore = "toca el registro real (con limpieza): cargo test -- --ignored"]
    fn cambiar_inicio_real_con_nombre_con_tildes() {
        let nombre = "Kerni prueba ñandú";
        let run = r"HKCU:\Software\Microsoft\Windows\CurrentVersion\Run";
        let limpiar = || {
            let _ = ps_con_datos(
                &format!("Remove-ItemProperty -Path '{run}' -Name $env:KERNI_NOMBRE -ErrorAction SilentlyContinue;Remove-ItemProperty -Path '{CLAVE_APROBADOS_USUARIO}' -Name $env:KERNI_NOMBRE -ErrorAction SilentlyContinue"),
                Duration::from_secs(15),
                &[("KERNI_NOMBRE", nombre)],
            );
        };
        limpiar();
        ps_con_datos(&format!("Set-ItemProperty -Path '{run}' -Name $env:KERNI_NOMBRE -Value 'C:\\no-existe.exe'"), Duration::from_secs(15), &[("KERNI_NOMBRE", nombre)]).unwrap();
        let estado = || leer_inicio().unwrap().into_iter().find(|p| p.nombre == nombre);
        let r = std::panic::catch_unwind(|| {
            let inicial = estado().expect("debería aparecer en la lista, con sus tildes");
            assert!(inicial.activo && inicial.puede_cambiar, "{inicial:?}");
            aplicar_cambio_inicio(nombre, false).unwrap();
            assert!(!estado().unwrap().activo, "debería quedar desactivado");
            aplicar_cambio_inicio(nombre, true).unwrap();
            assert!(estado().unwrap().activo, "debería quedar activo otra vez");
            assert!(aplicar_cambio_inicio("programa que no existe", false).is_err());
        });
        limpiar();
        assert!(estado().is_none(), "la limpieza debería haberlo borrado");
        if let Err(e) = r {
            std::panic::resume_unwind(e);
        }
    }
}
