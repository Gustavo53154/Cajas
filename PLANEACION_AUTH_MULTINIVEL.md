# Planeación: Autenticación y autorización multi-rol (v2)

> **Estado:** Borrador de especificación (2da revisión). **No implementado.**
> **Cambios vs v1:** aplicadas las decisiones del usuario sobre las 15 dudas
> originales; agregada la entidad `passwordResetRequests` y el flujo de
> solicitud de reseteo; ajustada la relación JE↔Tienda a 1:N; ajustados los
> permisos de Admin (sí puede operar directamente sobre una tienda); eliminado
> el permiso de editar `NCajas*` / `TienePersonal*` post-creación; agregado el
> flujo de primer login con cambio obligatorio de contraseña.

---

## 0. Decisiones confirmadas (resumen ejecutivo)

| #   | Tema | Decisión |
|-----|------|----------|
| 1   | Identificador de login | `username` (lowercase) para los 4 roles. No se usa email. |
| 2   | Unicidad de `username` | Global entre los 4 roles (no se repiten usernames aunque sean de tipos distintos). |
| 3   | Contraseña inicial (JE / Caja / Gerencia) | `12345678` por defecto. **Primer login obliga a cambiarla** (no puede ser `12345678` ni igual a la actual). |
| 3b  | Contraseña inicial (Admin) | La que el Admin creador indique en el formulario. Sin flag de primer login. |
| 4   | Relación JE ↔ Tienda | **1:N**: cada tienda tiene exactamente 1 JE; un JE puede tener N tiendas. FK `jefeEntrenadorId` en `tiendas`. |
| 5   | Migración de Gustavo Torres | Se convierte en cuenta de **Caja** en la tienda default. Se crea además un **Admin** nuevo y un **JE** nuevo asignado solo a esa tienda. |
| 6   | Roles viejos `JefeCajas`, `SubGerente`, `Gerente` | Son **cargos del personal** (cargoEnum), no roles de usuario. Se **conservan** en cargoEnum y se eliminan de `rolSistemaEnum`. El personal NO accede al sistema. |
| 7   | Idem anterior | — |
| 8   | `codigo` de tienda | Se mantiene como campo interno (no visible al usuario final, usado para generar usernames). |
| 9   | Cuentas de tienda | **Exactamente 1 de Caja y 1 de Gerencia** por tienda. Creadas automáticamente al crear la tienda. |
| 10  | Reset de contraseña de Caja/Gerencia | Caja/Gerencia **NO** pueden cambiar su propia contraseña. Deben enviar una **solicitud de reseteo** al JE; el JE acepta o rechaza. La nueva contraseña vuelve a ser `12345678` y vuelve a dispararse el flujo de primer login. |
| 10b | Reset de contraseña de JE | El JE sí puede cambiar su propia contraseña libremente. El Admin puede resetear la contraseña de cualquier JE (vuelve a `12345678` + primer login). |
| 10c | Reset de contraseña de Admin | Un Admin puede resetear la contraseña de otro Admin (vuelve a la indicada). Un Admin no puede resetear la suya propia desde el panel — usa "Cambiar contraseña" en Configuración. |
| 11  | Admin operando tienda | **Sin impersonación**. Admin tiene vista global; en cada tienda opera con permisos de JE. |
| 12  | Logs para Admin | Admin ve logs de **todas** las tiendas con filtro por tienda / entidad / usuario / fecha. |
| 13  | Flujo "olvidé mi contraseña" | **No existe**. Toda recuperación es por Admin o JE. |
| 14  | Cierre por inactividad | **No existe**. |
| 15  | `Activa = false` | Bloquea login de todos los usuarios de esa tienda. Admin sigue pudiendo **leer** los datos en modo solo-lectura. |

**Decisiones adicionales del usuario (v2):**

| #  | Tema | Decisión |
|----|------|----------|
| A  | Editar `NCajas*` / `TienePersonal*` | **Nadie** puede editarlos post-creación (ni Admin ni JE). Si hay error, se borra la tienda y se crea de nuevo. |
| B  | Editar `Activa` (activar/desactivar tienda) | Solo el **Admin** puede alternarlo. |
| C  | Asignación de tienda a JE | Por **drag and drop** en la pantalla de gestión de JEs. |
| D  | Admin edita personal/horarios/tareas/etc. directamente | **Sí puede**, sin pasar por la "vista JE". |
| E  | Caja/Gerencia no pueden cambiar su propia contraseña | Confirmado. Solo vía solicitud al JE. |
| F  | Primer login de JE / Caja / Gerencia | Obliga a cambiar la contraseña `12345678` antes de entrar al dashboard. |

---

## 1. Roles y casos de uso (versión ajustada)

### 1.1 Admin (global)

**Identidad:** usuario global, sin tienda fija. Ve todas las tiendas.

#### Autenticación
- `UC-A1`: Iniciar sesión con `username` + `password` (credencial definida al crear).
- `UC-A2`: Cerrar sesión.
- `UC-A3`: Cambiar su propia contraseña (cualquier momento, no hay flag de primer login para Admin).
- `UC-A4`: Ver su propio `username` y nombre en Configuración.

#### Gestión de tiendas
- `UC-A5`: Listar tiendas con filtros (activas/inactivas, búsqueda por nombre/código).
- `UC-A6`: **Crear tienda**:
  - Inputs: `nombre`, `direccion`, `nCajasRegulares`, `nCajasRapidas`, `nCajasSelf`,
    `tienePersonalSelf`, `tienePersonalRs`, `codigo` (auto-sugerido pero editable),
    `jefeEntrenadorId` (selector con los JEs existentes).
  - Validaciones: `nCajas*` ≥ 0 y suman al menos 1.
  - **Efectos colaterales:**
    1. Crea filas en `cajas`: 1..`nCajasRegulares` con `tipo=regular`, siguientes
       `nCajasRapidas` con `tipo=rapida`, últimas `nCajasSelf` con `tipo=autoservicio`.
    2. Crea cuenta de **Caja**: username `caja-{tiendaCodigo}` (lowercase, sin
       caracteres especiales), password `12345678` hasheado, `mustChangePassword=true`.
    3. Crea cuenta de **Gerencia**: username `gerencia-{tiendaCodigo}`, password
       `12345678`, `mustChangePassword=true`.
  - **Devuelve al Admin (mostrar una sola vez):** los 2 usernames + la contraseña
    `12345678` (la misma para ambas, se puede regenerar después).
- `UC-A7`: Editar tienda — **solo** `nombre` y `direccion` (no `NCajas*`, no
  `TienePersonal*`, no `codigo`, no `jefeEntrenadorId`).
  - Si la tienda tiene un error de configuración, hay que **desactivarla y crear
    una nueva** (no se puede borrar; se conserva para auditoría).
- `UC-A8`: Activar / desactivar tienda (toggle de `activa`). Bloquea login pero
  conserva datos.
- `UC-A9`: Ver detalle de tienda: JEs asignados (siempre 1), cuentas Caja/Gerencia
  con su estado, estadísticas (personal activo, cajas, última semana publicada).
- `UC-A10`: Reasignar tienda a otro JE: en la pantalla de gestión de JEs, drag
  & drop de la tienda desde la columna de un JE a la de otro.
- `UC-A11`: Resetear manualmente la contraseña de la cuenta de Caja o Gerencia
  (devuelve a `12345678`, marca `mustChangePassword=true`).

#### Gestión de JefesEntrenador
- `UC-A12`: Crear JE: `username`, `nombre`, `apellido`. Password inicial `12345678`,
  `mustChangePassword=true`.
- `UC-A13`: Listar JEs con filtro (activos/inactivos, con/sin tiendas).
- `UC-A14`: Editar JE: `nombre`, `apellido`, `activo`. (No se puede editar
  `username`; si hay que cambiarlo, se desactiva el viejo y se crea uno nuevo.)
- `UC-A15`: Asignar tiendas a un JE (drag & drop en `/admin/jefes-entrenador`).
- `UC-A16`: Resetear contraseña de un JE (vuelve a `12345678`, primer login).
- `UC-A17`: Desactivar un JE (no se elimina; las tiendas asignadas deben reasignarse
  primero; el sistema bloquea la desactivación si todavía tiene tiendas).

#### Gestión de Admins
- `UC-A18`: Crear otro Admin: `username`, `nombre`, `apellido`, `password` (la
  que el Admin creador indique; sin flag de primer login).
- `UC-A19`: Listar Admins.
- `UC-A20`: Editar Admin: `nombre`, `apellido`, `activo`.
- `UC-A21`: Resetear contraseña de otro Admin (pide nueva contraseña en formulario).
- `UC-A22`: Desactivar Admin (no se puede desactivar a sí mismo).

#### Operación sobre una tienda (permisos de JE, **directo, sin impersonar**)
- `UC-A23`: Desde `/admin/tiendas/[id]/operacion` (o el selector de tienda en el
  header), Admin entra a la tienda con todos los permisos de JE:
  personal, horarios, algoritmo, tablero, tareas, evaluaciones, etc.
  La diferencia visual con un JE: lleva un banner persistente
  "Operando como Admin sobre {Tienda}".

#### Auditoría
- `UC-A24`: Ver logs globales con filtros (tienda, entidad, usuario, acción,
  rango de fechas). Ve también acciones de otros Admins.
- `UC-A25`: Ver logs específicos de una tienda (mismo módulo, filtrado).

#### Lo que **NO** puede
- No puede editar `NCajas*` ni `TienePersonal*` después de creada la tienda.
- No puede borrar una tienda (solo desactivarla). Borrar es destructivo y
  rompería FKs; si hace falta, se hace por script de mantenimiento.
- No puede desactivar su propia cuenta Admin.
- No puede resetear su propia contraseña desde el panel (usa "Cambiar contraseña"
  en Configuración).

---

### 1.2 JefeEntrenador (global, asignado a 1..N tiendas)

**Identidad:** usuario global, asignado a 1..N tiendas. Selecciona tienda activa
en el header.

#### Autenticación
- `UC-JE1`: Iniciar sesión con `username` + `password`.
  - Si `mustChangePassword = true`, redirige a `/cambiar-password-inicial` antes
    del dashboard.
- `UC-JE2`: Cerrar sesión.
- `UC-JE3`: Cambiar su propia contraseña (cuando quiera).
- `UC-JE4`: Ver su propio `username`, nombre y lista de tiendas asignadas en
  Configuración.

#### Gestión de tienda
- `UC-JE5`: Ver solo las tiendas donde está asignado.
- `UC-JE6`: Seleccionar tienda activa (selector en header; default = primera
  tienda asignada o la última usada).
- `UC-JE7`: Editar **nombre** y **dirección** de la tienda activa. (Nada más.)
- `UC-JE8`: Ver configuración de tienda (cajas, funciones secundarias, flags)
  en modo solo-lectura.

#### Gestión de cuentas de tienda
- `UC-JE9`: Ver cuentas de Caja y Gerencia de **cada tienda asignada**: username,
  nombre, activo, `mustChangePassword`, última conexión, fecha de creación.
- `UC-JE10`: Resetear contraseña de Caja o Gerencia de una tienda asignada
  (devuelve a `12345678`, marca `mustChangePassword=true`).
- `UC-JE11`: Activar / desactivar cuenta de Caja o Gerencia (sin reset).
- `UC-JE12`: Atender **solicitudes de reseteo** de Caja/Gerencia:
  - Ver bandeja de solicitudes pendientes (`/solicitudes-reseteo`).
  - Aceptar solicitud: genera nueva contraseña `12345678`, marca
    `mustChangePassword=true` en la cuenta, marca la solicitud como
    `aceptada` con timestamp y la contraseña visible para el JE
    (que se la da al solicitante por WhatsApp o se muestra en la UI del
    propio solicitante al reintentar login).
  - Rechazar solicitud: con `motivo` opcional.

#### Operación (idénticos a Caja, sobre cada tienda asignada)
- `UC-JE13`: Realizar todas las acciones del rol Caja sobre la tienda activa.

#### Lo que **NO** puede
- No crea tiendas nuevas.
- No crea/desactiva otros JEs ni Admins.
- No edita `NCajas*`, `TienePersonal*`, `Activa` de la tienda, ni `codigo`.
- No edita la asignación de la tienda a otro JE (eso es del Admin).
- No ve tiendas donde no está asignado.
- No ve logs globales (solo los de su tienda activa).

---

### 1.3 Caja (rol de tienda — equivalencia con `Supervisor` actual)

**Identidad:** **una** cuenta por tienda, creada automáticamente al crear la
tienda. Comparte el acceso con quien la tienda designe.

#### Autenticación
- `UC-C1`: Iniciar sesión con `username` (formato `caja-{tiendaCodigo}`) +
  `password`.
  - Si `mustChangePassword = true`, redirige a `/cambiar-password-inicial`.
- `UC-C2`: Cerrar sesión.
- `UC-C3`: **NO** puede cambiar su propia contraseña.
- `UC-C4`: Puede **solicitar reseteo** de su contraseña al JE de su tienda:
  - Botón "Olvidé mi contraseña" en el login → modal con campo opcional
    de motivo → crea `passwordResetRequests` con `estado=pendiente`.
  - Sigue en pantalla de login hasta que el JE acepte.

#### Operación de tienda (todo lo que la app hace hoy)
- `UC-C5`: **Personal** — CRUD de cajeros.
- `UC-C6`: **Horarios** — gestión semanal, pegado masivo, descansos.
- `UC-C7`: **Asignar Cajas** — ejecutar algoritmo, preview, publicar.
- `UC-C8`: **Tablero en vivo** — drag & drop, refrigerios, swaps, limpieza.
- `UC-C9`: **Funciones Secundarias** — CRUD del catálogo.
- `UC-C10`: **Planillas ES** — ver y exportar.
- `UC-C11`: **Cobertura** — ver y exportar.
- `UC-C12`: **Indicadores SIP** — registrar, importar, ver ranking, metas semanales.
- `UC-C13`: **Velocidad** — registrar valores, ver métricas.
- `UC-C14`: **Tinkas** — registrar manual, importar por OCR.
- `UC-C15`: **Tareas del área** — recurrentes, instancias, marcar completadas.
- `UC-C16`: **Evaluaciones** — crear plantillas, asignar, evaluar.
- `UC-C17`: **Inducciones** — crear, asignar, marcar recibidas.
- `UC-C18`: **Reuniones** — programar, notas.
- `UC-C19`: **Capacitaciones** — programa, turnos, seguimiento.
- `UC-C20`: **Notificaciones** — ver, marcar leídas.
- `UC-C21`: **Logs** — ver logs de su tienda.
- `UC-C22`: **Configuración** — ver datos informativos de la tienda (read-only).
  No editar nombre/dirección. No editar flags. No cambiar contraseña propia.

#### Lo que **NO** puede
- No edita nombre/dirección de la tienda.
- No edita credenciales de la cuenta de Gerencia.
- No ve otras tiendas.
- No crea JEs ni Admins.
- No desactiva su tienda.
- No ve logs globales.

---

### 1.4 Gerencia (rol de tienda — solo ver)

**Identidad:** **una** cuenta por tienda, creada automáticamente al crear la
tienda.

#### Autenticación
- `UC-G1`: Iniciar sesión con `username` (formato `gerencia-{tiendaCodigo}`) +
  `password`. Si `mustChangePassword=true`, redirige a `/cambiar-password-inicial`.
- `UC-G2`: Cerrar sesión.
- `UC-G3`: **NO** puede cambiar su propia contraseña.
- `UC-G4`: Puede **solicitar reseteo** al JE (mismo flujo que Caja, ver UC-C4).

#### Vista (solo lectura, sobre su tienda)
- `UC-G5`: **Personal** — ver.
- `UC-G6`: **Horarios** — ver, exportar.
- `UC-G7`: **Asignar Cajas** — ver el resultado publicado (no ejecutar).
- `UC-G8`: **Tablero en vivo** — ver (sin drag, sin acciones).
- `UC-G9`: **Funciones Secundarias** — ver.
- `UC-G10`: **Planillas ES** — ver, exportar.
- `UC-G11`: **Cobertura** — ver, exportar.
- `UC-G12`: **Indicadores SIP** — ver.
- `UC-G13`: **Velocidad** — ver.
- `UC-G14`: **Tinkas** — ver (no importar OCR).
- `UC-G15`: **Tareas** — ver.
- `UC-G16`: **Evaluaciones** — ver.
- `UC-G17`: **Inducciones** — ver.
- `UC-G18`: **Reuniones** — ver.
- `UC-G19`: **Capacitaciones** — ver.
- `UC-G20`: **Notificaciones** — ver y marcar leídas las propias.
- `UC-G21`: **Configuración** — ver datos informativos (read-only). No cambiar
  contraseña propia.

#### Lo que **NO** puede
- Ninguna acción de escritura en ningún módulo.
- No ve logs.
- No ve otras tiendas.
- No crea JEs ni Admins.

---

## 2. Especificación técnica de modelo de datos

> Cambios propuestos a `app/convex/schema.ts`. **No incluye implementación.**

### 2.1 Nuevos enums

```ts
// Roles de USUARIO (no cargos de personal)
const rolSistemaEnum = v.union(
  v.literal("Admin"),
  v.literal("JefeEntrenador"),
  v.literal("Cajas"),
  v.literal("Gerencia"),
);

// Cargos del PERSONAL (no roles de usuario; el personal no accede al sistema)
const cargoEnum = v.union(
  v.literal("Cajer@"),
  v.literal("Self Checkout"),
  v.literal("RS"),
  v.literal("Ecommerce"),
  v.literal("Supervisor(@)"),
  v.literal("JefeCajas"),
  v.literal("SubGerente"),
  v.literal("Gerente"),
);

// Tipo de cuenta de tienda
const tipoCuentaTiendaEnum = v.union(
  v.literal("Cajas"),
  v.literal("Gerencia"),
);

// Estado de solicitud de reseteo
const estadoSolicitudResetEnum = v.union(
  v.literal("pendiente"),
  v.literal("aceptada"),
  v.literal("rechazada"),
  v.literal("expirada"),
);

// Solicitante de un reseteo
const tipoSolicitanteEnum = v.union(
  v.literal("Cajas"),
  v.literal("Gerencia"),
);
```

**Nota:** el `rolSistemaEnum` reduce a 4 valores. Los `JefeCajas`, `SubGerente`,
`Gerente` que aparecían en `rolSistemaEnum` se **eliminan**; los que aparecen
en `cargoEnum` se **mantienen** porque son cargos legítimos del personal.

### 2.2 Tabla `admins` (nueva)

```ts
admins: defineTable({
  username: v.string(),          // único global, lowercase
  nombre: v.string(),
  apellido: v.string(),
  passwordHash: v.string(),
  activo: v.boolean(),
  // Sin mustChangePassword: el Admin define la pass al crear.
  createdAt: v.number(),
  updatedAt: v.number(),
  lastLoginAt: v.optional(v.number()),
})
  .index("by_username", ["username"])
  .index("by_activo", ["activo"]),
```

### 2.3 Tabla `jefesEntrenador` (nueva)

```ts
jefesEntrenador: defineTable({
  username: v.string(),          // único global, lowercase
  nombre: v.string(),
  apellido: v.string(),
  passwordHash: v.string(),
  mustChangePassword: v.boolean(),   // true al crear (pass = 12345678)
  activo: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastLoginAt: v.optional(v.number()),
})
  .index("by_username", ["username"])
  .index("by_activo", ["activo"]),
```

### 2.4 Tabla `tiendas` (modificada)

```ts
tiendas: defineTable({
  nombre: v.string(),
  codigo: v.string(),            // interno, base para usernames auto-generados
  direccion: v.string(),

  // Configuración de cajas (INMUTABLE post-creación)
  nCajasRegulares: v.number(),
  nCajasRapidas: v.number(),
  nCajasSelf: v.number(),

  // Flags de personal (INMUTABLE post-creación)
  tienePersonalSelf: v.boolean(),
  tienePersonalRs: v.boolean(),

  // Asignación de JE (1 tienda → 1 JE)
  jefeEntrenadorId: v.id("jefesEntrenador"),

  activa: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_activa", ["activa"])
  .index("by_codigo", ["codigo"])
  .index("by_je", ["jefeEntrenadorId"]),
```

**Decisiones:**
- **No** hay tabla puente: la relación es 1:N (1 tienda → 1 JE, 1 JE → N tiendas).
- `nCajas*`, `tienePersonal*`, `codigo`, `jefeEntrenadorId` **no** se pueden
  editar después de creado (solo Admin puede asignar JE vía drag & drop, pero
  al inicio se setea en `createTienda`).
  - Excepción: `jefeEntrenadorId` se puede reasignar por drag & drop en la
    pantalla de JEs, porque es solo cambiar de responsable, no de configuración.
    - **Aclarar con el usuario** si la reasignación de JE debe contar como
      "edición" o no. Yo propongo que sí se permita solo `jefeEntrenadorId` por
      drag & drop, y todo lo demás quede inmutable.

### 2.5 Tabla `cajas` (sin cambios estructurales)

Sigue siendo filas físicas. En `createTienda` se insertan
`nCajasRegulares + nCajasRapidas + nCajasSelf` filas en orden (1..N).

### 2.6 Tabla `users` + `userProfiles` (modificadas)

Las cuentas de tienda (Caja y Gerencia) usan el `users` de Convex Auth +
`userProfiles`. Cambios:

```ts
userProfiles: defineTable({
  userId: v.id("users"),
  tiendaId: v.id("tiendas"),
  tipoCuenta: tipoCuentaTiendaEnum,  // "Cajas" | "Gerencia"
  nombreCompleto: v.string(),
  username: v.string(),              // denormalizado para unicidad rápida
  activo: v.boolean(),
  mustChangePassword: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastLoginAt: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_tienda", ["tiendaId"])
  .index("by_tienda_tipo", ["tiendaId", "tipoCuenta"])
  .index("by_username", ["username"]),   // unicidad global
```

**Reglas:**
- **Exactamente 1 fila de `Cajas` por tienda y exactamente 1 fila de `Gerencia`
  por tienda** (constraint a nivel de mutación, no a nivel de schema).
- `users.passwordHash` se guarda en el campo `image` (mismo hack que ya usa
  el código actual, ver `app/convex/auth.ts:47`).

### 2.7 Tabla `passwordResetRequests` (nueva)

```ts
passwordResetRequests: defineTable({
  tiendaId: v.id("tiendas"),
  tipoSolicitante: tipoSolicitanteEnum,   // "Cajas" | "Gerencia"
  userProfileId: v.id("userProfiles"),   // a quién se le resetea
  usernameSnapshot: v.string(),          // snapshot por si la cuenta cambia
  motivo: v.optional(v.string()),
  estado: estadoSolicitudResetEnum,
  respondidaPorJefeEntrenadorId: v.optional(v.id("jefesEntrenador")),
  respondidaAt: v.optional(v.number()),
  motivoRechazo: v.optional(v.string()),
  // La nueva contraseña NO se guarda en claro. Se guarda hasheada
  // en userProfiles.passwordHash al aceptar. La "contraseña visible" se
  // muestra en la respuesta al JE y queda como campo de log en logs.
  passwordReseteadaHash: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_tienda_estado", ["tiendaId", "estado"])
  .index("by_userprofile", ["userProfileId"])
  .index("by_je", ["respondidaPorJefeEntrenadorId"]),
```

**Flujo:**
1. Caja/Gerencia hace clic en "Olvidé mi contraseña" en login.
2. Backend crea la solicitud con `estado=pendiente`, `motivo` opcional.
3. JE ve la solicitud en `/solicitudes-reseteo` (bandeja).
4. JE hace clic en "Aceptar":
   - Backend genera `nuevaPassword = "12345678"`, hashea, escribe en
     `userProfiles.passwordHash` (o `users.image`).
   - Setea `mustChangePassword = true` en la cuenta.
   - Marca la solicitud como `aceptada`, graba `respondidaPorJefeEntrenadorId`,
     `respondidaAt`, `passwordReseteadaHash` (solo para auditoría).
   - Registra en `logs` la acción con `despues.passwordHash` (NO mostrar la
     pass en claro en logs, solo el hash).
5. JE ve en pantalla la nueva contraseña `12345678` para darle al solicitante
   (por WhatsApp, en persona, etc.). La app no puede mostrarla directamente
   al solicitante porque se queda en login esperando.
6. Próximo intento de login del solicitante: entra con `12345678`, redirige
   a `/cambiar-password-inicial`.

### 2.8 Tabla `logs` (sin cambios)

Se mantiene como está. Se agrega un `entidad = "passwordResetRequest"` y
`entidad = "cuentaTienda"` para registrar resets manuales y automáticos.

### 2.9 Diagrama lógico resultante

```
admins                            (global, sin tienda, login con username)
  └── username + passwordHash

jefesEntrenador                   (global, sin tienda propia, login con username)
  ├── username + passwordHash + mustChangePassword
  └── (asignado a N tiendas vía FK en tiendas)

tiendas
  ├── jefeEntrenadorId ──► jefesEntrenador  (1 tienda → 1 JE)
  ├── codigo, direccion, nCajas*, tienePersonal*
  ├── activa
  ├── cajas (1..N filas, derivadas de nCajas*)
  │
  └── userProfiles (2 filas: 1 Cajas + 1 Gerencia, ambas con username y passwd)
        ├── tipoCuenta: "Cajas" | "Gerencia"
        ├── mustChangePassword
        └── (login contra users de Convex Auth)

passwordResetRequests
  ├── tiendaId ──► tiendas
  ├── userProfileId ──► userProfiles
  └── respondidaPorJefeEntrenadorId ──► jefesEntrenador
```

### 2.10 Cambios en `app/convex/auth.ts`

- `signUp` se reemplaza por mutaciones **internas / admin-only**:
  - `internalCreateAdmin({ username, nombre, apellido, password })` — solo desde otra mutation o desde el script.
  - `internalCreateJefeEntrenador({ username, nombre, apellido })` — pass `12345678` automático.
  - `internalCreateCuentaTienda({ tiendaId, tipoCuenta })` — pass `12345678` automático.
  - `internalCreateTienda({...})` — crea tienda + cajas + cuentas Caja + Gerencia en una sola transacción lógica.
- `signIn` se reescribe:
  - Input: `{ username, password }`.
  - Busca primero en `admins` por username; si match, valida hash y devuelve
    `{ kind: "admin", id }`.
  - Si no, busca en `jefesEntrenador`; si match, valida hash y devuelve
    `{ kind: "jefeEntrenador", id }`.
  - Si no, busca en `users` (Convex Auth) y luego en `userProfiles` por
    `username`; si match, valida hash y devuelve
    `{ kind: "user", id, tiendaId, tipoCuenta, mustChangePassword }`.
  - Actualiza `lastLoginAt` en la entidad correspondiente.
  - **Ya no hay signUp público**: el toggle "Crear cuenta" del login se elimina.
- `changePassword` se parametriza:
  - Input: `{ sessionKind, sessionId, currentPassword, newPassword }`.
  - Valida `currentPassword` contra el hash actual.
  - **Regla de Admin/JE:** pueden cambiar a cualquier contraseña.
  - **Regla de Caja/Gerencia:** solo permitido si `mustChangePassword = true`,
    o si vienen del flujo de cambio inicial. Tras primer cambio, se setea
    `mustChangePassword = false`. Cambios posteriores están bloqueados
    (`changePassword` lanza error "Debes solicitar un reseteo al JE").
  - Valida que `newPassword` no sea igual a `currentPassword` y no sea
    `12345678` (después del primer login).
- `resetPassword` (nueva mutation, **solo Admin o JE**):
  - `adminResetPassword({ targetKind, targetId, newPassword? })`:
    - Si `targetKind = "jefeEntrenador"`: resetea a `12345678` o a `newPassword`
      si se pasa, marca `mustChangePassword=true`, registra en `logs`.
    - Si `targetKind = "cuentaTienda"`: idem sobre `userProfiles`/`users`.
    - Si `targetKind = "admin"`: requiere `newPassword`, **no** marca
      `mustChangePassword`.
  - `jeResetPassword({ tiendaId, tipoCuenta, newPassword? })`:
    - Solo si la sesión actual es JE de esa tienda.
    - Resetea la cuenta de Caja o Gerencia de esa tienda.
  - `jeAtenderSolicitudReset({ solicitudId, accion: "aceptar"|"rechazar", motivoRechazo? })`:
    - Si acepta: resetea la cuenta vinculada, marca solicitud como `aceptada`,
      devuelve al JE la nueva contraseña `12345678` (en la respuesta, una
      sola vez) para que se la dé al solicitante.
    - Si rechaza: marca como `rechazada`, guarda `motivoRechazo`.
- `createSolicitudReset` (nueva mutation, **pública para usuarios autenticados
  como Caja/Gerencia**):
  - Input: `{ motivo? }`.
  - Crea fila en `passwordResetRequests` con `estado=pendiente`.

### 2.11 Cambios en `app/src/hooks/useAuth.ts`

- `localStorage` almacena un objeto:
  ```ts
  type Session =
    | { kind: "admin"; id: Id<"admins"> }
    | { kind: "jefeEntrenador"; id: Id<"jefesEntrenador">; tiendaActivaId?: Id<"tiendas"> }
    | { kind: "user"; id: Id<"users">; tiendaId: Id<"tiendas">; tipoCuenta: "Cajas" | "Gerencia"; mustChangePassword: boolean };
  ```
- `useSession()` reemplaza a `useCurrentUser()`.
- `useTiendaActiva()` devuelve:
  - Para `kind="user"`: su `tiendaId` fijo.
  - Para `kind="jefeEntrenador"`: el `tiendaActivaId` del storage o la primera
    tienda asignada.
  - Para `kind="admin"`: `null` (debe elegir antes de operar).
- `useCurrentUser` se puede mantener como wrapper que devuelve la unión.

### 2.12 Cambios en `app/src/app/(dashboard)/layout.tsx`

- Lee la sesión.
- Redirige a `/login` si no hay sesión.
- Redirige a `/cambiar-password-inicial` si `mustChangePassword = true` y la
  ruta no es esa.
- Redirige a `/seleccionar-tienda` si la sesión es Admin o JE y no hay tienda
  activa.
- Pasa la sesión al Sidebar y al contexto.

### 2.13 Cambios en `app/src/components/Sidebar.tsx`

- Recibe `session` y filtra entradas + acciones según rol.
- Selector de tienda visible para Admin y JE.
- Banner "Operando como Admin sobre {Tienda}" cuando aplica.
- Entradas adicionales según rol:
  - **JE:** "Gestión de cuentas", "Solicitudes de reseteo" (badge con count).
  - **Admin:** secciones "Administración" (Tiendas, JEs, Admins, Logs globales)
    + las 16 operativas según tienda seleccionada.
  - **Caja / Gerencia:** sidebar actual (con la salvedad de Gerencia que
    desactiva acciones de edición).

### 2.14 Pantallas nuevas

- `/login` — sin signUp público. Botón "Olvidé mi contraseña" para Caja/Gerencia.
- `/cambiar-password-inicial` — para cualquier cuenta con `mustChangePassword=true`.
- `/seleccionar-tienda` — selector para Admin y JE.
- `/admin/tiendas` — CRUD Admin.
- `/admin/tiendas/[id]` — detalle de tienda.
- `/admin/jefes-entrenador` — lista con drag & drop de tiendas a JEs.
- `/admin/jefes-entrenador/[id]` — detalle de JE.
- `/admin/admins` — CRUD Admin.
- `/admin/logs` — logs globales.
- `/cuenta-tienda/[tiendaId]` — para JE: ver y resetear cuentas de Caja/Gerencia.
- `/solicitudes-reseteo` — para JE: bandeja de solicitudes.
- `/solicitar-reseteo` — para Caja/Gerencia: formulario de solicitud (también
  accesible desde el botón en login).

### 2.15 Helpers de gating

```ts
// _helpers.ts
requireAdmin(ctx)
requireJefeEntrenador(ctx, tiendaId)        // JE asignado a esa tienda, o Admin
requireCaja(ctx, tiendaId)                  // cuenta Caja de esa tienda, o Admin/JE
requireViewerOrAbove(ctx, tiendaId)         // cualquiera de los 4 con acceso a esa tienda
requireReadOnly(ctx, tiendaId)              // Gerencia, o Caja, o JE, o Admin
```

Estos helpers **sí** validan en backend (a diferencia de la versión actual que
es no-op). Se aplican a las mutaciones existentes de las 24 tablas.

### 2.16 Gating en frontend

Helper `can(session, action, entity, tiendaId?)` que centraliza las reglas.
La tabla de permisos está en la sección 3.

### 2.17 Migración de seed (ajustada)

`scripts/seed-week.ts` (reescrito) hace:

1. Crea Admin:
   - username: `admin`
   - password: `Admin2026`
   - (sin `mustChangePassword`)
2. Crea tienda default con:
   - `nombre = "Plaza Vea"`, `codigo = "PLAZAVEA-DEFAULT"`, `direccion = "..."`.
   - `nCajasRegulares = 18`, `nCajasRapidas = 6`, `nCajasSelf = 6`.
   - `tienePersonalSelf = true`, `tienePersonalRs = true`.
   - `jefeEntrenadorId`: el del paso 3.
3. Crea JE:
   - username: `gtorres`
   - password: `12345678` con `mustChangePassword = true`.
   - nombre: `Gustavo`, apellido: `Torres` (o lo que defina el seed).
4. Crea 30 cajas (18 regulares, 6 rápidas, 6 self) según `nCajas*`.
5. Crea cuenta de **Caja**:
   - username: `caja-plazavea-default`
   - password: `12345678`, `mustChangePassword = true`.
   - **Esta es la cuenta que migra a Gustavo Torres.** Su `nombreCompleto` se
     setea a "Caja - Plaza Vea" (no es Gustavo, es la cuenta compartida de la
     tienda). (Decisión: la cuenta Caja no se vincula a un `personales`; es
     la "sesión del área de caja de la tienda".)
6. Crea cuenta de **Gerencia**:
   - username: `gerencia-plazavea-default`
   - password: `12345678`, `mustChangePassword = true`.
7. Carga `personal.txt` en `personales` con los cargos antiguos `JefeCajas`,
   `SubGerente`, `Gerente` (siguen siendo cargos válidos).
8. Imprime en consola:
   ```
   Cuentas creadas:
   - admin / Admin2026 (Admin)
   - gtorres / 12345678 (JefeEntrenador, requiere cambio)
   - caja-plazavea-default / 12345678 (Caja, requiere cambio)
   - gerencia-plazavea-default / 12345678 (Gerencia, requiere cambio)
   ```

> **Nota sobre Gustavo:** el seed **no** vincula a Gustavo Torres a una cuenta
> de usuario. Gustavo es un `personales` más (con su cargo original). Si
> después se quiere que él use la app, debe loguearse con la cuenta Caja o
> pedir al Admin que le cree un JE / Admin. **Confirmar con el usuario** si
> la interpretación es esa o si Gustavo debe ser JE / Admin explícitamente.

---

## 3. Matriz de permisos CRUD por rol × entidad

Leyenda: ✅ permitido, ❌ no permitido, 👁 solo ver, ✏️ editar/crear, 🗑 eliminar.

### 3.1 Tiendas

| Acción                          | Admin | JE (en su tienda) | Caja | Gerencia |
|----------------------------------|:-----:|:-----------------:|:----:|:--------:|
| Listar todas                     | ✅    | solo asignadas    | solo la suya | solo la suya |
| Crear                            | ✅    | ❌                | ❌   | ❌       |
| Editar `nombre` / `direccion`    | ✏️    | ✏️                | ❌   | ❌       |
| Editar `nCajas*` / `TienePersonal*` / `codigo` | ❌ (inmutable post-creación) | ❌ | ❌ | ❌ |
| Reasignar `jefeEntrenadorId`     | ✏️ (drag & drop) | ❌            | ❌   | ❌       |
| Activar / Desactivar             | ✏️    | ❌                | ❌   | ❌       |
| Ver detalle                      | 👁    | 👁                | 👁   | 👁       |

### 3.2 Cuentas Admin / JE / Caja / Gerencia

| Acción                                  | Admin | JE (en su tienda) | Caja | Gerencia |
|------------------------------------------|:-----:|:-----------------:|:----:|:--------:|
| Crear Admin                             | ✅    | ❌                | ❌   | ❌       |
| Crear JE                                | ✅    | ❌                | ❌   | ❌       |
| Crear cuenta Caja/Gerencia               | ❌ (auto al crear tienda) | ❌ | ❌ | ❌ |
| Listar JEs                              | ✅    | solo los suyos    | ❌   | ❌       |
| Cambiar **su propia** contraseña        | ✏️    | ✏️                | ❌   | ❌       |
| Resetear passwd de Admin                | ✅ (no a sí mismo) | ❌        | ❌   | ❌       |
| Resetear passwd de JE                   | ✅    | ❌                | ❌   | ❌       |
| Resetear passwd de Caja/Gerencia        | ✅    | ✏️                | ❌   | ❌       |
| Activar/Desactivar JE                   | ✅    | ❌                | ❌   | ❌       |
| Activar/Desactivar Caja/Gerencia        | ✅    | ✏️                | ❌   | ❌       |
| Solicitar reseteo al JE                 | ❌    | ❌                | ✏️   | ✏️       |
| Atender solicitud de reseteo            | ❌    | ✅                | ❌   | ❌       |

### 3.3 Operación de tienda (sobre `tiendaId` que el rol puede ver)

| Entidad / acción     | Admin (sobre tienda select) | JE (en su tienda) | Caja (en su tienda) | Gerencia |
|----------------------|:---------------------------:|:-----------------:|:-------------------:|:--------:|
| Personal — ver       | 👁                          | 👁                | 👁                  | 👁       |
| Personal — CRUD      | ✏️                          | ✏️                | ✏️                  | ❌       |
| Horarios — ver       | 👁                          | 👁                | 👁                  | 👁       |
| Horarios — editar    | ✏️                          | ✏️                | ✏️                  | ❌       |
| Cajas (catálogo)     | 👁 (read)                   | ✏️                | ✏️                  | 👁       |
| Asignar Cajas (alg.) | ✏️                          | ✏️                | ✏️                  | ❌       |
| Tablero en vivo      | ✏️                          | ✏️                | ✏️                  | 👁       |
| Funciones Secund.    | ✏️                          | ✏️                | ✏️                  | 👁       |
| Planillas ES         | 👁 + export                 | 👁 + export       | 👁 + export         | 👁 + export |
| Cobertura            | 👁 + export                 | 👁 + export       | 👁 + export         | 👁 + export |
| Indicadores SIP      | ✏️                          | ✏️                | ✏️                  | 👁       |
| Velocidad            | ✏️                          | ✏️                | ✏️                  | 👁       |
| Tinkas               | ✏️                          | ✏️                | ✏️                  | 👁       |
| Tareas               | ✏️                          | ✏️                | ✏️                  | 👁       |
| Evaluaciones         | ✏️                          | ✏️                | ✏️                  | 👁       |
| Inducciones          | ✏️                          | ✏️                | ✏️                  | 👁       |
| Reuniones            | ✏️                          | ✏️                | ✏️                  | 👁       |
| Capacitaciones       | ✏️                          | ✏️                | ✏️                  | 👁       |
| Notificaciones       | 👁 + marcar leídas          | 👁 + marcar leídas| 👁 + marcar leídas  | 👁 + marcar leídas |
| Logs (de la tienda)  | 👁                          | 👁                | 👁                  | ❌       |
| Logs globales        | 👁                          | ❌                | ❌                  | ❌       |
| Config. — ver datos  | 👁                          | 👁                | 👁                  | 👁       |

### 3.4 Capacidad de selección de tienda

| Rol          | Selector visible | Default                          |
|--------------|:----------------:|----------------------------------|
| Admin        | sí               | ninguna (obligatorio elegir)     |
| JE           | sí               | primera tienda asignada o última |
| Caja         | no               | su tienda fija                   |
| Gerencia     | no               | su tienda fija                   |

---

## 4. Plan de implementación por fases (alto nivel)

> Solo plan; no a ejecutar hasta que confirmes.

1. **Fase 0 — Confirmación de detalles abiertos** (ver sección 5).
2. **Fase 1 — Schema**: nuevos enums, tablas `admins`, `jefesEntrenador`,
   `passwordResetRequests`; cambios a `tiendas`, `userProfiles`. `cargoEnum`
   intacto.
3. **Fase 2 — Backend auth**: `signIn` unificado, mutaciones internas de
   creación, `changePassword` con reglas, `resetPassword` + `createSolicitudReset`
   + `atenderSolicitudReset`. Helpers `requireAdmin` /
   `requireJefeEntrenador` / `requireCaja` / `requireViewerOrAbove` /
   `requireReadOnly` aplicados a las 24 mutaciones existentes.
4. **Fase 3 — Frontend auth**: refactor de `useAuth` → `useSession`,
   `useTiendaActiva`, layout `(dashboard)`, Sidebar con gating, pantalla
   `/cambiar-password-inicial`, `/seleccionar-tienda`.
5. **Fase 4 — UI Admin**: `/admin/tiendas`, `/admin/jefes-entrenador` (drag &
   drop de tienda ↔ JE), `/admin/admins`, `/admin/logs`. Modificación de
   `Configuracion` para Admin.
6. **Fase 5 — UI JE**: `/cuenta-tienda`, `/solicitudes-reseteo`, selector de
   tienda en header, gestión de credenciales.
7. **Fase 6 — Flujo Caja/Gerencia**: login sin signUp, botón "Olvidé mi
   contraseña" → `/solicitar-reseteo`, modo read-only de Gerencia en las 16
   páginas.
8. **Fase 7 — Migración de datos**: script que toma la BD actual y la lleva al
   nuevo modelo. Idempotente.
9. **Fase 8 — Seed actualizado**: reescritura de `seed-week.ts` con las
   credenciales de la sección 2.17.
10. **Fase 9 — Documentación**: actualizar `DB_STRUCTURE.md` y `README.md`.

---

## 5. Detalles abiertos para confirmar antes de Fase 1

1. **Reasignación de `jefeEntrenadorId` por drag & drop**: ¿es la única
   "edición" permitida post-creación, o también debería ser inmutable
   (y borrar/crear tienda si se quiere cambiar de JE)?

2. **Gustavo Torres**: la cuenta `caja-plazavea-default` (creada en seed) **no**
   está vinculada a Gustavo como `personales`. ¿Eso está bien o quieres que
   la cuenta de Caja sepa "esta sesión la está usando Gustavo hoy" (campo
   `currentUserPersonalId` en `userProfiles`)? Mi propuesta: **no**, la cuenta
   Caja es compartida sin identidad personal. Si quieres identidad personal,
   lo agregamos en otra fase.

3. **Nueva contraseña al aceptar solicitud de reseteo**: ¿se devuelve siempre
   `12345678` (consistente con primer login) o se genera aleatoria de 12+ chars
   (más segura)? Mi propuesta: `12345678` para consistencia, aunque random es
   más seguro. ¿Confirmas `12345678`?

4. **Username para Admin**: ¿puede tener mayúsculas / espacios / caracteres
   especiales al crearse, o se fuerza lowercase + alfanumérico + guiones?
   Mi propuesta: lowercase, alfanumérico y `_`, sin espacios, 3-32 chars.
   ¿OK?

5. **Borrado de tienda**: propuesto como **no permitido** desde la UI (solo
   desactivar). Borrar es destructivo. ¿Confirmas?

6. **Logs al resetear contraseña**: el log guardará `accion: "resetearPassword"`,
   `entidad: "cuentaTienda" | "jefeEntrenador" | "admin"`, y en `despues`
   guardará el `passwordHash` resultante. **Nunca** la contraseña en claro
   en logs. ¿OK?

7. **Solicitudes de reseteo "huérfanas"** (Caja/Gerencia desactivada o tienda
   desactivada): ¿qué pasa con solicitudes pendientes? Mi propuesta: se
   mantienen en `pendiente` pero el JE no las ve si la cuenta está desactivada.
   ¿OK?

8. **Desactivar un JE que aún tiene tiendas**: bloqueado. ¿O permitimos
   desactivar y las tiendas quedan sin JE (solo Admin las ve)? Mi propuesta:
   **bloqueado**, Admin debe reasignar primero.

9. **Borrado de un Admin**: ¿permitido? Mi propuesta: **no**, solo desactivar.

10. **Pantalla `/solicitar-reseteo` para Caja/Gerencia**: ¿puede hacerse desde
    un usuario ya logueado (caso: "me equivoqué y la cuenta tiene pass rara")
    o solo desde el login? Mi propuesta: **desde el login únicamente** (botón
    "Olvidé mi contraseña" lleva a un formulario minimalista). Para Caja/Gerencia
    logueados no hay forma de cambiar la pass; si quieren cambiarla, hacen
    signOut y solicitan desde el login.

---

## 6. Fuera de scope

- OAuth / 2FA.
- Cierre de sesión por inactividad.
- Auditoría de lecturas.
- Notificaciones push / email.
- Multi-idioma.
- Vinculación de cuentas de usuario con `personales` (la cuenta Caja es
  compartida, no tiene un cajero "dueño").

---

## 7. Próximo paso

Confirmar (o ajustar) los 10 detalles abiertos de la sección 5. Con eso,
arranco con la Fase 1 (cambios al schema en `app/convex/schema.ts`).
