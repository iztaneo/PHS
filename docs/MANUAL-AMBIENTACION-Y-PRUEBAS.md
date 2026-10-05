# Manual de ambientación y pruebas de PHS

## 1. Propósito y alcance

Este manual explica cómo preparar PHS desde una base vacía, crear el primer administrador, configurar la organización y recorrer un proyecto completo. También distingue la ambientación limpia de la carga de demostración y reúne los comandos de verificación automatizada.

El procedimiento comprobado corresponde al entorno local de desarrollo y evaluación. El despliegue de piloto todavía requiere cerrar D07 y PHS-042: respaldos, recuperación, secretos, aislamiento de red, monitoreo y RPO/RTO.

## 2. Qué existe al comenzar

Una base recién migrada contiene:

- el esquema y las 38 tablas de PHS;
- los roles técnicos de los servicios después de ejecutar `db:logins`;
- ocho tipos de servicio: Desarrollo, Arquitectura, DevSecOps, Assessment, AMS / Soporte, Staffing / AT, Consultoría y Data & IA.

No contiene usuarios, prácticas, proyectos, días festivos ni datos de negocio. El primer usuario debe crearse mediante el comando de bootstrap `seed:dev`; ese usuario nace como administrador global y con contraseña temporal.

La capacidad **Administrador** permite gestionar usuarios, prácticas, roles, tipos de servicio y festivos. No concede acceso a proyectos. Para crear y operar el primer proyecto, el administrador también debe asignarse un rol de **PM** o **Líder** dentro de una práctica.

## 3. Requisitos

- macOS o Linux con terminal.
- Node.js 24.
- PostgreSQL 17, incluyendo `initdb`, `pg_ctl`, `psql`, `createdb` y `dropdb`.
- Git.
- Puertos locales libres: 3000–3004, 5173 y 54329.

Comprobar las versiones:

```sh
node --version
npx pnpm@12.9.1 --version
postgres --version
psql --version
```

## 4. Preparar la configuración

Desde la raíz del repositorio:

```sh
cp .env.example .env
```

Para desarrollo local pueden conservarse las URLs y puertos del ejemplo. Antes de iniciar, cambiar al menos estos valores:

```text
POSTGRES_PASSWORD=una-clave-local-propia
INTERNAL_AUTH_SECRET=un-secreto-aleatorio-de-al-menos-32-caracteres
DEV_USER_EMAIL=administrador@empresa.com
DEV_USER_NAME="Administrador inicial"
DEV_USER_PASSWORD=una-clave-temporal-de-al-menos-12-caracteres
```

Todas las URLs de PostgreSQL en `.env` deben usar el mismo `POSTGRES_PASSWORD`. `WEB_ORIGIN` debe coincidir exactamente con la URL desde la que se abre la web.

Para un entorno con HTTPS:

```text
COOKIE_SECURE=true
WEB_ORIGIN=https://direccion-exacta-de-la-web
API_DOCS=false
```

No guardar `.env` en Git. Las contraseñas de `DEV_USER_PASSWORD` y `DEMO_USER_PASSWORD` son temporales o exclusivas de desarrollo.

## 5. Instalar y compilar

```sh
npx pnpm@12.9.1 install --frozen-lockfile
npx pnpm@12.9.1 build
```

Resultado esperado: los paquetes, la web, el gateway y los cuatro servicios compilan sin errores.

## 6. Crear una instalación limpia

No ejecutar `db:setup` en este recorrido: ese comando también carga los seis proyectos de demostración. Para iniciar solo con el administrador, ejecutar los pasos por separado.

### 6.1 Iniciar PostgreSQL local

```sh
npx pnpm@12.9.1 db:local:start
```

Este comando crea una instancia aislada en `.local/pg`, escucha en `127.0.0.1:54329` y no modifica otros servidores PostgreSQL de la computadora.

Como alternativa, si se prefiere Docker:

```sh
npx pnpm@12.9.1 db:up
```

Usar una sola alternativa, no ambas.

### 6.2 Aplicar el esquema

```sh
npx pnpm@12.9.1 db:migrate
npx pnpm@12.9.1 db:logins
```

- `db:migrate` aplica las migraciones 001–015.
- `db:logins` crea o actualiza los usuarios técnicos que usan Identidad, Proyectos, Salud y Plataforma.

### 6.3 Crear el primer administrador

```sh
npx pnpm@12.9.1 seed:dev
```

El comando toma `DEV_USER_EMAIL`, `DEV_USER_NAME` y `DEV_USER_PASSWORD` de `.env`. Es repetible: si el correo ya existe no crea otro usuario ni cambia su contraseña; solo garantiza que tenga capacidad de administrador.

### 6.4 Iniciar la aplicación

```sh
npx pnpm@12.9.1 dev
```

Mantener esa terminal abierta. Comprobar en otra terminal:

```sh
curl http://127.0.0.1:3000/api/v1/status
```

Resultado esperado: gateway, Identidad, Proyectos, Salud y Plataforma aparecen con servicio y base `ok`.

Abrir:

- Aplicación: [http://127.0.0.1:5173](http://127.0.0.1:5173).
- Swagger local, si `API_DOCS=true`: [http://127.0.0.1:3000/api/docs/](http://127.0.0.1:3000/api/docs/).

### 6.5 Primer inicio de sesión

1. Escribir el valor de `DEV_USER_EMAIL`.
2. Escribir la contraseña temporal `DEV_USER_PASSWORD`.
3. La aplicación mostrará **Cambia tu contraseña**.
4. Capturar la contraseña temporal y una nueva contraseña de 12 a 128 caracteres.
5. Confirmar la nueva contraseña.

Después del cambio aparece el menú **Administración**. La contraseña temporal deja de ser válida.

## 7. Configurar la organización desde la interfaz

Seguir este orden evita referencias faltantes al crear el primer proyecto.

### 7.1 Crear prácticas

1. Abrir **Administración → Prácticas**.
2. Capturar un código estable, por ejemplo `CONSULTORIA`.
3. Capturar el nombre visible, por ejemplo `Consultoría y desarrollo`.
4. Seleccionar **Crear práctica**.

La interfaz asigna `America/Mexico_City` como zona horaria. El código no se puede repetir.

### 7.2 Revisar tipos de servicio

1. Abrir **Administración → Tipos de servicio**.
2. Confirmar que los ocho tipos iniciales estén activos.
3. Si hace falta otro tipo, capturar un código en minúsculas con guion bajo, por ejemplo `managed_services`, y su nombre.
4. Desactivar los tipos que no deban aparecer en proyectos nuevos.

Desactivar un tipo no cambia los proyectos que ya lo utilizan.

### 7.3 Crear usuarios

1. Abrir **Administración → Usuarios**.
2. Capturar correo y nombre completo.
3. Marcar **Administrador** únicamente para quienes administrarán la plataforma.
4. Seleccionar **Crear usuario**.
5. Copiar y entregar por un canal seguro la contraseña temporal mostrada. Solo se muestra una vez.
6. Pedir al usuario que inicie sesión y la cambie.

Si la contraseña temporal se pierde, usar **Restablecer contraseña** y copiar el nuevo valor. Restablecerla revoca las sesiones actuales del usuario.

### 7.4 Asignar roles por práctica

En la tarjeta de cada usuario, marcar los roles correspondientes:

| Rol | Alcance principal |
| --- | --- |
| PM | Ve y opera sus proyectos; publica revisiones y ve importes. |
| Líder | Ve todos los proyectos de la práctica; puede operar, decidir cambios, validar revisiones y ver importes. |
| Dirección | Ve todos los proyectos y el portafolio de la práctica, con importes; no opera ni decide. |
| Administrador | Gestiona configuración global; por sí solo no ve ni crea proyectos. |

Para una prueba con una sola persona, asignar al administrador **PM** y **Líder** en la práctica. La autoaprobación está permitida y auditada durante el piloto.

PHS impide deshabilitar o quitar la capacidad al último administrador activo. Antes de deshabilitar usuarios con proyectos, reasignar sus responsabilidades; la aplicación informa cuántas quedan pendientes.

### 7.5 Registrar días festivos

1. Abrir **Administración → Días festivos**.
2. Elegir el año.
3. Capturar fecha y nombre del día inhábil.
4. Repetir para el año actual y el siguiente.

Sábados y domingos ya son inhábiles. Al agregar un festivo, los ciclos aún no enviados que vencían ese día pasan al siguiente día hábil. Quitar el festivo no regresa las fechas ya comunicadas.

## 8. Crear y ambientar el primer proyecto

### 8.1 Alta

1. Iniciar sesión como usuario con rol PM o Líder.
2. Abrir **Proyectos → Nuevo proyecto**.
3. Seleccionar la práctica.
4. Capturar código, cliente, nombre, tipo de servicio y descripción.
5. Elegir PM, líder y responsable técnico; el sponsor es opcional.
6. Capturar vigencia, moneda, contacto del cliente y ruta de escalación.
7. Guardar.

Si el cliente ya existe por nombre, se reutiliza. El proyecto nace **Por iniciar** y sin línea base.

### 8.2 Equipo e hitos

1. Abrir la pestaña **Equipo** y agregar colaboradores o lectores con su asignación.
2. Abrir **Hitos**.
3. Registrar al menos un hito con entregable, responsable y fecha.
4. Marcar como crítico solo aquello que realmente limita la entrega.

### 8.3 Línea base

1. Abrir **Línea base**.
2. Revisar vigencia, responsables, equipo e hitos que quedarán comprometidos.
3. Capturar alcance.
4. Capturar presupuesto y esfuerzo cuando se conozcan; si se omiten, las dimensiones respectivas aparecerán sin dato.
5. Seleccionar **Publicar línea base v1**.

La línea base publicada es inmutable. Los cambios posteriores de compromisos deben pasar por **Cambios** y aprobación del líder, creando una versión nueva.

### 8.4 Poner en ejecución

1. Abrir **Ficha**.
2. En **Estado del proyecto**, capturar el motivo.
3. Seleccionar **Poner en ejecución**.

### 8.5 Configurar el ciclo de revisión

1. Abrir **Revisión → Configurar ciclo**.
2. Elegir frecuencia semanal, quincenal o mensual.
3. Elegir la próxima revisión; debe ser hoy o una fecha futura.
4. Definir horizonte de 1 a 12 ciclos.
5. Elegir si se exige soporte, validación del líder y acciones automáticas.
6. Guardar.

Un ciclo futuro se muestra, pero no permite guardar borrador ni enviar revisión antes de su fecha de inicio.

### 8.6 Completar datos operativos

- **Hitos:** iniciar, actualizar avance y completar con fecha y nota.
- **Riesgos:** registrar probabilidad, impacto, responsable, mitigación y vencimiento.
- **Economía:** registrar costo acumulado y esfuerzo real; las observaciones corrigen mediante una nueva fila, no sobrescribiendo la anterior.
- **Evidencias:** adjuntar soporte al elemento correspondiente.
- **Renovaciones:** registrar fecha, responsable y resultado.
- **Cambios:** proponer ajustes de alcance, presupuesto, esfuerzo, vigencia o hitos; el líder decide.

El scheduler actualiza evaluaciones, alertas y acciones en segundo plano según `HEALTH_SCHEDULER_SECONDS`.

## 9. Recorrido manual de aceptación

Usar este recorrido para comprobar una instalación sin datos demo.

### 9.1 Como PM

1. Crear el proyecto, un hito y la línea base.
2. Ponerlo en ejecución y configurar la revisión.
3. Registrar costo, riesgo y evidencia.
4. Abrir **Salud** y confirmar score, banda, confianza, dimensiones y explicación.
5. Abrir **Revisión**, completar temas, soporte y clima del cliente, y enviar.
6. Proponer un cambio de fecha para un hito.

### 9.2 Como Líder

1. Confirmar que el proyecto aparece en **Inicio** y **Portafolio**.
2. Abrir la revisión enviada.
3. Devolverla con comentario.
4. Volver como PM, corregir y reenviar.
5. Volver como Líder y validar.
6. Aprobar el cambio y comprobar que existe línea base v2 y se conserva v1.

### 9.3 Alertas, acciones e historial

1. Registrar un hito con fecha vencida o usar un proyecto controlado para pruebas.
2. Esperar la siguiente ejecución del scheduler.
3. Confirmar el evento y la acción automática en **Alertas y acciones**.
4. Registrar causa y plan; validar como Líder.
5. Completar la acción y comprobar que el evento solo se cierra cuando desaparece la condición.
6. Revisar **Historial** y **Línea de tiempo** para comprobar autor, fechas y cambios.

### 9.4 Permisos

1. Confirmar que Dirección ve todos los proyectos de su práctica, pero no puede editarlos.
2. Confirmar que un PM no ve proyectos ajenos salvo que pertenezca al equipo o tenga otra responsabilidad.
3. Confirmar que un colaborador sin permiso financiero no ve importes.
4. Confirmar que Administrador sin rol de práctica solo ve configuración.

## 10. Cargar datos de demostración

Para evaluar rápidamente toda la aplicación en un entorno local desechable:

```sh
npx pnpm@12.9.1 seed:demo
```

Requiere que `seed:dev` ya haya creado al administrador. Carga seis usuarios y DEMO-001 a DEMO-006; puede repetirse sin duplicar datos. Las cuentas usan `DEMO_USER_PASSWORD` de `.env`.

Para una instalación local nueva con administrador y demo en un solo comando puede usarse:

```sh
npx pnpm@12.9.1 db:setup
```

No usar `seed:demo` ni `db:setup` en un ambiente que deba comenzar vacío o contener datos reales.

## 11. Pruebas automatizadas

### 11.1 Validación rápida del código

```sh
npx pnpm@12.9.1 typecheck
npx pnpm@12.9.1 build
npx pnpm@12.9.1 db:test:setup
npx pnpm@12.9.1 test
npx pnpm@12.9.1 db:test
npx pnpm@12.9.1 test:matrix
npx pnpm@12.9.1 db:dictionary -- --check
```

Resultado de referencia de BIT-0034: 165 pruebas de código, 15 scripts SQL, matriz de 21 filas y diccionario de 38 tablas/349 columnas.

### 11.2 Recorrido completo

```sh
npx pnpm@12.9.1 test:e2e
```

El comando:

1. recrea exclusivamente la base `phs_e2e`;
2. aplica migraciones y datos demo;
3. inicia gateway, servicios y web;
4. ejecuta 13 escenarios por API y 3 por navegador;
5. detiene los procesos temporales.

Resultado esperado actual: 13/13 API y 3/3 Playwright. La base normal `phs` no se modifica.

## 12. Operación local y diagnóstico

| Acción | Comando o ubicación |
| --- | --- |
| Ver salud | `curl http://127.0.0.1:3000/api/v1/status` |
| Detener servicios web/API | `Ctrl+C` en la terminal de `dev` |
| Detener PostgreSQL local | `npx pnpm@12.9.1 db:local:stop` |
| Revisar log de PostgreSQL | `.local/pg.log` |
| Contratos API | `http://127.0.0.1:3000/api/docs/` |
| Evidencias locales | `.local/evidence/` |
| Estado de migraciones | `npx pnpm@12.9.1 db:status` |

`db:local:reset` elimina toda la instancia de `.local/pg`. Usarlo solamente en desarrollo cuando se quiera borrar deliberadamente todos los datos locales.

### Recuperar al único administrador

Si el único administrador perdió su contraseña y no puede restablecerla desde otra cuenta:

1. detener o mantener la aplicación; PostgreSQL debe seguir activo;
2. crear un segundo administrador temporal con el CLI;
3. iniciar sesión con el segundo administrador y usar **Restablecer contraseña** sobre el primero;
4. comprobar el acceso del primero y después deshabilitar o quitar privilegios al temporal.

Ejemplo, evitando escribir la contraseña dentro del historial del shell:

```sh
cd apps/identity
PHS_NEW_USER_EMAIL=recuperacion@empresa.com \
PHS_NEW_USER_NAME="Administrador de recuperación" \
PHS_NEW_USER_ADMIN=true \
PHS_NEW_USER_PASSWORD="$PHS_RECOVERY_PASSWORD" \
node dist/cli/create-user.js
cd ../..
```

Definir `PHS_RECOVERY_PASSWORD` de forma segura antes del comando. Debe tener entre 12 y 128 caracteres.

## 13. Lista de salida de la ambientación

- [ ] Estado de los cinco componentes y bases en `ok`.
- [ ] Primer administrador con contraseña cambiada.
- [ ] Al menos dos administradores activos para recuperación operativa.
- [ ] Prácticas y zonas horarias revisadas.
- [ ] Usuarios creados y contraseñas temporales entregadas de forma segura.
- [ ] Roles PM, Líder y Dirección asignados por práctica.
- [ ] Tipos de servicio activos revisados.
- [ ] Festivos del año actual y siguiente cargados.
- [ ] Primer proyecto con equipo, hitos y línea base.
- [ ] Proyecto en ejecución con ciclo de revisión configurado.
- [ ] Recorrido PM/Líder y permisos comprobados.
- [ ] Suite automatizada y CI aprobadas.
- [ ] Antes de piloto: D07, respaldo/restauración, secretos, monitoreo y recuperación acordados.
