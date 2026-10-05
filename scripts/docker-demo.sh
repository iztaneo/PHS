#!/bin/sh
# Construye y levanta PHS completo en Docker para probarlo (base de datos, servicios y web).
# Todo se construye en esta máquina a partir del código del repositorio: no descarga imágenes de
# PHS de ningún lado. Guía: docs/DOCKER.md
#
#   sh scripts/docker-demo.sh              construye y arranca (igual que "iniciar")
#   sh scripts/docker-demo.sh detener      detiene; los datos se conservan
#   sh scripts/docker-demo.sh estado       qué está corriendo
#   sh scripts/docker-demo.sh registros [servicio]
#   sh scripts/docker-demo.sh borrar       detiene y borra todos los datos de la demo
#
# Opciones (variables de entorno): PHS_WEB_PORT (8080), PHS_DEMO_DATA (true),
# PHS_WEB_BIND y PHS_WEB_ORIGIN para abrirlo a la red; ver la guía.
set -eu
cd "$(dirname "$0")/.."

COMPOSE_FILE=docker-compose.app.yml
PORT="${PHS_WEB_PORT:-8080}"
URL="http://localhost:$PORT"

fail() { printf '\nNo se puede continuar: %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker no está instalado. Instala Docker Desktop (https://www.docker.com/products/docker-desktop/) y vuelve a intentar."
docker compose version >/dev/null 2>&1 || fail "Falta Docker Compose v2. Viene con Docker Desktop; en Linux instala el paquete docker-compose-plugin."
docker info >/dev/null 2>&1 || fail "Docker está instalado pero no está corriendo. Abre Docker Desktop, espera a que termine de iniciar y vuelve a intentar."
[ -f "$COMPOSE_FILE" ] && [ -f .env.example ] || fail "Faltan archivos del repositorio. Ejecuta este script desde una copia completa de PHS."

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

case "${1:-iniciar}" in
  iniciar)
    # Si la demo ya está arriba, el puerto ocupado es el suyo y no es un problema.
    if [ -z "$(compose ps -q web 2>/dev/null)" ] && command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      fail "El puerto $PORT está ocupado. Elige otro, por ejemplo: PHS_WEB_PORT=8090 sh scripts/docker-demo.sh"
    fi
    echo "Construyendo y arrancando PHS. La primera vez tarda varios minutos; las siguientes, segundos."
    if ! compose up --build -d --wait; then
      echo >&2
      compose ps -a >&2 || true
      fail "Algo no arrancó. Revisa con: sh scripts/docker-demo.sh registros"
    fi
    password=$(grep '^DEMO_USER_PASSWORD=' .env.example | cut -d= -f2-)
    cat <<TEXT

PHS está listo: $URL

Usuarios de demostración (todos con la contraseña: $password)
  ana.pm@phs.test           PM de Consultoría
  luis.lider@phs.test       Líder de Consultoría
  carla.direccion@phs.test  Dirección
  pablo.pm@phs.test         PM y líder de Datos
  diego.dev@phs.test        Integrante sin rol
  elena.lectora@phs.test    Lectora
El administrador y su contraseña temporal están en .env.example (DEV_USER_EMAIL y DEV_USER_PASSWORD).

Solo responde en esta máquina. Son datos y contraseñas de prueba: no lo publiques en internet.
Para detenerlo: sh scripts/docker-demo.sh detener
TEXT
    ;;
  detener)
    compose down
    echo "PHS detenido. Los datos se conservan; para borrarlos: sh scripts/docker-demo.sh borrar"
    ;;
  estado)
    compose ps -a
    ;;
  registros)
    shift
    compose logs --tail 200 "$@"
    ;;
  borrar)
    compose down --volumes
    echo "PHS detenido y datos de la demo borrados. El próximo arranque empieza de cero."
    ;;
  *)
    echo "Uso: sh scripts/docker-demo.sh [iniciar|detener|estado|registros [servicio]|borrar]" >&2
    exit 2
    ;;
esac
