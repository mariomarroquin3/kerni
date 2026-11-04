// Proveedor que se puede cambiar en caliente (la persona elige otra IA en la app sin reiniciar el backend).
// El agente y /chat guardan una sola referencia a este objeto; cada `step` va al proveedor vigente.
// Cada cambio sube `version`: el historial de una sesión está en el formato del proveedor anterior (Anthropic ≠ OpenAI),
// así que /chat empieza una sesión nueva cuando la versión cambia.
export function crearProveedorDinamico(inicial = null, nombreInicial = '') {
  let actual = inicial;
  let version = 0;
  let nombre = inicial ? nombreInicial || inicial.name : '';
  const requiere = () => {
    if (!actual) throw Object.assign(new Error('No hay una IA configurada.'), { codigo: 'sin_llave' });
    return actual;
  };
  return {
    get activo() { return Boolean(actual); },
    get name() { return actual ? nombre : 'ninguno'; },
    get model() { return actual?.model ?? ''; },
    get version() { return version; },
    userMessage: (texto) => requiere().userMessage(texto),
    toolResultMessages: (r) => requiere().toolResultMessages(r),
    step: async (args) => requiere().step(args),
    cambiar(nuevo, nuevoNombre = '') {
      actual = nuevo ?? null;
      nombre = actual ? nuevoNombre || actual.name : '';
      version += 1;
    },
  };
}
