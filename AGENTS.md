# Instrucciones del proyecto PHS

## Memoria del trabajo

- Al comenzar trabajo en este repositorio, leer `docs/BITACORA.md`, su estado actual y las entradas recientes. Consultar también la especificación, el backlog y las decisiones relacionadas con el trabajo.
- La bitácora es la memoria compartida del proyecto. Mantenerla en español, con hechos comprobados; distinguir propuestas, decisiones confirmadas, trabajo terminado y pendientes.
- Actualizar la bitácora **en cada commit**, incluyendo los cambios de documentación, configuración, correcciones y reversiones. La entrada debe formar parte del mismo commit que el trabajo que documenta.
- Cada entrada tiene un identificador consecutivo `BIT-NNNN`, fecha y zona horaria, objetivo, trabajo realizado, archivos relevantes, decisiones, validaciones y límites, pendientes y siguiente paso. Referenciar historias PHS y decisiones D cuando corresponda.
- Incluir el identificador de la entrada en el mensaje del commit: `BIT-0002: descripción concreta`. No intentar guardar el hash de un commit dentro de sí mismo. El identificador permite localizarlo con `git log --all --grep='BIT-0002'`.
- Conservar las entradas históricas. Corregir un dato histórico mediante una aclaración fechada en una entrada nueva; actualizar el resumen de estado actual sin borrar la historia.
- Antes de confirmar cambios, revisar el diff y comprobar que la entrada describe todos los archivos incluidos. No incorporar cambios ajenos o secretos para completar un commit.
- Después del commit, comprobar el estado del repositorio y subir la rama al remoto configurado para el proyecto cuando exista un destino autorizado. No usar force push. Si no hay remoto/destino, solicitarlo, conservar el commit local e informar que la subida está pendiente. No inventar un destino ni afirmar que se publicó.
- Un error de push no deshace el trabajo local: informar el error y preservar el commit para reintentar. No crear una cadena de commits solamente para anotar hashes o confirmaciones de push; Git registra esos estados.
- Antes de terminar una sesión, dejar la bitácora actualizada con el punto exacto para continuar. No marcar una historia como implementada por haber escrito su especificación o creado una tabla.

## Datos de prueba

- Regla del usuario (2026-10-04): cada cambio debe poder probarse con datos ya cargados. Al terminar un cambio funcional, la base local debe tener datos de demostración que permitan recorrer el flujo afectado sin capturarlos a mano.
- Los datos se cargan con `pnpm seed:demo` (`apps/identity/src/cli/seed-demo.ts` y `apps/projects/src/cli/seed-demo.ts`). El comando se puede repetir: no duplica ni modifica lo que ya existe.
- Toda funcionalidad nueva amplía ese seed en el mismo commit, con casos que la ejerciten (por ejemplo, un elemento vencido, uno correcto y uno incompleto). Los datos se crean mediante los servicios, no con SQL directo, para que apliquen reglas y auditoría.
- Antes de entregar un cambio, ejecutar el seed sobre la base local y comprobar que los datos nuevos aparecen. No recrear la base local del usuario sin que lo pida: puede contener sus propias pruebas.
- Los usuarios de demostración y su contraseña están en `.env.example` (`DEMO_USER_PASSWORD`); son solo para desarrollo local y nunca se cargan en otro entorno.

## Referencias

- `docs/BITACORA.md`: estado actual e historial.
- `docs/producto/ESPECIFICACION.md`: comportamiento esperado.
- `docs/producto/BACKLOG.md`: historias y criterios de aceptación.
- `docs/producto/DECISIONES.md`: políticas pendientes.
- `docs/producto/PLAN-ENTREGAS.md`: secuencia y pruebas integrales.
- `docs/ARQUITECTURA-PHS.md` y `docs/DATABASE-PHS.md`: arquitectura y persistencia.
