# Project Health System (PHS)

Aplicación para gestionar la salud de proyectos y servicios mediante el Project Health Framework (PHF).

El repositorio contiene la aplicación (web, gateway y cuatro servicios: Identidad, Proyectos, Salud y Plataforma, sobre una base PostgreSQL compartida), el prototipo navegable que le dio origen y la documentación de producto y arquitectura. Las entregas R1 a R4 están construidas y en revisión; ninguna está aceptada todavía y falta R5, el piloto. El estado exacto está en la [bitácora](docs/BITACORA.md).

## Contenido

- [Bitácora y estado actual del proyecto](docs/BITACORA.md).
- [Instrucciones para mantener la memoria en cada commit](AGENTS.md).
- [Prototipo y guía de uso](Project-Health-System-Prototype/README.md).
- [Especificación funcional](docs/producto/ESPECIFICACION.md).
- [Backlog priorizado](docs/producto/BACKLOG.md).
- [Plan de entregas y aceptación](docs/producto/PLAN-ENTREGAS.md).
- [Manual paso a paso de ambientación y pruebas](docs/MANUAL-AMBIENTACION-Y-PRUEBAS.md).
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

## Ejecutar la aplicación

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

`db:setup` carga, y `seed:demo` vuelve a cargar sin duplicar, seis usuarios y seis proyectos para recorrer el flujo completo:

| Usuario (`@phs.test`) | Perfil | Qué ve |
| --- | --- | --- |
| `ana.pm` | PM de Consultoría | Sus proyectos: DEMO-001, 002, 003, 005 y 006 |
| `luis.lider` | Líder de Consultoría | Los cinco proyectos de la práctica; valida revisiones y decide cambios |
| `carla.direccion` | Dirección de ambas prácticas | Los seis proyectos, solo consulta |
| `pablo.pm` | PM y líder de Datos | Solo DEMO-004 |
| `diego.dev` | Sin rol; integrante y responsable de hitos y riesgos | Los proyectos donde participa, sin importes |
| `elena.lectora` | Sin rol; lectora en DEMO-001 | Solo DEMO-001, sin economía |

Todos usan la contraseña `DEMO_USER_PASSWORD` de `.env`. El administrador de desarrollo recibe además roles de PM y líder en Consultoría y de Dirección en Datos.

| Proyecto | Situación |
| --- | --- |
| DEMO-001 Portal de clientes | En riesgo: hito crítico vencido, gasto por delante del avance, riesgo materializado, alertas con y sin causa y plan, un cambio pendiente y un ciclo semanal abierto con borrador |
| DEMO-002 Migración a la nube | Saludable: hitos a tiempo, un cambio aprobado con línea base v2, una renovación próxima y una revisión en validación del líder |
| DEMO-003 Soporte de aplicaciones | Recién iniciado, sin línea base, con una revisión devuelta por el líder y su acción de corrección |
| DEMO-004 Modelo de predicción de demanda | De otra práctica, para comprobar el alcance por rol; sin ciclo de revisión |
| DEMO-005 Tablero de indicadores | Pausado hace 45 días: exige describir el motivo antes de editar |
| DEMO-006 Mesa de ayuda corporativa | Saludable, con dos ciclos de revisión anteriores para ver la tendencia entre ciclos |

Los scores no se anotan aquí porque cambian con la fecha; se ven en la pantalla Inicio o en el Portafolio.

Funciona: acceso y administración (usuarios, prácticas, tipos de servicio y días festivos); proyectos con equipo, hitos, riesgos, línea base, cambios aprobados, economía, evidencias, renovaciones y estado; evaluación de salud con confianza, tendencia y proyección; ciclo de revisión con Health Review y validación del líder; alertas con causa y plan, acciones automáticas y manuales; proceso programado; notificaciones; Inicio (Health Center), portafolio, historial y línea de tiempo, pausados y cerrados, y la ayuda del modelo PHF. `test:e2e` ejecuta el recorrido de punta a punta sobre una base desechable `phs_e2e`. Lo que falta de cada historia está en su estado en el [backlog](docs/producto/BACKLOG.md).

## Probar con Docker

Para probar la aplicación completa sin instalar Node.js ni PostgreSQL:

```sh
sh scripts/docker-demo.sh
```

El script construye las imágenes en la propia máquina, arranca todo y muestra la dirección ([localhost:8080](http://localhost:8080)) y los usuarios de demostración. Para compartirlo basta dar acceso al repositorio o enviar un zip del código: no se publica ninguna imagen. Detalle, opciones y problemas frecuentes en [docs/DOCKER.md](docs/DOCKER.md). Es un entorno de prueba, no el del piloto.

## Integración continua

Cada cambio en `main` y cada pull request ejecuta [.github/workflows/ci.yml](.github/workflows/ci.yml) en GitHub Actions, con PostgreSQL 17 y los valores de desarrollo de `.env.example`:

1. **Compilar y probar:** compilación, tipos, pruebas de código, pruebas SQL, diccionario de datos al día y matriz de pruebas.
2. **Recorrido de punta a punta:** `test:e2e` con los servicios y la web reales; si falla, guarda los registros y las capturas como artefacto.
3. **Imágenes Docker:** construye las imágenes, levanta el entorno completo y comprueba que la web responde y que un usuario de demostración inicia sesión.

## Abrir el prototipo

Desde la raíz del repositorio:

```sh
python3 Project-Health-System-Prototype/app.py
```

Abrir [localhost:8000](http://localhost:8000). Los datos del prototipo se guardan en el navegador; todavía no utiliza PostgreSQL.

La instalación y validación del esquema se describen en la [guía de base de datos](docs/DATABASE-PHS.md).
