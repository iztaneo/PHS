# Project Health System (PHS)

Aplicación para gestionar la salud de proyectos y servicios mediante el Project Health Framework (PHF).

El repositorio contiene un prototipo navegable y el diseño inicial de arquitectura y base de datos. La arquitectura decidida es de microservicios con base compartida. Existe un esqueleto ejecutable (web, gateway, Identidad y Proyectos) sin funcionalidad de negocio.

## Contenido

- [Bitácora y estado actual del proyecto](docs/BITACORA.md).
- [Instrucciones para mantener la memoria en cada commit](AGENTS.md).
- [Prototipo y guía de uso](Project-Health-System-Prototype/README.md).
- [Especificación funcional](docs/producto/ESPECIFICACION.md).
- [Backlog priorizado](docs/producto/BACKLOG.md).
- [Plan de entregas y aceptación](docs/producto/PLAN-ENTREGAS.md).
- [Decisiones pendientes](docs/producto/DECISIONES.md).
- [Diseño de interfaz](docs/producto/DISENO-UI.md).
- [Reglas del motor PHF, versión 1](docs/producto/REGLAS-PHF-v1.md).
- [Arquitectura propuesta](docs/ARQUITECTURA-PHS.md).
- [Stack tecnológico propuesto](docs/STACK-TECNOLOGICO.md).
- [Decisión técnica ADR-001](docs/adr/001-stack-mvp.md) y [ADR-002: microservicios](docs/adr/002-microservicios.md).
- [Mapa pantalla → servicio → tablas → historias](docs/MAPA-TRAZABILIDAD.md).
- [Contratos OpenAPI por servicio](docs/api/README.md); en local, Swagger UI en `/api/docs/`.
- [Diseño de PostgreSQL y diagrama](docs/DATABASE-PHS.md).
- [Migraciones](db/migrations) 001–005 y [pruebas SQL](db/tests).

## Ejecutar el esqueleto de la aplicación

Requiere Node.js 24 y PostgreSQL 17 instalado (por ejemplo con Homebrew). No necesita Docker: el proyecto crea su propia instancia en `.local/pg`, puerto 54329, sin tocar otros PostgreSQL de la máquina. Los comandos usan pnpm 12 mediante `npx`.

```sh
cp .env.example .env                 # valores solo para desarrollo local
npx pnpm@12.9.1 install
npx pnpm@12.9.1 db:setup             # base local, migraciones y usuarios de desarrollo
npx pnpm@12.9.1 build
npx pnpm@12.9.1 seed:dev             # usuario inicial definido en .env (DEV_USER_*)
npx pnpm@12.9.1 dev                  # web, gateway, identity y projects
```

Abrir [127.0.0.1:5173](http://127.0.0.1:5173) e iniciar sesión con el usuario de desarrollo de `.env`; la contraseña es temporal y la aplicación obliga a cambiarla. `test` y `typecheck` validan el código; `db:test` ejecuta las pruebas SQL; `db:test:setup` prepara la base `phs_test` que usan las pruebas de integración; `db:local:stop` detiene la base. Con Docker, `db:up` sustituye a `db:local:start`.

Existen el gateway y los servicios Identidad y Proyectos, con inicio y cierre de sesión, cambio de contraseña, administración de usuarios, prácticas, roles y tipos de servicio, y alta, consulta y edición de proyectos según el alcance de cada usuario. El usuario de desarrollo es administrador: para crear un proyecto debe crear antes una práctica y asignarse los roles de PM y líder. También hay equipo, hitos y línea base inicial, con lo que se completa el recorrido de la primera entrega (R1). Todavía no hay riesgos, economía, cambios aprobados, revisiones ni evaluación de salud.

## Abrir el prototipo

Desde la raíz del repositorio:

```sh
python3 Project-Health-System-Prototype/app.py
```

Abrir [localhost:8000](http://localhost:8000). Los datos del prototipo se guardan en el navegador; todavía no utiliza PostgreSQL.

La instalación y validación del esquema se describen en la [guía de base de datos](docs/DATABASE-PHS.md).
