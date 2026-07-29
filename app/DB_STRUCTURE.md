# Estructura de la Base de Datos (Convex)

Documentación de las tablas definidas en `app/convex/schema.ts`. La base de datos es **multi-tienda** y la mayoría de las entidades están indexadas por `tiendaId`.

> **Importante:** el sistema de autenticación es **multi-rol**. Hay 4 roles de
> usuario (Admin, JefeEntrenador, Caja, Gerencia) con permisos diferenciados.
> El personal (cajeros, supervisores, etc.) NO accede al sistema; los cargos en
> `cargoEnum` son solo referencia operativa, no credenciales.

---

## Enums / Tipos literales

### `cargoEnum` — Cargos del personal (NO son roles de usuario)
- `Cajer@`
- `Self Checkout`
- `RS`
- `Ecommerce`
- `Supervisor(@)`
- `JefeCajas`
- `SubGerente`
- `Gerente`

### `tipoCuentaTiendaEnum` — Tipos de cuenta de tienda
- `Cajas`
- `Gerencia`

### `estadoSolicitudResetEnum` — Estados de solicitud de reseteo de contraseña
- `pendiente`
- `aceptada`
- `rechazada`
- `expirada`

### `tipoCajaEnum` — Tipos de caja
- `regular`
- `rapida`
- `autoservicio`

### `tipoNotaEnum` — Tipos de nota en evaluaciones
- `0-20`
- `0-100`
- `bool`

### `recurrenciaEnum` — Recurrencia de plantilla
- `diaria`
- `15dias`
- `unica`

### `estadoTareaEnum` — Estados de tarea
- `pendiente`
- `en_curso`
- `completada`
- `vencida`

### `estadoSemanaEnum` — Estados de la semana
- `borrador`
- `publicada`

### `estadoAsignacionEnum` — Estados de asignación de caja
- `activa`
- `refrigerio`
- `inasistencia`
- `finalizada`

### `tipoCapacitacionEnum` — Tipos de capacitación
- `induccion`
- `reunion`

### `estadoCapacitacionEnum` — Estados de capacitación
- `programada`
- `en_curso`
- `completada`
- `vencida`
- `cancelada`

### `patronTareaEnum` — Patrón de tareas recurrentes
- `diaria`
- `laborables`
- `finde`
- `personalizada`

### `diaSemanaEnum` — Días de la semana
- `lun`, `mar`, `mie`, `jue`, `vie`, `sab`, `dom`

### `modoAsignacionTareaEnum` — Modo de asignación de tarea
- `manual`
- `rotativa`
- `compartida`

---

## Tablas de Convex Auth

Incluidas mediante `...authTables`:
- `users`
- `sessions`
- `accounts`
- `verificationCodes`

(Las gestiona `@convex-dev/auth`.)

---

## Tablas de la aplicación

### 1. `tiendas` — Núcleo multi-tienda
| Campo               | Tipo                       | Descripción                                              |
|---------------------|----------------------------|----------------------------------------------------------|
| nombre              | `string`                   | Nombre de la tienda                                      |
| codigo              | `string`                   | Código identificador (interno; base para usernames)     |
| direccion           | `string`                   | Dirección de la tienda                                   |
| nCajasRegulares     | `number`                   | Cantidad de cajas regulares (INMUTABLE post-creación)    |
| nCajasRapidas       | `number`                   | Cantidad de cajas rápidas (INMUTABLE post-creación)      |
| nCajasSelf          | `number`                   | Cantidad de cajas self-checkout (INMUTABLE post-creación)|
| tienePersonalSelf   | `boolean`                  | Flag de personal self-checkout (INMUTABLE post-creación) |
| tienePersonalRs     | `boolean`                  | Flag de personal RS (INMUTABLE post-creación)            |
| jefeEntrenadorId    | `id("jefesEntrenador")`    | JE asignado a la tienda (1 tienda → 1 JE)                |
| activa              | `boolean`                  | Si la tienda está activa                                 |
| createdAt           | `number`                   | Timestamp de creación                                    |
| updatedAt           | `number`                   | Timestamp de actualización                               |

**Índices:**
- `by_activa` → `["activa"]`
- `by_codigo` → `["codigo"]`
- `by_je` → `["jefeEntrenadorId"]`

---

### 2. `admins` — Administradores globales
| Campo         | Tipo      | Descripción                                |
|---------------|-----------|--------------------------------------------|
| username      | `string`  | Único global, lowercase                    |
| nombre        | `string`  | Nombre                                     |
| apellido      | `string`  | Apellido                                   |
| passwordHash  | `string`  | Hash SHA-256 de la contraseña              |
| activo        | `boolean` | Si la cuenta está activa                   |
| createdAt     | `number`  | Timestamp                                  |
| updatedAt     | `number`  | Timestamp                                  |
| lastLoginAt   | `number?` | Último login                               |

**Índices:**
- `by_username` → `["username"]`
- `by_activo` → `["activo"]`

---

### 3. `jefesEntrenador` — Jefes Entrenador (globales)
| Campo               | Tipo      | Descripción                                          |
|---------------------|-----------|------------------------------------------------------|
| username            | `string`  | Único global, lowercase                              |
| nombre              | `string`  | Nombre                                               |
| apellido            | `string`  | Apellido                                             |
| passwordHash        | `string`  | Hash SHA-256 de la contraseña                        |
| mustChangePassword  | `boolean` | Si debe cambiar la pass en el próximo login           |
| activo              | `boolean` | Si la cuenta está activa                             |
| createdAt           | `number`  | Timestamp                                            |
| updatedAt           | `number`  | Timestamp                                            |
| lastLoginAt         | `number?` | Último login                                         |

**Índices:**
- `by_username` → `["username"]`
- `by_activo` → `["activo"]`

---

### 4. `passwordResetRequests` — Solicitudes de reseteo (Caja/Gerencia → JE)
| Campo                              | Tipo                       | Descripción                          |
|------------------------------------|----------------------------|--------------------------------------|
| tiendaId                           | `id("tiendas")`            | Tienda solicitante                   |
| tipoSolicitante                    | `tipoCuentaTiendaEnum`     | "Cajas" o "Gerencia"                 |
| userProfileId                      | `id("userProfiles")`       | Cuenta solicitante                   |
| usernameSnapshot                   | `string`                   | Snapshot del username                |
| motivo                             | `string?`                  | Motivo opcional                      |
| estado                             | `estadoSolicitudResetEnum` | pendiente/aceptada/rechazada/expirada|
| respondidaPorJefeEntrenadorId      | `id("jefesEntrenador")?`   | JE que respondió                     |
| respondidaAt                       | `number?`                  | Timestamp de respuesta               |
| motivoRechazo                      | `string?`                  | Motivo del rechazo                   |
| passwordReseteadaHash              | `string?`                  | Hash de la nueva pass (auditoría)    |
| createdAt                          | `number`                   | Timestamp de creación                |

**Índices:**
- `by_tienda_estado` → `["tiendaId", "estado"]`
- `by_userprofile` → `["userProfileId"]`
- `by_je` → `["respondidaPorJefeEntrenadorId"]`

---

### 5. `userProfiles` — Cuentas de tienda (Caja y Gerencia)
| Campo               | Tipo                       | Descripción                                       |
|---------------------|----------------------------|---------------------------------------------------|
| userId              | `id("users")`              | Referencia al usuario de Convex Auth              |
| tiendaId            | `id("tiendas")`            | Tienda a la que pertenece                         |
| tipoCuenta          | `tipoCuentaTiendaEnum`     | "Cajas" o "Gerencia"                              |
| nombreCompleto      | `string`                   | Nombre visible                                    |
| username            | `string`                   | Único global, lowercase                           |
| activo              | `boolean`                  | Si la cuenta está activa                          |
| mustChangePassword  | `boolean`                  | Si debe cambiar la pass en el próximo login       |
| createdAt           | `number`                   | Timestamp                                         |
| updatedAt           | `number`                   | Timestamp                                         |
| lastLoginAt         | `number?`                  | Último login                                      |

**Índices:**
- `by_user` → `["userId"]`
- `by_tienda` → `["tiendaId"]`
- `by_tienda_tipo` → `["tiendaId", "tipoCuenta"]`
- `by_username` → `["username"]`
| tiendaId        | `id("tiendas")`               | Tienda asignada                      |
| nombreCompleto  | `string`                      | Nombre completo                      |
| rol             | `rolSistemaEnum`              | Rol en el sistema                    |
| personalId      | `id("personales")?`           | Vinculación opcional con `personales` |

**Índices:**
- `by_user` → `["userId"]`
- `by_tienda` → `["tiendaId"]`

---

### 3. `personales` — Cajeros / empleados
| Campo                       | Tipo                       | Descripción                                    |
|-----------------------------|----------------------------|------------------------------------------------|
| tiendaId                    | `id("tiendas")`            | Tienda                                         |
| apellidos                   | `string`                   | Apellidos                                      |
| nombres                     | `string`                   | Nombres                                        |
| nick                        | `string`                   | Cómo quiere que le llamen                      |
| cargo                       | `cargoEnum`                | Cargo                                          |
| codigoEmpleado              | `string?`                  | Código de empleado                             |
| codigoOperadorCaja          | `string?`                  | Código operador de caja                        |
| supervisorId                | `id("personales")?`        | Supervisor a cargo                             |
| soloCajaRapida              | `boolean`                  | Antes "inhabilitado"                           |
| esAsistenteAutoservicio     | `boolean`                  | Marca de asistente de autoservicio             |
| autoServicioPreferencial    | `boolean?`                 | Preferencia en autoservicio                    |
| activo                      | `boolean`                  | Si está activo                                 |
| orden                       | `number`                   | Orden de listado                               |
| createdAt                   | `number`                   | Timestamp de creación                          |
| updatedAt                   | `number`                   | Timestamp de actualización                     |

**Índices:**
- `by_tienda` → `["tiendaId"]`
- `by_tienda_activo` → `["tiendaId", "activo"]`
- `by_tienda_cargo` → `["tiendaId", "cargo"]`
- `by_supervisor` → `["supervisorId"]`

---

### 4. `semanas` — Semanas de planificación
| Campo         | Tipo                  | Descripción                       |
|---------------|-----------------------|-----------------------------------|
| tiendaId      | `id("tiendas")`       | Tienda                            |
| fechaInicio   | `string`              | `YYYY-MM-DD` (lunes)              |
| fechaFin      | `string`              | `YYYY-MM-DD`                      |
| estado        | `estadoSemanaEnum`    | Estado de la semana               |
| createdAt     | `number`              | Timestamp de creación             |

**Índices:**
- `by_tienda` → `["tiendaId"]`
- `by_tienda_inicio` → `["tiendaId", "fechaInicio"]`

---

### 5. `horarios` — Horario por día del personal
| Campo        | Tipo                       | Descripción                                |
|--------------|----------------------------|--------------------------------------------|
| tiendaId     | `id("tiendas")`            | Tienda                                     |
| semanaId     | `id("semanas")`            | Semana                                     |
| personalId   | `id("personales")`         | Persona                                    |
| dia          | `number`                   | 1=lunes … 7=domingo                        |
| entrada      | `string?`                  | `HH:MM` o `null` si descanso               |
| salida       | `string?`                  | `HH:MM`                                    |
| descanso     | `boolean`                  | Marca de día libre                         |
| createdAt    | `number`                   | Timestamp de creación                      |
| updatedAt    | `number`                   | Timestamp de actualización                 |

**Índices:**
- `by_tienda` → `["tiendaId"]`
- `by_semana_personal` → `["semanaId", "personalId"]`
- `by_semana_dia` → `["semanaId", "dia"]`
- `by_personal` → `["personalId"]`

---

### 6. `metasSemanales` — Metas SIP semanales
| Campo       | Tipo                | Descripción        |
|-------------|---------------------|--------------------|
| tiendaId    | `id("tiendas")`     | Tienda             |
| semanaId    | `id("semanas")`     | Semana             |
| debitoPct   | `number`            | Meta % débito      |
| totalPct    | `number`            | Meta % total       |

**Índices:**
- `by_semana` → `["semanaId"]`
- `by_tienda` → `["tiendaId"]`

---

### 7. `participacionesSIP` — Participación SIP diaria
| Campo        | Tipo                       | Descripción                          |
|--------------|----------------------------|--------------------------------------|
| tiendaId     | `id("tiendas")`            | Tienda                               |
| fecha        | `string`                   | `YYYY-MM-DD`                         |
| personalId   | `id("personales")`         | Persona                              |
| debitoPct    | `number`                   | % débito                             |
| totalPct     | `number`                   | % total (crédito = total - débito)   |
| createdAt    | `number`                   | Timestamp de creación                |

**Índices:**
- `by_tienda_fecha` → `["tiendaId", "fecha"]`
- `by_personal_fecha` → `["personalId", "fecha"]`

---

### 8. `velocidades` — Velocidad de atención
| Campo        | Tipo                       | Descripción   |
|--------------|----------------------------|---------------|
| tiendaId     | `id("tiendas")`            | Tienda        |
| fecha        | `string`                   | `YYYY-MM-DD`  |
| personalId   | `id("personales")`         | Persona       |
| valor        | `number`                   | Valor         |
| meta         | `number?`                  | Meta          |

**Índices:**
- `by_tienda_fecha` → `["tiendaId", "fecha"]`
- `by_personal_fecha` → `["personalId", "fecha"]`

---

### 9. `tinkas` — Tinkas (cumplidos)
| Campo        | Tipo                       | Descripción       |
|--------------|----------------------------|-------------------|
| tiendaId     | `id("tiendas")`            | Tienda            |
| fecha        | `string`                   | `YYYY-MM-DD`      |
| personalId   | `id("personales")`         | Persona           |
| cantidad     | `number`                   | Cantidad (entero) |

**Índices:**
- `by_tienda_fecha` → `["tiendaId", "fecha"]`
- `by_personal_fecha` → `["personalId", "fecha"]`

---

### 10. `plantillasEvaluacion` — Plantillas de evaluación
| Campo            | Tipo                                            | Descripción                                  |
|------------------|-------------------------------------------------|----------------------------------------------|
| tiendaId         | `id("tiendas")`                                 | Tienda                                       |
| nombre           | `string`                                        | Nombre de la plantilla                       |
| tipoNota         | `tipoNotaEnum`                                  | Tipo de nota global                          |
| campos           | `array<{label, tipo, peso}>`                    | Campos de la evaluación                      |
| recurrencia      | `recurrenciaEnum`                               | `diaria` / `15dias` / `unica`                |
| obligatoria      | `boolean`                                       | Si es obligatoria                            |
| asignadosModo    | `union("todos" \| "cargo" \| "personales")`     | Modo de asignación                           |
| asignadosCargo   | `cargoEnum?`                                    | Cargo objetivo (si aplica)                   |
| asignadosIds     | `id("personales")[]?`                           | Personas específicas (si aplica)             |
| activa           | `boolean`                                       | Plantilla activa                             |
| createdAt        | `number`                                        | Timestamp de creación                        |

**Índices:**
- `by_tienda` → `["tiendaId"]`

---

### 11. `evaluaciones` — Evaluaciones realizadas
| Campo             | Tipo                                                   | Descripción                  |
|-------------------|--------------------------------------------------------|------------------------------|
| tiendaId          | `id("tiendas")`                                        | Tienda                       |
| plantillaId       | `id("plantillasEvaluacion")`                           | Plantilla aplicada           |
| fechaProgramada   | `string`                                               | `YYYY-MM-DD`                 |
| personalId        | `id("personales")`                                     | Persona evaluada             |
| valores           | `array<{label, valor: number \| boolean, peso}>`       | Respuestas por campo         |
| notaFinal         | `number`                                               | Nota calculada               |
| fechaRealizada    | `string?`                                              | `YYYY-MM-DD`                 |
| observaciones     | `string?`                                              | Observaciones                |

**Índices:**
- `by_tienda_fecha` → `["tiendaId", "fechaProgramada"]`
- `by_plantilla` → `["plantillaId"]`
- `by_personal` → `["personalId"]`

---

### 12. `inducciones` — Inducciones
| Campo             | Tipo                                                                                  | Descripción                              |
|-------------------|---------------------------------------------------------------------------------------|------------------------------------------|
| tiendaId          | `id("tiendas")`                                                                       | Tienda                                   |
| tema              | `string`                                                                              | Tema                                     |
| descripcion       | `string`                                                                              | Descripción                              |
| fechaProgramada   | `string`                                                                              | `YYYY-MM-DD`                             |
| fechaFin          | `string?`                                                                             | `YYYY-MM-DD`                             |
| dias              | `string[]`                                                                            | Días                                     |
| plazo             | `string?`                                                                             | Plazo                                    |
| asistenciales     | `array<{personalId, fechaRecibido?, nota?}>`                                          | Asistentes y resultados                  |
| modoAsignacion    | `union("manual" \| "cargo" \| "todos")`                                               | Cómo se asigna                           |
| cargos            | `union(Cajer@, Self Checkout, RS, Ecommerce)[]?`                                      | Cargos objetivo                          |
| personalIds       | `id("personales")[]`                                                                  | Personas asignadas                       |
| estado            | `union(programada \| en_curso \| completada \| vencida \| cancelada)`                 | Estado                                   |
| createdBy         | `id("users")?`                                                                        | Autor                                    |
| createdAt         | `number`                                                                              | Timestamp de creación                    |

**Índices:**
- `by_tienda` → `["tiendaId"]`
- `by_tienda_fecha` → `["tiendaId", "fechaProgramada"]`
- `by_tienda_estado` → `["tiendaId", "estado"]`

---

### 13. `reuniones` — Reuniones
| Campo          | Tipo                       | Descripción                       |
|----------------|----------------------------|-----------------------------------|
| tiendaId       | `id("tiendas")`            | Tienda                            |
| fecha          | `string`                   | `YYYY-MM-DD`                      |
| hora           | `string`                   | `HH:MM`                           |
| duracionMin    | `number`                   | Duración en minutos               |
| motivo         | `string`                   | Motivo                            |
| personalIds    | `id("personales")[]`       | Personas convocadas               |
| notas          | `string?`                  | Notas                             |
| paraTodaArea   | `boolean`                  | Si es para todo el área           |
| createdBy      | `id("users")`              | Autor                             |
| createdAt      | `number`                   | Timestamp de creación             |

**Índices:**
- `by_tienda_fecha` → `["tiendaId", "fecha"]`
- `by_tienda` → `["tiendaId"]`

---

### 14. `tareasRecurrentes` — Plantillas de tareas recurrentes
| Campo                  | Tipo                                                          | Descripción                          |
|------------------------|---------------------------------------------------------------|--------------------------------------|
| tiendaId               | `id("tiendas")`                                               | Tienda                               |
| titulo                 | `string`                                                      | Título                               |
| descripcion            | `string?`                                                     | Descripción                          |
| horaSugerida           | `string?`                                                     | `HH:MM`                              |
| activa                 | `boolean`                                                     | Si está activa                       |
| patron                 | `patronTareaEnum`                                             | `diaria` / `laborables` / `finde` / `personalizada` |
| diasSemana             | `diaSemanaEnum[]?`                                            | Días de la semana                    |
| modoAsignacion         | `modoAsignacionTareaEnum`                                     | `manual` / `rotativa` / `compartida` |
| poolIds                | `id("personales")[]?`                                         | Pool de candidatos                   |
| asignadosFijosIds      | `id("personales")[]?`                                         | Asignados fijos                      |
| rotativoIndice         | `number?`                                                     | Índice para rotación                 |
| rotativoSentido        | `union(secuencial \| aleatorio)?`                             | Sentido de rotación                  |
| ultimaMaterializacion  | `string?`                                                     | Última fecha materializada           |
| skippedDates           | `string[]?`                                                   | Fechas omitidas                      |

**Índices:**
- `by_tienda` → `["tiendaId"]`
- `by_tienda_activa` → `["tiendaId", "activa"]`

---

### 15. `tareasInstancia` — Instancias diarias de tareas
| Campo              | Tipo                                | Descripción                        |
|--------------------|-------------------------------------|------------------------------------|
| tiendaId           | `id("tiendas")`                     | Tienda                             |
| fecha              | `string`                            | `YYYY-MM-DD`                       |
| titulo             | `string`                            | Título                             |
| descripcion        | `string?`                           | Descripción                        |
| plazo              | `string?`                           | Plazo                              |
| recurrenteId       | `id("tareasRecurrentes")?`          | Origen recurrente                  |
| asignadosIds       | `id("personales")[]`                | Asignados                          |
| completadosIds     | `id("personales")[]`                | Quiénes ya la completaron          |
| responsableId      | `id("personales")?`                 | Responsable principal               |
| colaboradoresIds   | `id("personales")[]`                | Colaboradores                      |
| parentInstanciaId  | `id("tareasInstancia")?`            | Instancia padre (sub-tareas)       |
| estado             | `estadoTareaEnum`                   | Estado actual                      |
| createdBy          | `id("users")?`                      | Autor                              |
| createdAt          | `number`                            | Timestamp de creación              |

**Índices:**
- `by_tienda_fecha` → `["tiendaId", "fecha"]`
- `by_tienda_estado` → `["tiendaId", "estado"]`
- `by_tienda_fecha_responsable` → `["tiendaId", "fecha", "responsableId"]`

---

### 16. `capacitaciones` — Capacitaciones (inducciones + reuniones fusionadas)
| Campo         | Tipo                                                                              | Descripción                                |
|---------------|-----------------------------------------------------------------------------------|--------------------------------------------|
| tiendaId      | `id("tiendas")`                                                                   | Tienda                                     |
| tema          | `string`                                                                          | Tema                                       |
| descripcion   | `string?`                                                                         | Descripción                                |
| tipo          | `tipoCapacitacionEnum?`                                                           | `induccion` / `reunion`                    |
| motivo        | `string?`                                                                         | Motivo                                     |
| fechaInicio   | `string`                                                                          | `YYYY-MM-DD`                               |
| fechaFin      | `string`                                                                          | `YYYY-MM-DD`                               |
| turnos        | `array<{id, fecha, hora, duracionMin}>`                                           | Turnos / sesiones                          |
| personalIds   | `id("personales")[]`                                                              | Asignados                                  |
| estado        | `estadoCapacitacionEnum`                                                          | Estado                                     |
| notas         | `string?`                                                                         | Notas                                      |
| createdBy     | `id("users")?`                                                                    | Autor                                      |
| createdAt     | `number`                                                                          | Timestamp de creación                      |

**Índices:**
- `by_tienda_fecha` → `["tiendaId", "fechaInicio"]`

---

### 17. `capacitacionAsignaciones` — Asignaciones individuales de capacitación
| Campo            | Tipo                       | Descripción              |
|------------------|----------------------------|--------------------------|
| capacitacionId   | `id("capacitaciones")`     | Capacitación             |
| personalId       | `id("personales")`         | Persona                  |
| turnoId          | `string?`                  | Turno específico         |
| fechaRecibido    | `string?`                  | `YYYY-MM-DD`             |
| nota             | `string?`                  | Nota                     |

**Índices:**
- `by_capacitacion` → `["capacitacionId"]`
- `by_personal` → `["personalId"]`

---

### 18. `cajas` — Cajas registradoras
| Campo          | Tipo                 | Descripción                       |
|----------------|----------------------|-----------------------------------|
| tiendaId       | `id("tiendas")`      | Tienda                            |
| codigo         | `number`             | 1..30                             |
| tipo           | `tipoCajaEnum`       | `regular` / `rapida` / `autoservicio` |
| preferencial   | `boolean`            | Caja preferencial                 |

**Índices:**
- `by_tienda` → `["tiendaId"]`
- `by_tienda_codigo` → `["tiendaId", "codigo"]`

---

### 19. `funcionesSecundarias` — Funciones secundarias dentro de caja
| Campo     | Tipo                | Descripción       |
|-----------|---------------------|-------------------|
| tiendaId  | `id("tiendas")`     | Tienda            |
| nombre    | `string`            | Nombre            |
| color     | `string`            | Color (UI)        |

**Índices:**
- `by_tienda` → `["tiendaId"]`

---

### 20. `asignacionesCaja` — Asignación diaria de caja/tarea
| Campo                | Tipo                                  | Descripción                          |
|----------------------|---------------------------------------|--------------------------------------|
| tiendaId             | `id("tiendas")`                       | Tienda                               |
| fecha                | `string`                              | `YYYY-MM-DD`                         |
| cajaId               | `id("cajas")?`                        | Caja (opcional: solo tarea)          |
| personalId           | `id("personales")`                    | Persona asignada                     |
| horaInicio           | `string`                              | `HH:MM`                              |
| horaFin              | `string`                              | `HH:MM`                              |
| bloque               | `number`                              | Orden de cascada en la caja          |
| funcionSecundaria    | `id("funcionesSecundarias")?`         | Función secundaria                   |
| observaciones        | `string?`                             | Observaciones                        |
| estado               | `estadoAsignacionEnum`                | Estado de la asignación              |
| createdAt            | `number`                              | Timestamp de creación                |
| updatedAt            | `number`                              | Timestamp de actualización           |

**Índices:**
- `by_tienda_fecha` → `["tiendaId", "fecha"]`
- `by_tienda_fecha_caja` → `["tiendaId", "fecha", "cajaId"]`
- `by_personal_fecha` → `["personalId", "fecha"]`

---

### 21. `logAlgoritmoCajas` — Log de decisiones del algoritmo de cajas
| Campo        | Tipo                       | Descripción       |
|--------------|----------------------------|-------------------|
| tiendaId     | `id("tiendas")`            | Tienda            |
| fecha        | `string`                   | `YYYY-MM-DD`      |
| personalId   | `id("personales")`         | Persona           |
| cajaId       | `id("cajas")?`             | Caja involucrada  |
| decision     | `string`                   | Decisión tomada   |
| detalle      | `string`                   | Detalle           |
| createdAt    | `number`                   | Timestamp         |

**Índices:**
- `by_tienda_fecha` → `["tiendaId", "fecha"]`
- `by_personal` → `["personalId"]`

---

### 22. `notificaciones` — Notificaciones a usuarios
| Campo       | Tipo                  | Descripción          |
|-------------|-----------------------|----------------------|
| tiendaId    | `id("tiendas")`       | Tienda               |
| usuarioId   | `id("users")`         | Destinatario         |
| tipo        | `string`              | Tipo de notificación |
| titulo      | `string`              | Título               |
| mensaje     | `string`              | Mensaje              |
| link        | `string?`             | Enlace opcional      |
| leida       | `boolean`             | Si fue leída         |
| createdAt   | `number`              | Timestamp            |

**Índices:**
- `by_usuario` → `["usuarioId"]`
- `by_usuario_leida` → `["usuarioId", "leida"]`
- `by_tienda` → `["tiendaId"]`

---

### 23. `logs` — Log de auditoría
| Campo          | Tipo                | Descripción                       |
|----------------|---------------------|-----------------------------------|
| tiendaId       | `id("tiendas")`     | Tienda                            |
| usuarioId      | `id("users")?`      | Usuario que actuó                 |
| usuarioNombre  | `string`            | Nombre (snapshot)                 |
| accion         | `string`            | `crear` / `actualizar` / `eliminar` |
| entidad        | `string`            | Entidad afectada                  |
| entidadId      | `string`            | ID de la entidad                  |
| antes          | `any?`              | Estado anterior                   |
| despues        | `any?`              | Estado nuevo                      |
| createdAt      | `number`            | Timestamp                         |

**Índices:**
- `by_tienda` → `["tiendaId"]`
- `by_tienda_entidad` → `["tiendaId", "entidad"]`
- `by_tienda_fecha` → `["tiendaId", "createdAt"]`
- `by_usuario` → `["usuarioId"]`

---

## Diagrama de relaciones (resumen)

```
admins                            (global, login con username, sin tienda)
  └── passwordHash

jefesEntrenador                   (global, login con username, sin tienda propia)
  ├── passwordHash + mustChangePassword
  └── (asignado a N tiendas vía FK en tiendas)

tiendas
  ├── jefeEntrenadorId ──► jefesEntrenador  (1 tienda → 1 JE)
  ├── codigo, direccion, nCajas*, tienePersonal*
  ├── activa
  ├── cajas (1..N filas)
  │
  ├── userProfiles (2 filas: 1 Cajas + 1 Gerencia, cada una con username)
  │     ├── tipoCuenta: "Cajas" | "Gerencia"
  │     └── mustChangePassword
  │
  └── passwordResetRequests
        ├── tipoSolicitante: "Cajas" | "Gerencia"
        └── respondidaPorJefeEntrenadorId ──► jefesEntrenador

users (Convex Auth, base)
  └── userProfiles ──► tiendas
                  └──► personales

tiendas
  ├── personales ──► supervisorId (self-ref)
  ├── semanas ──► horarios
  ├── metasSemanales
  ├── participacionesSIP
  ├── velocidades
  ├── tinkas
  ├── plantillasEvaluacion ──► evaluaciones
  ├── inducciones
  ├── reuniones
  ├── tareasRecurrentes ──► tareasInstancia
  ├── capacitaciones ──► capacitacionAsignaciones
  ├── cajas
  ├── funcionesSecundarias
  ├── asignacionesCaja ──► cajaId? ──► cajas
  │                  └──► personalId ──► personales
  ├── logAlgoritmoCajas
  ├── notificaciones ──► users
  └── logs ──► users?
```

---

## Roles de usuario y permisos (resumen)

Ver `PLANEACION_AUTH_MULTINIVEL.md` para la especificación completa.

| Rol            | Identificador | Tienda                  | Permisos clave                            |
|----------------|---------------|-------------------------|-------------------------------------------|
| Admin          | `username`    | (ninguna, global)       | CRUD tiendas, JEs, Admins. Operar sobre cualquier tienda con permisos de JE. |
| JefeEntrenador | `username`    | 1..N tiendas asignadas  | Editar nombre/dir de sus tiendas. Gestionar cuentas Caja/Gerencia. Operar como Caja. |
| Caja (tienda)  | `username`    | 1 tienda fija (1 cuenta)| CRUD operativo completo de la tienda. NO cambia su propia contraseña. |
| Gerencia       | `username`    | 1 tienda fija (1 cuenta)| Solo lectura de la tienda. NO cambia su propia contraseña. |

**Login:** todos usan `username` + `password`. Contraseña inicial por defecto `12345678`
para JE / Caja / Gerencia (con cambio obligatorio en el primer login). Admin define su
contraseña al crearse.

---

**Archivo fuente:** `app/convex/schema.ts`
**Backend:** Convex (`@convex-dev/auth` + tablas propias para Admin/JE)
**Auth refactor:** ver `app/PLANEACION_AUTH_MULTINIVEL.md` y `app/PLANEACION_AUTH_MULTINIVEL.md`.
