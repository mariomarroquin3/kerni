#!/usr/bin/env bash
# Arranca freellmapi (si hace falta) y Kerni usando ese gateway como modelo.
# Uso:  ./Kerni-freellm.sh            (backend + app)
#       PROBAR=1 ./Kerni-freellm.sh   (antes prueba el modelo con tool calling)
#       ./Kerni-freellm.sh backend    (solo el backend, sin la app)
set -euo pipefail

CFG="${KERNI_FREELLM_ENV:-$HOME/.kerni-freellm.env}"
# La carpeta de Kerni es la de este script (sin rutas fijas); FREELLM puede cambiarse por entorno.
KERNI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FREELLM="${FREELLM_DIR:-$HOME/freellmapi}"
PUERTO_BACKEND=8788

[ -f "$CFG" ] || { echo "Falta $CFG (debe definir FREELLM_ROOT, FREELLM_KEY y FREELLM_MODEL)"; exit 1; }
# shellcheck disable=SC1090
source "$CFG"
for v in FREELLM_ROOT FREELLM_KEY FREELLM_MODEL; do
  [ -n "${!v:-}" ] || { echo "Falta $v en $CFG"; exit 1; }
done
FREELLM_ROOT="${FREELLM_ROOT%/}"   # sin barra final: se le agrega /chat/completions

gateway_ok() { curl -fs -o /dev/null --max-time 3 -H "Authorization: Bearer $FREELLM_KEY" "$FREELLM_ROOT/models"; }
backend_ok() { curl -fs --max-time 2 "http://127.0.0.1:$PUERTO_BACKEND/health" 2>/dev/null; }

# 1. Gateway: si no responde, lo enciende en segundo plano
if ! gateway_ok; then
  [ -d "$FREELLM" ] || { echo "No encuentro freellmapi en $FREELLM (usa FREELLM_DIR=ruta)"; exit 1; }
  echo "Encendiendo freellmapi..."
  (cd "$FREELLM" && nohup npm run dev > /tmp/freellmapi.log 2>&1 &)
  for i in $(seq 1 40); do
    sleep 1
    gateway_ok && break
    [ "$i" -eq 40 ] && { echo "El gateway no respondió (¿clave correcta?). Mira /tmp/freellmapi.log"; exit 1; }
  done
fi
echo "Gateway listo."

# 2. Kerni apunta al gateway SOLO en este proceso (no toca .env). Lo exportado manda sobre .env
#    (node --env-file no pisa variables que ya existen). Se anulan las otras llaves para que nada
#    llame a otro servicio por error (p. ej. embeddings o respaldo).
export LLM_PROVIDER=openrouter
export OPENROUTER_BASE_URL="$FREELLM_ROOT/chat/completions"   # Kerni espera la URL completa
export OPENROUTER_API_KEY="$FREELLM_KEY"
export OPENROUTER_MODEL="$FREELLM_MODEL"
export ANTHROPIC_API_KEY="" GEMINI_API_KEY="" GOOGLE_API_KEY=""
export KERNI_REFLEXION="${KERNI_REFLEXION:-0}"   # sin la llamada extra por mensaje; KERNI_REFLEXION=1 la reactiva

cd "$KERNI/src/backend"
[ -d node_modules ] || npm ci

# 3. Prueba rápida del modelo (incluye tool calling), solo si se pide
if [ "${PROBAR:-0}" = "1" ]; then npm run probar-llm || echo "Aviso: el modelo no pasó la prueba; sigo igual."; fi

# 4. Libera el puerto del backend viejo y arranca el backend en su propio grupo de procesos
if command -v fuser >/dev/null 2>&1; then fuser -k "$PUERTO_BACKEND/tcp" 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then lsof -ti "tcp:$PUERTO_BACKEND" | xargs -r kill 2>/dev/null || true; fi
# npm start y no npm run dev: con --watch, Node 22 se cae si no existe .env (el script no lo necesita)
setsid npm start > /tmp/kerni-backend.log 2>&1 &
BACK=$!
trap 'kill -- -"$BACK" 2>/dev/null || kill "$BACK" 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  sleep 1
  SALUD="$(backend_ok)" && break
  [ "$i" -eq 30 ] && { echo "El backend no arrancó. Mira /tmp/kerni-backend.log"; exit 1; }
done
case "$SALUD" in
  *'"proveedor":"openrouter"'*) echo "Backend listo: $SALUD" ;;
  *) echo "El backend no quedó con el gateway (health: $SALUD)"; exit 1 ;;
esac

# 5. La app (o solo el backend)
if [ "${1:-}" = "backend" ]; then
  echo "Backend en http://127.0.0.1:$PUERTO_BACKEND (Ctrl+C para salir)"
  wait "$BACK"
else
  cd "$KERNI/src/desktop"
  npm run dev
fi
