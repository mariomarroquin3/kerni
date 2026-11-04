// Ajustes de la persona (qué IA usar y su llave), guardados en la carpeta de datos de Kerni
// (%APPDATA%/Kerni en Windows, ~/.local/share/Kerni en Linux). Un archivo normal, para que funcione igual en todas partes.
// La llave nunca sale de aquí: ni se devuelve por HTTP ni se escribe en los registros.
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PROVEEDORES_AJUSTES = ['gemini', 'openrouter', 'anthropic'];
const ARCHIVO = 'ajustes.json';
const MAX_MODELO = 120;

/** Una llave pegada a mano: sin espacios ni saltos, de un largo razonable. No prueba que funcione (eso lo hace /ajustes/probar). */
export function llaveValida(texto) {
  const t = String(texto ?? '').trim();
  return t.length >= 16 && t.length <= 400 && !/[\s\u0000-\u001f\u007f<>"']/.test(t);
}

export function modeloValido(texto) {
  const t = String(texto ?? '').trim();
  return t.length <= MAX_MODELO && !/[\s\u0000-\u001f\u007f<>"']/.test(t);
}

const vacio = () => ({ proveedor: '', sinIA: false, bienvenidaVista: false, claves: {}, modelos: {} });

export function crearAjustes({ dataDir, logger = console } = {}) {
  const ruta = dataDir ? join(dataDir, ARCHIVO) : null;

  function leer() {
    if (!ruta) return vacio();
    try {
      const j = JSON.parse(readFileSync(ruta, 'utf8'));
      const claves = {};
      const modelos = {};
      for (const p of PROVEEDORES_AJUSTES) {
        if (llaveValida(j.claves?.[p])) claves[p] = String(j.claves[p]).trim();
        if (j.modelos?.[p] && modeloValido(j.modelos[p])) modelos[p] = String(j.modelos[p]).trim();
      }
      const proveedor = PROVEEDORES_AJUSTES.includes(j.proveedor) && claves[j.proveedor] ? j.proveedor : '';
      return { proveedor, sinIA: Boolean(j.sinIA) && !proveedor, bienvenidaVista: Boolean(j.bienvenidaVista), claves, modelos };
    } catch (err) {
      if (err.code !== 'ENOENT') logger.error?.({ err: err.message }, 'ajustes: no pude leer ajustes.json; se ignora');
      return vacio();
    }
  }

  function escribir(a) {
    if (!ruta) throw new Error('No hay carpeta de datos donde guardar los ajustes.');
    mkdirSync(dataDir, { recursive: true });
    const tmp = `${ruta}.tmp`;
    writeFileSync(tmp, JSON.stringify(a, null, 2), { mode: 0o600 });
    renameSync(tmp, ruta);
    try { chmodSync(ruta, 0o600); } catch { /* en Windows se hereda el permiso de la carpeta del usuario */ }
  }

  return {
    leer,
    /** Guarda la IA elegida. `apiKey` vacío con un proveedor que ya tiene llave guardada = solo cambiar de proveedor/modelo. */
    elegir({ proveedor, apiKey, modelo }) {
      if (!PROVEEDORES_AJUSTES.includes(proveedor)) throw new Error('Proveedor desconocido.');
      const a = leer();
      if (apiKey) {
        if (!llaveValida(apiKey)) throw new Error('La llave no parece válida (sin espacios, entre 16 y 400 caracteres).');
        a.claves[proveedor] = String(apiKey).trim();
      }
      if (!a.claves[proveedor]) throw new Error('Falta la llave de ese servicio.');
      if (modelo !== undefined) {
        if (modelo && !modeloValido(modelo)) throw new Error('El nombre del modelo no es válido.');
        if (modelo) a.modelos[proveedor] = String(modelo).trim(); else delete a.modelos[proveedor];
      }
      a.proveedor = proveedor;
      a.sinIA = false;
      a.bienvenidaVista = true;
      escribir(a);
      return a;
    },
    /** "Seguir sin IA": se recuerda para no volver a preguntar, pero las llaves guardadas se conservan. */
    sinIA() {
      const a = leer();
      a.proveedor = '';
      a.sinIA = true;
      a.bienvenidaVista = true;
      escribir(a);
      return a;
    },
    /** Borra todas las llaves y vuelve a mostrar la bienvenida. */
    olvidar() {
      if (ruta) rmSync(ruta, { force: true });
      return vacio();
    },
  };
}

/** Lo que se le cuenta a la app: nunca la llave, solo si hay una. */
export function vistaPublica(a, { origen = null, modeloActivo = '', nombreActivo = '' } = {}) {
  return {
    bienvenidaVista: a.bienvenidaVista,
    sinIA: a.sinIA,
    proveedor: nombreActivo || a.proveedor || '',
    modelo: modeloActivo || '',
    origen,
    conLlave: PROVEEDORES_AJUSTES.filter((p) => a.claves[p]),
  };
}
