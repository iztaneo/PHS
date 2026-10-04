# ADR-001 — Stack del MVP PHS

- Fecha: 2026-10-03, America/Mexico_City.
- Estado: propuesta técnica inicial; PostgreSQL confirmado, restricciones del equipo aún no confirmadas.
- Relación: D06 y PHS-003; detalles en [STACK-TECNOLOGICO.md](../STACK-TECNOLOGICO.md).

## Contexto

PHS es una aplicación interna con formularios, tableros, decisiones transaccionales, historial, evidencia y procesos por calendario. Existe un prototipo JavaScript y un esquema PostgreSQL con triggers, claves compuestas y snapshots. No hay backend de negocio ni tecnología corporativa obligatoria informada.

## Selección propuesta

TypeScript en web y backend; React/Vite para UI; NestJS para API y worker; PostgreSQL 17 con Kysely/pg y migraciones SQL mediante dbmate. Motor PHF como paquete puro. OIDC para integrar identidad corporativa. Contenedores para empaquetado, pnpm para monorepo y GitHub Actions para CI. Almacenamiento privado de evidencias mediante adaptador.

## Alternativas consideradas

| Alternativa | Evaluación para PHS |
| --- | --- |
| React/Vite + NestJS | Elegida como base propuesta: encaja con web interactiva, módulos de negocio y procesos separados, manteniendo TypeScript y contratos compartidos. |
| Next.js como capa web/backend | Viable. Para el alcance actual, no se identifica una necesidad de renderizado de páginas públicas o SEO que justifique añadir esa capa a la API dedicada. Revisar si aparece esa necesidad. |
| Python/Django o FastAPI | Viable, especialmente con equipo Python o analítica adicional. No se ha comunicado esa preferencia; el servidor Python actual solo sirve archivos. |
| ASP.NET Core o Java/Spring | Viable si corresponde al estándar o capacidad del equipo. Sin esa restricción, se propone TypeScript para conservar un lenguaje principal. |
| ORM como autoridad del esquema | Se propone SQL explícito para conservar las restricciones existentes. Kysely tipa consultas sin reemplazar el contrato SQL; requiere disciplina para actualizar tipos. |
| Broker externo para trabajos | Se propone outbox en PostgreSQL y consumidor probado por el tamaño inicial desconocido. Reconsiderar si complejidad o carga justifican un broker. |
| Backend completo dependiente de un proveedor cloud | Se propone separar dominio, persistencia e identidad mediante adaptadores hasta conocer infraestructura; reduce decisiones prematuras de proveedor. |

Esta tabla expresa juicio de diseño para los requisitos presentes, no benchmarks ni deficiencias generales de las alternativas. Las capacidades consultadas y enlaces oficiales están en el documento de stack.

## Consecuencias

- Se comparte lenguaje y contratos, manteniendo el motor desacoplado de HTTP y UI.
- Se requiere aprender y operar React, Nest y PostgreSQL; la experiencia real del equipo debe confirmar esta conveniencia.
- El worker persistente demanda pruebas de caída, lease, concurrencia y deduplicación; no basta agregar un temporizador.
- Los snapshots y las transacciones siguen bajo control del backend/SQL; un query builder no implementa autorización.
- Las dependencias exactas, sesión, almacenamiento y despliegue quedan por validar en el esqueleto. Esta ADR no declara completadas PHS-003 ni D06.

## Revisión de la decisión

Revisar ante restricción corporativa, proveedor obligatorio, incompatibilidad demostrada o resultados del piloto. Registrar una nueva revisión con motivo en lugar de sustituir silenciosamente la decisión.
