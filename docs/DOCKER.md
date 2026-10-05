# PHS en Docker

Levanta la aplicación completa —base de datos, gateway, los cuatro servicios y la web— con un solo comando, para probarla sin instalar Node.js ni PostgreSQL. Es un entorno de **prueba y demostración**: usa las contraseñas de desarrollo de `.env.example`, carga datos de demostración y no cifra el tráfico. No es la configuración del piloto (PHS-042).

## Requisitos

- Docker Desktop, o Docker Engine con el complemento Compose v2.
- El puerto 8080 libre, y unos 2 GB de disco para las imágenes.

## Arrancar

Desde la raíz del repositorio:

```sh
docker compose -f docker-compose.app.yml up --build -d --wait
```

La primera vez tarda unos minutos porque descarga las imágenes base, instala dependencias y compila. Cuando termina, abrir **http://localhost:8080**.

Si se tiene pnpm instalado, el equivalente es `pnpm docker:up`.

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

```sh
docker compose -f docker-compose.app.yml ps            # estado de cada contenedor
docker compose -f docker-compose.app.yml logs -f health # registros de un servicio
docker compose -f docker-compose.app.yml down           # detener; los datos se conservan
docker compose -f docker-compose.app.yml down --volumes # detener y borrar todos los datos
```

Volver a arrancar no duplica datos: las migraciones y las semillas solo agregan lo que falta. Después de cambiar el código hay que arrancar otra vez con `--build`.

## Opciones

Se definen como variables de entorno al arrancar, o en un archivo `.env` junto al compose.

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
PHS_WEB_BIND=0.0.0.0 PHS_WEB_ORIGIN=http://192.168.1.50:8080 \
  docker compose -f docker-compose.app.yml up --build -d --wait
```

Antes de hacerlo conviene saber que las contraseñas de demostración son públicas (están en el repositorio) y que el tráfico va sin cifrar: hacerlo solo en una red de confianza y con datos de prueba.

### Empezar sin datos de demostración

```sh
PHS_DEMO_DATA=false docker compose -f docker-compose.app.yml up --build -d --wait
```

El recorrido para configurar prácticas, usuarios y el primer proyecto desde cero está en el [manual de ambientación y pruebas](MANUAL-AMBIENTACION-Y-PRUEBAS.md), a partir de la configuración inicial en la interfaz.

## Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| No deja iniciar sesión con ningún usuario | La dirección del navegador no es una de `PHS_WEB_ORIGIN`. Usar `http://localhost:8080`, o definir la variable con la dirección real. |
| `port is already allocated` | El puerto 8080 está ocupado: arrancar con `PHS_WEB_PORT=8090` y abrir esa dirección. |
| Un servicio queda `unhealthy` | `docker compose -f docker-compose.app.yml logs <servicio>`; lo habitual es que `seed` haya fallado antes. |
| Se cambió `POSTGRES_PASSWORD` y la base rechaza la conexión | La contraseña se fija al crear el volumen: borrar los datos con `down --volumes` y arrancar de nuevo. |

## Límites

- Sin HTTPS, sin respaldos y sin monitoreo: el despliegue del piloto es PHS-042 y necesita la decisión D07.
- Las imágenes conservan las dependencias de desarrollo (unos 640 MB la de servicios), porque migraciones y semillas se ejecutan con ellas.
- Los servicios usan los usuarios de base de datos de desarrollo y un secreto interno de ejemplo.
