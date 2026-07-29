import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Cargos del personal (NO son roles de usuario; el personal no accede al sistema)
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

// Tipo de cuenta de tienda (Caja o Gerencia)
const tipoCuentaTiendaEnum = v.union(
  v.literal("Cajas"),
  v.literal("Gerencia"),
);

// Estado de solicitud de reseteo de contraseña
const estadoSolicitudResetEnum = v.union(
  v.literal("pendiente"),
  v.literal("aceptada"),
  v.literal("rechazada"),
  v.literal("expirada"),
);

const tipoCajaEnum = v.union(
  v.literal("regular"),
  v.literal("rapida"),
  v.literal("autoservicio"),
);

const tipoNotaEnum = v.union(
  v.literal("0-20"),
  v.literal("0-100"),
  v.literal("bool"),
);

const recurrenciaEnum = v.union(
  v.literal("diaria"),
  v.literal("15dias"),
  v.literal("unica"),
);

const estadoTareaEnum = v.union(
  v.literal("pendiente"),
  v.literal("en_curso"),
  v.literal("completada"),
  v.literal("vencida"),
);

const estadoSemanaEnum = v.union(
  v.literal("borrador"),
  v.literal("publicada"),
);

const estadoAsignacionEnum = v.union(
  v.literal("activa"),
  v.literal("refrigerio"),
  v.literal("inasistencia"),
  v.literal("finalizada"),
);

const tipoCapacitacionEnum = v.union(
  v.literal("induccion"),
  v.literal("reunion"),
);

const estadoCapacitacionEnum = v.union(
  v.literal("programada"),
  v.literal("en_curso"),
  v.literal("completada"),
  v.literal("vencida"),
  v.literal("cancelada"),
);

const patronTareaEnum = v.union(
  v.literal("diaria"),
  v.literal("laborables"),
  v.literal("finde"),
  v.literal("personalizada"),
);

const diaSemanaEnum = v.union(
  v.literal("lun"),
  v.literal("mar"),
  v.literal("mie"),
  v.literal("jue"),
  v.literal("vie"),
  v.literal("sab"),
  v.literal("dom"),
);

const modoAsignacionTareaEnum = v.union(
  v.literal("manual"),
  v.literal("rotativa"),
  v.literal("compartida"),
);

export default defineSchema({
  ...authTables,
  // ===== Núcleo multi-tienda (escalable) =====
  tiendas: defineTable({
    nombre: v.string(),
    codigo: v.string(),
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

  // ===== Admins (usuarios globales) =====
  admins: defineTable({
    username: v.string(),          // único global, lowercase
    nombre: v.string(),
    apellido: v.string(),
    passwordHash: v.string(),
    activo: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_username", ["username"])
    .index("by_activo", ["activo"]),

  // ===== JefesEntrenador (usuarios globales) =====
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

  // ===== Solicitudes de reseteo de contraseña (Caja/Gerencia → JE) =====
  passwordResetRequests: defineTable({
    tiendaId: v.id("tiendas"),
    tipoSolicitante: tipoCuentaTiendaEnum,
    userProfileId: v.id("userProfiles"),
    usernameSnapshot: v.string(),
    motivo: v.optional(v.string()),
    estado: estadoSolicitudResetEnum,
    respondidaPorJefeEntrenadorId: v.optional(v.id("jefesEntrenador")),
    respondidaAt: v.optional(v.number()),
    motivoRechazo: v.optional(v.string()),
    passwordReseteadaHash: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_tienda_estado", ["tiendaId", "estado"])
    .index("by_userprofile", ["userProfileId"])
    .index("by_je", ["respondidaPorJefeEntrenadorId"]),

  // ===== Cuentas de tienda (Caja y Gerencia) =====
  // Usuarios (auth) - manejados por convex-auth en tabla `users`
  // Tabla adicional para extender users con info de la app
  userProfiles: defineTable({
    userId: v.id("users"),
    tiendaId: v.id("tiendas"),
    tipoCuenta: tipoCuentaTiendaEnum,
    nombreCompleto: v.string(),
    username: v.string(),          // denormalizado para unicidad global rápida
    activo: v.boolean(),
    mustChangePassword: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_tienda", ["tiendaId"])
    .index("by_tienda_tipo", ["tiendaId", "tipoCuenta"])
    .index("by_username", ["username"]),

  // ===== Personal (cajeros) =====
  personales: defineTable({
    tiendaId: v.id("tiendas"),
    apellidos: v.string(),
    nombres: v.string(),
    nick: v.string(), // cómo quiere que le llamen
    cargo: cargoEnum,
    codigoEmpleado: v.optional(v.string()),
    codigoOperadorCaja: v.optional(v.string()),
    supervisorId: v.optional(v.id("personales")), // supervisor a cargo
    soloCajaRapida: v.boolean(), // antes "inhabilitado"
    esAsistenteAutoservicio: v.boolean(),
    autoServicioPreferencial: v.optional(v.boolean()),
    activo: v.boolean(),
    orden: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tienda", ["tiendaId"])
    .index("by_tienda_activo", ["tiendaId", "activo"])
    .index("by_tienda_cargo", ["tiendaId", "cargo"])
    .index("by_supervisor", ["supervisorId"]),

  // ===== Semanas y horarios =====
  semanas: defineTable({
    tiendaId: v.id("tiendas"),
    fechaInicio: v.string(), // YYYY-MM-DD (lunes)
    fechaFin: v.string(),
    estado: estadoSemanaEnum,
    createdAt: v.number(),
  })
    .index("by_tienda", ["tiendaId"])
    .index("by_tienda_inicio", ["tiendaId", "fechaInicio"]),

  horarios: defineTable({
    tiendaId: v.id("tiendas"),
    semanaId: v.id("semanas"),
    personalId: v.id("personales"),
    dia: v.number(), // 1=lunes ... 7=domingo
    entrada: v.optional(v.string()), // "HH:MM" o null si descanso
    salida: v.optional(v.string()),
    descanso: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tienda", ["tiendaId"])
    .index("by_semana_personal", ["semanaId", "personalId"])
    .index("by_semana_dia", ["semanaId", "dia"])
    .index("by_personal", ["personalId"]),

  // ===== Indicadores SIP =====
  metasSemanales: defineTable({
    tiendaId: v.id("tiendas"),
    semanaId: v.id("semanas"),
    debitoPct: v.number(),
    totalPct: v.number(),
  })
    .index("by_semana", ["semanaId"])
    .index("by_tienda", ["tiendaId"]),

  participacionesSIP: defineTable({
    tiendaId: v.id("tiendas"),
    fecha: v.string(), // YYYY-MM-DD
    personalId: v.id("personales"),
    debitoPct: v.number(),
    totalPct: v.number(),
    // credito = total - debito (calculado)
    createdAt: v.number(),
  })
    .index("by_tienda_fecha", ["tiendaId", "fecha"])
    .index("by_personal_fecha", ["personalId", "fecha"]),

  // ===== Velocidad =====
  velocidades: defineTable({
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    personalId: v.id("personales"),
    valor: v.number(),
    meta: v.optional(v.number()),
  })
    .index("by_tienda_fecha", ["tiendaId", "fecha"])
    .index("by_personal_fecha", ["personalId", "fecha"]),

  // ===== Tinkas =====
  tinkas: defineTable({
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    personalId: v.id("personales"),
    cantidad: v.number(), // entero
  })
    .index("by_tienda_fecha", ["tiendaId", "fecha"])
    .index("by_personal_fecha", ["personalId", "fecha"]),

  // ===== Evaluaciones =====
  plantillasEvaluacion: defineTable({
    tiendaId: v.id("tiendas"),
    nombre: v.string(),
    tipoNota: tipoNotaEnum,
    campos: v.array(
      v.object({
        label: v.string(),
        tipo: tipoNotaEnum,
        peso: v.number(),
      })
    ),
    recurrencia: recurrenciaEnum,
    obligatoria: v.boolean(),
    asignadosModo: v.union(
      v.literal("todos"),
      v.literal("cargo"),
      v.literal("personales"),
    ),
    asignadosCargo: v.optional(cargoEnum),
    asignadosIds: v.optional(v.array(v.id("personales"))),
    activa: v.boolean(),
    createdAt: v.number(),
  }).index("by_tienda", ["tiendaId"]),

  evaluaciones: defineTable({
    tiendaId: v.id("tiendas"),
    plantillaId: v.id("plantillasEvaluacion"),
    fechaProgramada: v.string(),
    personalId: v.id("personales"),
    valores: v.array(
      v.object({
        label: v.string(),
        valor: v.union(v.number(), v.boolean()),
        peso: v.number(),
      })
    ),
    notaFinal: v.number(),
    fechaRealizada: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  })
    .index("by_tienda_fecha", ["tiendaId", "fechaProgramada"])
    .index("by_plantilla", ["plantillaId"])
    .index("by_personal", ["personalId"]),

  // ===== Inducciones =====
  inducciones: defineTable({
    tiendaId: v.id("tiendas"),
    tema: v.string(),
    descripcion: v.string(),
    fechaProgramada: v.string(),
    fechaFin: v.optional(v.string()),
    dias: v.array(v.string()),
    plazo: v.optional(v.string()),
    asistenciales: v.array(
      v.object({
        personalId: v.id("personales"),
        fechaRecibido: v.optional(v.string()),
        nota: v.optional(v.string()),
      })
    ),
    modoAsignacion: v.union(
      v.literal("manual"),
      v.literal("cargo"),
      v.literal("todos")
    ),
    cargos: v.optional(
      v.array(
        v.union(
          v.literal("Cajer@"),
          v.literal("Self Checkout"),
          v.literal("RS"),
          v.literal("Ecommerce")
        )
      )
    ),
    personalIds: v.array(v.id("personales")),
    estado: v.union(
      v.literal("programada"),
      v.literal("en_curso"),
      v.literal("completada"),
      v.literal("vencida"),
      v.literal("cancelada")
    ),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_tienda", ["tiendaId"])
    .index("by_tienda_fecha", ["tiendaId", "fechaProgramada"])
    .index("by_tienda_estado", ["tiendaId", "estado"]),

  // ===== Reuniones =====
  reuniones: defineTable({
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    hora: v.string(),
    duracionMin: v.number(),
    motivo: v.string(),
    personalIds: v.array(v.id("personales")),
    notas: v.optional(v.string()),
    paraTodaArea: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_tienda_fecha", ["tiendaId", "fecha"])
    .index("by_tienda", ["tiendaId"]),

  // ===== Tareas del área =====
  tareasRecurrentes: defineTable({
    tiendaId: v.id("tiendas"),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    horaSugerida: v.optional(v.string()),
    activa: v.boolean(),
    // Frecuencia
    patron: patronTareaEnum,
    diasSemana: v.optional(v.array(diaSemanaEnum)),
    // Asignación
    modoAsignacion: modoAsignacionTareaEnum,
    poolIds: v.optional(v.array(v.id("personales"))),
    asignadosFijosIds: v.optional(v.array(v.id("personales"))),
    rotativoIndice: v.optional(v.number()),
    rotativoSentido: v.optional(
      v.union(v.literal("secuencial"), v.literal("aleatorio"))
    ),
    ultimaMaterializacion: v.optional(v.string()),
    skippedDates: v.optional(v.array(v.string())),
  })
    .index("by_tienda", ["tiendaId"])
    .index("by_tienda_activa", ["tiendaId", "activa"]),

  tareasInstancia: defineTable({
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    plazo: v.optional(v.string()),
    recurrenteId: v.optional(v.id("tareasRecurrentes")),
    asignadosIds: v.array(v.id("personales")),
    completadosIds: v.array(v.id("personales")),
    responsableId: v.optional(v.id("personales")),
    colaboradoresIds: v.array(v.id("personales")),
    parentInstanciaId: v.optional(v.id("tareasInstancia")),
    estado: estadoTareaEnum,
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_tienda_fecha", ["tiendaId", "fecha"])
    .index("by_tienda_estado", ["tiendaId", "estado"])
    .index("by_tienda_fecha_responsable", ["tiendaId", "fecha", "responsableId"]),

  // ===== Capacitaciones (inducciones + reuniones fusionadas) =====
  capacitaciones: defineTable({
    tiendaId: v.id("tiendas"),
    tema: v.string(),
    descripcion: v.optional(v.string()),
    tipo: v.optional(tipoCapacitacionEnum),
    motivo: v.optional(v.string()),
    fechaInicio: v.string(),
    fechaFin: v.string(),
    turnos: v.array(
      v.object({
        id: v.string(),
        fecha: v.string(),
        hora: v.string(),
        duracionMin: v.number(),
      })
    ),
    personalIds: v.array(v.id("personales")),
    estado: estadoCapacitacionEnum,
    notas: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_tienda_fecha", ["tiendaId", "fechaInicio"]),

  capacitacionAsignaciones: defineTable({
    capacitacionId: v.id("capacitaciones"),
    personalId: v.id("personales"),
    turnoId: v.optional(v.string()),
    fechaRecibido: v.optional(v.string()),
    nota: v.optional(v.string()),
  })
    .index("by_capacitacion", ["capacitacionId"])
    .index("by_personal", ["personalId"]),

  // ===== Cajas y asignaciones =====
  cajas: defineTable({
    tiendaId: v.id("tiendas"),
    codigo: v.number(), // 1..30
    tipo: tipoCajaEnum,
    preferencial: v.boolean(),
  })
    .index("by_tienda", ["tiendaId"])
    .index("by_tienda_codigo", ["tiendaId", "codigo"]),

  funcionesSecundarias: defineTable({
    tiendaId: v.id("tiendas"),
    nombre: v.string(),
    color: v.string(),
  }).index("by_tienda", ["tiendaId"]),

  // ===== Asignación de cajas / tareas =====
  // cajaId es opcional: una asignación puede ser solo de tarea (sin caja)
  // o de caja (con o sin tarea secundaria)
  asignacionesCaja: defineTable({
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    cajaId: v.optional(v.id("cajas")),
    personalId: v.id("personales"),
    horaInicio: v.string(),
    horaFin: v.string(),
    bloque: v.number(), // orden de cascada en la caja
    funcionSecundaria: v.optional(v.id("funcionesSecundarias")),
    observaciones: v.optional(v.string()),
    estado: estadoAsignacionEnum,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tienda_fecha", ["tiendaId", "fecha"])
    .index("by_tienda_fecha_caja", ["tiendaId", "fecha", "cajaId"])
    .index("by_personal_fecha", ["personalId", "fecha"]),

  logAlgoritmoCajas: defineTable({
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    personalId: v.id("personales"),
    cajaId: v.optional(v.id("cajas")),
    decision: v.string(),
    detalle: v.string(),
    createdAt: v.number(),
  })
    .index("by_tienda_fecha", ["tiendaId", "fecha"])
    .index("by_personal", ["personalId"]),

  // ===== Notificaciones =====
  notificaciones: defineTable({
    tiendaId: v.id("tiendas"),
    usuarioId: v.id("users"),
    tipo: v.string(),
    titulo: v.string(),
    mensaje: v.string(),
    link: v.optional(v.string()),
    leida: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_usuario", ["usuarioId"])
    .index("by_usuario_leida", ["usuarioId", "leida"])
    .index("by_tienda", ["tiendaId"]),

  // ===== Logs =====
  logs: defineTable({
    tiendaId: v.id("tiendas"),
    usuarioId: v.optional(v.id("users")),
    usuarioNombre: v.string(),
    accion: v.string(), // crear, actualizar, eliminar
    entidad: v.string(),
    entidadId: v.string(),
    antes: v.optional(v.any()),
    despues: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_tienda", ["tiendaId"])
    .index("by_tienda_entidad", ["tiendaId", "entidad"])
    .index("by_tienda_fecha", ["tiendaId", "createdAt"])
    .index("by_usuario", ["usuarioId"]),
});
