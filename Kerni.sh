#!/usr/bin/env bash
# Kerni - lanzador. Doble click y listo.
#   Kerni.sh          instala lo que falte, enciende el cerebro (backend) y abre la app
#   Kerni.sh check    solo revisa que todo este en orden (no abre nada)
# ============================================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK="$ROOT/src/backend"
APP="$ROOT/src/desktop"
PUERTO=8788
CARGO_TARGET_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/kerni/target"
INICIE_BACKEND=0
TIENE_LLAVE=0
SOLO_REVISAR=0

if [ "${1:-}" = "check" ]; then
  SOLO_REVISAR=1
fi

echo ""
echo " ===== Kerni ====="
echo ""

# ---- 1. Herramientas ------------------------------------------------------
if ! command -v node > /dev/null 2>&1; then
  echo " [x] Falta Node.js 22 o mas - https://nodejs.org"
  exit 1
fi
if ! command -v npm > /dev/null 2>&1; then
  echo " [x] Falta npm, que viene con Node.js"
  exit 1
fi
if ! command -v cargo > /dev/null 2>&1; then
  echo " [x] Falta Rust - https://rustup.rs"
  exit 1
fi
NODEV="$(node -v | sed 's/^v//')"
if [ "${NODEV%%.*}" -lt 22 ]; then
  echo " [x] Tu Node.js es v${NODEV} y Kerni necesita la 22 o mas."
  exit 1
fi
echo " [ok] Node.js, npm y Rust encontrados"

# ---- 2. Dependencias (solo la primera vez) ---------------------------------
dependencias() {
  if [ -d "$1/node_modules" ]; then
    echo " [ok] Dependencias $2"
    return 0
  fi
  if [ "$SOLO_REVISAR" = "1" ]; then
    echo " [!] Faltan las dependencias $2 ^(se instalan al abrir^)"
    return 0
  fi
  echo " [..] Instalando dependencias $2, un momento..."
  (cd "$1" && npm install --no-audit --no-fund) || return 1
}
dependencias "$BACK" "del backend" || exit 1
dependencias "$APP" "de la app" || exit 1

# ---- 3. Llave del modelo (solo para el chat con IA) ---------------------
if [ ! -f "$BACK/.env" ]; then
  if [ "$SOLO_REVISAR" != "1" ]; then
    cp "$BACK/.env.example" "$BACK/.env"
  fi
fi
if [ -n "${ANTHROPIC_API_KEY:-}" ] || [ -n "${GEMINI_API_KEY:-}" ] || [ -n "${GOOGLE_API_KEY:-}" ] || [ -n "${OPENROUTER_API_KEY:-}" ]; then
  TIENE_LLAVE=1
elif grep -Eq '^(ANTHROPIC_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY)=[^ ]' "$BACK/.env" 2>/dev/null; then
  TIENE_LLAVE=1
fi
if [ "$TIENE_LLAVE" = "1" ]; then
  echo " [ok] Llave de modelo configurada: el chat con IA estara activo"
else
  echo " [!] Sin llave de modelo: el chat con IA no funcionara."
  echo "      Todo lo demas SI funciona sin ella ^(RAM, disco, panico, limpiar temporales^)."
  echo "      Para activarlo, pega UNA llave en src/backend/.env: ANTHROPIC_API_KEY=, GEMINI_API_KEY= u OPENROUTER_API_KEY="
fi

if [ "$SOLO_REVISAR" = "1" ]; then
  echo ""
  echo " Revision lista. No se abrio nada."
  exit 0
fi

# ---- 4. Cerebro (backend) -------------------------------------------------
encender_backend() {
  if curl -sf -o /dev/null "http://127.0.0.1:$PUERTO/health"; then
    echo " [ok] El backend ya estaba encendido"
    return 0
  fi
  echo " [..] Encendiendo el backend..."
  INICIE_BACKEND=1
  (cd "$BACK" && nohup npm start > /dev/null 2>&1 &)
  local intentos=0
  while [ "$intentos" -lt 20 ]; do
    if curl -sf -o /dev/null "http://127.0.0.1:$PUERTO/health"; then
      echo " [ok] Backend encendido en http://127.0.0.1:$PUERTO"
      curl -sf "http://127.0.0.1:$PUERTO/health"
      echo ""
      return 0
    fi
    intentos=$((intentos + 1))
    sleep 1
  done
  echo " [!] El backend no respondio; abro la app igual, sin chat con IA."
}

apagar_backend() {
  local salida pid
  salida="$(ss -ltnp 2>/dev/null | grep -i ":$PUERTO" || true)"
  pid="$(printf '%s' "$salida" | grep -oE 'pid=[0-9]+' | head -n1 | cut -d= -f2)"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    sleep 2
    kill -9 "$pid" 2>/dev/null || true
  fi
  echo " [ok] Backend apagado"
}

if [ "$TIENE_LLAVE" = "1" ]; then
  encender_backend
fi

# ---- 5. La app ------------------------------------------------------------
echo ""
echo "  [..] Abriendo Kerni. La PRIMERA vez compila Rust y puede tardar varios minutos;"
echo "       despues abre en segundos. Kerni aparece en la esquina inferior derecha."
echo "       Para cerrarlo: clic derecho sobre el, o su icono en la bandeja del sistema."
echo "       ^(Esta ventana se cierra sola cuando Kerni se cierra.^"
cd "$APP"
npm run dev
CODIGO=$?

# ---- 6. Al cerrar: apagar el backend que encendimos -----------------------
if [ "$INICIE_BACKEND" = "1" ]; then
  apagar_backend
fi
if [ "$CODIGO" != "0" ]; then
  echo ""
  echo "  [x] Kerni se cerro con un error ^(codigo $CODIGO^). Revisa los mensajes de arriba."
  exit 1
fi
exit 0
