# PHS en Docker

Levanta la aplicación completa —base de datos, gateway, los cuatro servicios y la web— con un solo comando, para probarla sin instalar Node.js ni PostgreSQL. Es un entorno de **prueba y demostración**: usa las contraseñas de desarrollo de `.env.example`, carga datos de demostración y no cifra el tráfico. No es la configuración del piloto (PHS-042).

## Requisitos

- Docker Desktop, o Docker Engine con el complemento Compose v2.
- El puerto 8080 libre, y unos 2 GB de disco para las imágenes.

## Arrancar

Desde la carpeta del repositorio:

```sh
sh scripts/docker-demo.sh
```

El script comprueba que Docker esté instalado y corriendo y que el puerto esté libre, construye las imágenes **en la propia máquina** a partir del código, arranca todo y, al terminar, muestra la dirección y los usuarios con su contraseña. La primera vez tarda varios minutos porque descarga las imágenes base (Node.js, PostgreSQL y nginx), instala dependencias y compila; las siguientes, segundos. Después, abrir **http://localhost:8080**.

| Comando | Qué hace |
| --- | --- |
| `sh scripts/docker-demo.sh` | Construye y arranca |
| `sh scripts/docker-demo.sh detener` | Detiene; los datos se conservan |
| `sh scripts/docker-demo.sh estado` | Qué está corriendo |
| `sh scripts/docker-demo.sh registros [servicio]` | Últimos mensajes de todos o de un servicio |
| `sh scripts/docker-demo.sh borrar` | Detiene y borra todos los datos de la demo |

En Windows, el script funciona desde Git Bash o WSL. Desde PowerShell se puede usar directamente el comando que el script ejecuta:

```sh
docker compose -f docker-compose.app.yml up --build -d --wait
```

## Compartirlo con quien lo va a probar

No se publica ni se envía ninguna imagen: cada persona construye la suya, para el procesador de su máquina. Lo único que necesita es Docker y una copia del repositorio, por cualquiera de estas vías:

- **Acceso al repositorio** en GitHub: lo clona y ejecuta el script. Para actualizar, `git pull` y volver a ejecutarlo.
- **Un archivo con el código**, si no va a tener acceso: `git archive --format=zip -o phs.zip HEAD` genera un zip solo con lo versionado (sin `.env`, datos locales ni dependencias). Lo descomprime y ejecuta el script.

## Entrar

| Usuario | Perfil |
| --- | --- |
| `ana.pm@phs.test` | PM de Consultoría |
| `luis.lider@phs.test` | Líder de Consultoría |
| `carla.direccion@phs.test` | Dirección |
| `pablo.pm@phs.test` | PM y líder de Datos |
| `diego.dev@phs.test` | Integrante sin rol |
| `elena.lectora@phs.test` | Lectora |
| `admin@phs.test` | Administrador |

Los usuarios de demostración comparten la contraseña `DEMO_USER_PASSWORD` de [.env.example](../.env.example). El administrador usa `DEV_USER_PASSWORD`, que es temporal: la aplicación pide cambiarla al entrar. Los proyectos DEMO-001 a DEMO-006 y lo que muestra cada uno están descritos en el [README](../README.md#datos-de-demostración).

## Qué se levanta

| Contenedor | Función | Accesible desde fuera |
| --- | --- | --- |
| `web` | Sirve la aplicación y reenvía `/api` al gateway | Sí, en `127.0.0.1:8080` |
| `gateway` | Valida la sesión y enruta hacia los servicios | No |
| `identity`, `projects`, `health`, `platform` | Servicios de negocio | No |
| `db` | PostgreSQL 17 | No |
| `migrate`, `roles`, `seed` | Se ejecutan una vez en cada arranque y terminan: esquema, usuarios de base de datos de cada servicio y datos | — |

Los datos viven en dos volúmenes de Docker: `phs_pgdata` (base de datos) y `phs_evidence` (archivos de evidencia). No se usa ni se modifica la base local de desarrollo de `.local/pg`.

## Operación

Los comandos del script cubren lo habitual. Volver a arrancar no duplica datos: las migraciones y las semillas solo agregan lo que falta. Después de cambiar o actualizar el código basta ejecutar el script de nuevo: reconstruye lo que cambió.

## Opciones

Se definen como variables de entorno delante del comando, por ejemplo `PHS_WEB_PORT=8090 sh scripts/docker-demo.sh`, o en un archivo `.env` en la carpeta del repositorio.

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `PHS_WEB_PORT` | `8080` | Puerto de la web en la máquina. |
| `PHS_WEB_BIND` | `127.0.0.1` | Interfaz en la que se publica. `0.0.0.0` la abre a la red. |
| `PHS_WEB_ORIGIN` | `http://localhost:8080,http://127.0.0.1:8080` | Direcciones exactas desde las que el navegador puede usar la aplicación. |
| `PHS_DEMO_DATA` | `true` | `false` arranca solo con el administrador, sin usuarios ni proyectos de demostración. |
| `POSTGRES_PASSWORD` | la de `.env.example` | Contraseña de la base; solo se aplica al crear el volumen por primera vez. |

### Abrirlo a otras personas de la red

Por defecto solo responde en la propia máquina. Para que alguien más entre desde su equipo hay que publicar en la red e indicar la dirección que va a escribir en el navegador:

```sh
PHS_WEB_BIND=0.0.0.0 PHS_WEB_ORIGIN=http://192.168.1.50:8080 sh scripts/docker-demo.sh
```

Antes de hacerlo conviene saber que las contraseñas de demostración son públicas (están en el repositorio) y que el tráfico va sin cifrar: hacerlo solo en una red de confianza y con datos de prueba.

### Empezar sin datos de demostración

```sh
PHS_DEMO_DATA=false sh scripts/docker-demo.sh
```

El recorrido para configurar prácticas, usuarios y el primer proyecto desde cero está en el [manual de ambientación y pruebas](MANUAL-AMBIENTACION-Y-PRUEBAS.md), a partir de la configuración inicial en la interfaz.

## Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| No deja iniciar sesión con ningún usuario | La dirección del navegador no es una de `PHS_WEB_ORIGIN`. Usar `http://localhost:8080`, o definir la variable con la dirección real. |
| El script dice que el puerto está ocupado | Otro programa usa el 8080: arrancar con `PHS_WEB_PORT=8090 sh scripts/docker-demo.sh` y abrir esa dirección. |
| Algo no arrancó | `sh scripts/docker-demo.sh registros`; lo habitual es que el paso `seed` o `migrate` haya fallado antes que los servicios. |
| Se cambió `POSTGRES_PASSWORD` y la base rechaza la conexión | La contraseña se fija al crear el volumen: borrar los datos con `sh scripts/docker-demo.sh borrar` y arrancar de nuevo. |

## Límites

- Sin HTTPS, sin respaldos y sin monitoreo: el despliegue del piloto es PHS-042 y necesita la decisión D07.
- Las imágenes conservan las dependencias de desarrollo (unos 640 MB la de servicios), porque migraciones y semillas se ejecutan con ellas.
- Los servicios usan los usuarios de base de datos de desarrollo y un secreto interno de ejemplo.
