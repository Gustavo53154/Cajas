import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Tabla auxiliar: roles permitidos
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

const rolSistemaEnum = v.union(
  v.literal("Admin"),
  v.literal("JefeCajas"),
  v.literal("Supervisor"),
  v.literal("SubGerente"),
  v.literal("Gerente"),
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

export default defineSchema({
  ...authTables,
  // ===== Núcleo multi-tienda (escalable) =====
  tiendas: defineTable({
    nombre: v.string(),
    codigo: v.string(),
    activa: v.boolean(),
  }),

  // Usuarios (auth) - manejados por convex-auth en tabla `users`
  // Tabla adicional para extender users con info de la app
  userProfiles: defineTable({
    userId: v.id("users"),
    tiendaId: v.id("tiendas"),
    nombreCompleto: v.string(),
    rol: rolSistemaEnum,
    personalId: v.optional(v.id("personales")),
  }).index("by_user", ["userId"]).index("by_tienda", ["tiendaId"]),

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
    plazo: v.optional(v.string()),
    asistenciales: v.array(
      v.object({
        personalId: v.id("personales"),
        fechaRecibido: v.optional(v.string()),
        nota: v.optional(v.string()),
      })
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_tienda", ["tiendaId"])
    .index("by_tienda_fecha", ["tiendaId", "fechaProgramada"]),

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
  }).index("by_tienda", ["tiendaId"]),

  tareasInstancia: defineTable({
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    plazo: v.optional(v.string()),
    recurrenteId: v.optional(v.id("tareasRecurrentes")),
    asignadosIds: v.array(v.id("personales")),
    completadosIds: v.array(v.id("personales")),
    estado: estadoTareaEnum,
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_tienda_fecha", ["tiendaId", "fecha"])
    .index("by_tienda_estado", ["tiendaId", "estado"]),

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

  // ===== Auditoría =====
  auditoria: defineTable({
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
