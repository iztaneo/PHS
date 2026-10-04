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
- [Arquitectura propuesta](docs/ARQUITECTURA-PHS.md).
- [Stack tecnológico propuesto](docs/STACK-TECNOLOGICO.md).
- [Decisión técnica ADR-001](docs/adr/001-stack-mvp.md) y [ADR-002: microservicios](docs/adr/002-microservicios.md).
- [Mapa pantalla → servicio → tablas → historias](docs/MAPA-TRAZABILIDAD.md).
- [Diseño de PostgreSQL y diagrama](docs/DATABASE-PHS.md).
- [Migración inicial](db/migrations/001_initial.sql) , [credenciales locales](db/migrations/002_user_credentials.sql) y [sesiones](db/migrations/003_user_session.sql).
- Pruebas de [integridad](db/tests/001_integrity.sql), [credenciales](db/tests/002_credentials.sql) y [sesiones](db/tests/003_sessions.sql).

## Ejecutar el esqueleto de la aplicación

Requiere Node.js 24 y PostgreSQL 17 (con Docker o instalado). Los comandos usan pnpm 12 mediante `npx`; también puede instalarse pnpm globalmente.

```sh
cp .env.example .env                 # valores solo para desarrollo local
npx pnpm@12.9.1 install
npx pnpm@12.9.1 db:up                # PostgreSQL local con Docker Compose
npx pnpm@12.9.1 build
npx pnpm@12.9.1 dev                  # web, gateway, identity y projects
```

Abrir [127.0.0.1:5173](http://127.0.0.1:5173): la página muestra el estado de los servicios consultado a través del gateway. `npx pnpm@12.9.1 test` y `typecheck` validan el código. Sin Docker, apuntar `DATABASE_URL` en `.env` a un PostgreSQL 17 propio. Las migraciones se aplican por ahora con `psql`, como indica la guía de base de datos.

Solo existen el gateway y los servicios Identidad y Proyectos con su comprobación de estado; todavía no hay inicio de sesión ni funcionalidad de negocio.

## Abrir el prototipo

Desde la raíz del repositorio:

```sh
python3 Project-Health-System-Prototype/app.py
```

Abrir [localhost:8000](http://localhost:8000). Los datos del prototipo se guardan en el navegador; todavía no utiliza PostgreSQL.

La instalación y validación del esquema se describen en la guía de base de datos.
