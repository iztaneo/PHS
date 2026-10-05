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
- [Diseño de PostgreSQL](docs/DATABASE-PHS.md) y [diccionario de datos con diagramas entidad-relación](docs/DICCIONARIO-DATOS.md), generado con `pnpm db:dictionary`.
- [Migraciones](db/migrations) 001–005 y [pruebas SQL](db/tests).

## Ejecutar el esqueleto de la aplicación

Requiere Node.js 24 y PostgreSQL 17 instalado (por ejemplo con Homebrew). No necesita Docker: el proyecto crea su propia instancia en `.local/pg`, puerto 54329, sin tocar otros PostgreSQL de la máquina. Los comandos usan pnpm 12 mediante `npx`.

```sh
cp .env.example .env                 # valores solo para desarrollo local
npx pnpm@12.9.1 install
npx pnpm@12.9.1 build
npx pnpm@12.9.1 db:setup             # base local, migraciones, administrador y datos de demostración
npx pnpm@12.9.1 dev                  # web, gateway, identity, projects, health y platform
```

Abrir [127.0.0.1:5173](http://127.0.0.1:5173) e iniciar sesión con el usuario de desarrollo de `.env`; la contraseña es temporal y la aplicación obliga a cambiarla. `test` y `typecheck` validan el código; `db:test` ejecuta las pruebas SQL; `db:test:setup` prepara la base `phs_test` que usan las pruebas de integración; `db:local:stop` detiene la base. Con Docker, `db:up` sustituye a `db:local:start`.

### Datos de demostración

`db:setup` carga, y `seed:demo` vuelve a cargar sin duplicar, seis usuarios y cinco proyectos para recorrer el flujo completo:

| Usuario (`@phs.test`) | Perfil | Qué ve |
| --- | --- | --- |
| `ana.pm` | PM de Consultoría | Sus proyectos: DEMO-001, 002, 003 y 005 |
| `luis.lider` | Líder de Consultoría | Los tres proyectos de la práctica; puede reasignar |
| `carla.direccion` | Dirección de ambas prácticas | Los cuatro proyectos, solo consulta |
| `pablo.pm` | PM y líder de Datos | Solo DEMO-004 |
| `diego.dev` | Sin rol; integrante y responsable de hitos y riesgos | Los proyectos donde participa, sin importes |
| `elena.lectora` | Sin rol; lectora en DEMO-001 | Solo DEMO-001, sin economía |

Todos usan la contraseña `DEMO_USER_PASSWORD` de `.env`. El administrador de desarrollo recibe además roles de PM y líder en Consultoría y de Dirección en Datos.

| Proyecto | Situación |
| --- | --- |
| DEMO-001 Portal de clientes | En riesgo (score 49): hito crítico vencido, gasto por delante del avance, riesgo materializado, un cambio pendiente de decisión y evidencias |
| DEMO-002 Migración a la nube | Saludable (score 97): hitos a tiempo, un cambio aprobado con línea base v2 y una renovación próxima |
| DEMO-003 Soporte de aplicaciones | Recién iniciado, con equipo e hitos, sin línea base |
| DEMO-004 Modelo de predicción de demanda | De otra práctica, para comprobar el alcance por rol |
| DEMO-005 Tablero de indicadores | Pausado hace 45 días: exige describir el motivo antes de editar |

Existen el gateway y los cuatro servicios (Identidad, Proyectos, Salud y Plataforma). Funcionan acceso, administración, proyectos con equipo, hitos, riesgos, línea base, cambios aprobados, economía, evidencias, renovaciones, estado del proyecto y la evaluación de salud con score. Todavía no hay ciclo de revisión, acciones, alertas ni vistas de portafolio.

## Abrir el prototipo

Desde la raíz del repositorio:

```sh
python3 Project-Health-System-Prototype/app.py
```

Abrir [localhost:8000](http://localhost:8000). Los datos del prototipo se guardan en el navegador; todavía no utiliza PostgreSQL.

La instalación y validación del esquema se describen en la [guía de base de datos](docs/DATABASE-PHS.md).
