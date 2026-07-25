import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./logs";
import { Id } from "./_generated/dataModel";

const cargoEnum = v.union(
  v.literal("Cajer@"),
  v.literal("Self Checkout"),
  v.literal("RS"),
  v.literal("Ecommerce"),
);

const turnoValidator = v.object({
  id: v.string(),
  fecha: v.string(),
  hora: v.string(),
  duracionMin: v.number(),
});

// ============================
// QUERIES
// ============================

export const listByTienda = query({
  args: {
    tiendaId: v.id("tiendas"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    tipo: v.optional(v.union(v.literal("induccion"), v.literal("reunion"))),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    let q = ctx.db
      .query("capacitaciones")
      .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", args.tiendaId));

    const all = await q.order("desc").collect();
    let filtered = all;
    if (args.from) filtered = filtered.filter((c) => c.fechaFin >= args.from!);
    if (args.to) filtered = filtered.filter((c) => c.fechaInicio <= args.to!);
    if (args.tipo) filtered = filtered.filter((c) => c.tipo === args.tipo);
    return filtered;
  },
});

export const getCapacitacion = query({
  args: { id: v.id("capacitaciones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.get(args.id);
  },
});

export const listAsignaciones = query({
  args: { capacitacionId: v.id("capacitaciones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("capacitacionAsignaciones")
      .withIndex("by_capacitacion", (q) =>
        q.eq("capacitacionId", args.capacitacionId)
      )
      .collect();
  },
});

// Resumen de seguimiento por tienda: una fila por capacitación con conteos
export const getResumenSeguimiento = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const caps = await ctx.db
      .query("capacitaciones")
      .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    const out: any[] = [];
    for (const c of caps) {
      if (c.estado === "cancelada") continue;
      const asigs = await ctx.db
        .query("capacitacionAsignaciones")
        .withIndex("by_capacitacion", (q) =>
          q.eq("capacitacionId", c._id)
        )
        .collect();
      const total = asigs.length;
      const recibidos = asigs.filter((a) => a.fechaRecibido).length;
      const sinTurno = asigs.filter((a) => !a.turnoId).length;
      out.push({
        _id: c._id,
        tema: c.tema,
        tipo: c.tipo,
        turnos: c.turnos,
        fechaInicio: c.fechaInicio,
        fechaFin: c.fechaFin,
        estado: c.estado,
        total,
        recibidos,
        pendientes: total - recibidos,
        sinTurno,
        porcentaje: total > 0 ? Math.round((recibidos / total) * 100) : 0,
      });
    }
    // Orden: pendientes primero, luego por fecha
    out.sort((a, b) => {
      if (a.pendientes > 0 && b.pendientes === 0) return -1;
      if (a.pendientes === 0 && b.pendientes > 0) return 1;
      return a.fechaInicio.localeCompare(b.fechaInicio);
    });
    return out;
  },
});

export const countHoy = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const hoy = new Date().toISOString().slice(0, 10);
    const all = await ctx.db
      .query("capacitaciones")
      .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    return all.filter(
      (c) =>
        c.estado !== "cancelada" &&
        c.turnos.some((t) => t.fecha === hoy)
    ).length;
  },
});

// ============================
// MUTATIONS
// ============================

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

export const createCapacitacion = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    tema: v.string(),
    descripcion: v.optional(v.string()),
    tipo: v.optional(v.union(v.literal("induccion"), v.literal("reunion"))),
    motivo: v.optional(v.string()),
    fechaInicio: v.string(),
    fechaFin: v.string(),
    turnos: v.array(turnoValidator),
    modoAsignacion: v.union(
      v.literal("manual"),
      v.literal("cargo"),
      v.literal("todos")
    ),
    cargos: v.optional(v.array(cargoEnum)),
    personalIds: v.optional(v.array(v.id("personales"))),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserProfile(ctx);

    // Validaciones
    const diff = daysBetween(args.fechaInicio, args.fechaFin);
    if (diff < 0 || diff > 1) {
      throw new Error(
        "La capacitación no puede durar más de 2 días. fechaFin debe ser igual o un día después de fechaInicio."
      );
    }
    if (args.turnos.length < 1) {
      throw new Error("Debe haber al menos 1 turno.");
    }
    for (const t of args.turnos) {
      if (t.fecha < args.fechaInicio || t.fecha > args.fechaFin) {
        throw new Error(
          `El turno ${t.id} tiene fecha ${t.fecha} fuera del rango ${args.fechaInicio}..${args.fechaFin}`
        );
      }
    }

    // Expandir personalIds según modo
    let personalIds: Id<"personales">[] = args.personalIds ?? [];
    if (args.modoAsignacion === "todos") {
      const all = await ctx.db
        .query("personales")
        .withIndex("by_tienda_activo", (q) =>
          q.eq("tiendaId", args.tiendaId).eq("activo", true)
        )
        .collect();
      personalIds = all.map((p) => p._id);
    } else if (args.modoAsignacion === "cargo") {
      if (!args.cargos || args.cargos.length === 0) {
        throw new Error("Selecciona al menos un cargo.");
      }
      const all = await ctx.db
        .query("personales")
        .withIndex("by_tienda_activo", (q) =>
          q.eq("tiendaId", args.tiendaId).eq("activo", true)
        )
        .collect();
      personalIds = all
        .filter((p) => args.cargos!.includes(p.cargo as any))
        .map((p) => p._id);
    }

    if (personalIds.length === 0) {
      throw new Error("No hay personal seleccionado para la capacitación.");
    }

    const id = await ctx.db.insert("capacitaciones", {
      tiendaId: args.tiendaId,
      tema: args.tema,
      descripcion: args.descripcion,
      tipo: args.tipo,
      motivo: args.motivo,
      fechaInicio: args.fechaInicio,
      fechaFin: args.fechaFin,
      turnos: args.turnos,
      personalIds,
      estado: "programada",
      createdBy: user?._id,
      createdAt: Date.now(),
    });

    // Crear asignaciones vacías (turnoId = null) para todos
    for (const personalId of personalIds) {
      await ctx.db.insert("capacitacionAsignaciones", {
        capacitacionId: id,
        personalId,
      });
    }

    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "capacitaciones",
      entidadId: id,
      despues: {
        tema: args.tema,
        tipo: args.tipo,
        turnos: args.turnos.length,
        personalIds: personalIds.length,
      },
    });

    return id;
  },
});

export const updateTurnos = mutation({
  args: {
    id: v.id("capacitaciones"),
    turnos: v.array(turnoValidator),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (args.turnos.length < 1) {
      throw new Error("Debe haber al menos 1 turno.");
    }
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Capacitación no encontrada");
    for (const t of args.turnos) {
      if (t.fecha < before.fechaInicio || t.fecha > before.fechaFin) {
        throw new Error(`Turno fuera de rango: ${t.fecha}`);
      }
    }
    await ctx.db.patch(args.id, { turnos: args.turnos });
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "capacitaciones",
      entidadId: args.id,
      antes: { turnos: before.turnos },
      despues: { turnos: args.turnos },
    });
  },
});

export const asignarTurno = mutation({
  args: {
    capacitacionId: v.id("capacitaciones"),
    personalId: v.id("personales"),
    turnoId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const cap = await ctx.db.get(args.capacitacionId);
    if (!cap) throw new Error("Capacitación no encontrada");
    if (!cap.turnos.some((t) => t.id === args.turnoId)) {
      throw new Error("Turno no válido");
    }
    const asig = await ctx.db
      .query("capacitacionAsignaciones")
      .withIndex("by_capacitacion", (q) =>
        q.eq("capacitacionId", args.capacitacionId)
      )
      .filter((q) => q.eq(q.field("personalId"), args.personalId))
      .first();
    if (!asig) throw new Error("Asignación no encontrada");
    await ctx.db.patch(asig._id, { turnoId: args.turnoId });
  },
});

export const bulkAsignarTurno = mutation({
  args: {
    capacitacionId: v.id("capacitaciones"),
    items: v.array(
      v.object({
        personalId: v.id("personales"),
        turnoId: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const cap = await ctx.db.get(args.capacitacionId);
    if (!cap) throw new Error("Capacitación no encontrada");
    const turnoIds = new Set(cap.turnos.map((t) => t.id));
    for (const it of args.items) {
      if (!turnoIds.has(it.turnoId)) continue;
      const asig = await ctx.db
        .query("capacitacionAsignaciones")
        .withIndex("by_capacitacion", (q) =>
          q.eq("capacitacionId", args.capacitacionId)
        )
        .filter((q) => q.eq(q.field("personalId"), it.personalId))
        .first();
      if (asig) await ctx.db.patch(asig._id, { turnoId: it.turnoId });
    }
  },
});

export const desasignarTurno = mutation({
  args: {
    capacitacionId: v.id("capacitaciones"),
    personalId: v.id("personales"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const asig = await ctx.db
      .query("capacitacionAsignaciones")
      .withIndex("by_capacitacion", (q) =>
        q.eq("capacitacionId", args.capacitacionId)
      )
      .filter((q) => q.eq(q.field("personalId"), args.personalId))
      .first();
    if (!asig) return;
    await ctx.db.patch(asig._id, { turnoId: undefined });
  },
});

export const marcarRecibido = mutation({
  args: {
    capacitacionId: v.id("capacitaciones"),
    personalId: v.id("personales"),
    nota: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const asig = await ctx.db
      .query("capacitacionAsignaciones")
      .withIndex("by_capacitacion", (q) =>
        q.eq("capacitacionId", args.capacitacionId)
      )
      .filter((q) => q.eq(q.field("personalId"), args.personalId))
      .first();
    if (!asig) throw new Error("Asignación no encontrada");
    await ctx.db.patch(asig._id, {
      fechaRecibido: new Date().toISOString().slice(0, 10),
      nota: args.nota,
    });
    // Regenerar estado
    await regenerarEstadoInterno(ctx, args.capacitacionId);
  },
});

export const desmarcarRecibido = mutation({
  args: {
    capacitacionId: v.id("capacitaciones"),
    personalId: v.id("personales"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const asig = await ctx.db
      .query("capacitacionAsignaciones")
      .withIndex("by_capacitacion", (q) =>
        q.eq("capacitacionId", args.capacitacionId)
      )
      .filter((q) => q.eq(q.field("personalId"), args.personalId))
      .first();
    if (!asig) return;
    await ctx.db.patch(asig._id, { fechaRecibido: undefined });
    await regenerarEstadoInterno(ctx, args.capacitacionId);
  },
});

async function regenerarEstadoInterno(
  ctx: any,
  capacitacionId: Id<"capacitaciones">
) {
  const cap = await ctx.db.get(capacitacionId);
  if (!cap) return;
  if (cap.estado === "cancelada" || cap.estado === "vencida") return;
  const asigs = await ctx.db
    .query("capacitacionAsignaciones")
    .withIndex("by_capacitacion", (q) =>
      q.eq("capacitacionId", capacitacionId)
    )
    .collect();
  if (asigs.length === 0) return;
  const recibidos = asigs.filter((a: any) => a.fechaRecibido).length;
  if (recibidos === asigs.length) {
    await ctx.db.patch(capacitacionId, { estado: "completada" });
  } else if (recibidos > 0) {
    await ctx.db.patch(capacitacionId, { estado: "en_curso" });
  } else {
    await ctx.db.patch(capacitacionId, { estado: "programada" });
  }
}

export const regenerarEstado = mutation({
  args: { id: v.id("capacitaciones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await regenerarEstadoInterno(ctx, args.id);
  },
});

export const updateNotas = mutation({
  args: {
    id: v.id("capacitaciones"),
    notas: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Capacitación no encontrada");
    await ctx.db.patch(args.id, { notas: args.notas });
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "capacitaciones",
      entidadId: args.id,
      antes: { notas: before.notas },
      despues: { notas: args.notas },
    });
  },
});

export const cancelCapacitacion = mutation({
  args: { id: v.id("capacitaciones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("No encontrada");
    await ctx.db.patch(args.id, { estado: "cancelada" });
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "capacitaciones",
      entidadId: args.id,
      antes: { estado: before.estado },
      despues: { estado: "cancelada" },
    });
  },
});

export const deleteCapacitacion = mutation({
  args: { id: v.id("capacitaciones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) return;
    const asigs = await ctx.db
      .query("capacitacionAsignaciones")
      .withIndex("by_capacitacion", (q) =>
        q.eq("capacitacionId", args.id)
      )
      .collect();
    for (const a of asigs) await ctx.db.delete(a._id);
    await ctx.db.delete(args.id);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "eliminar",
      entidad: "capacitaciones",
      entidadId: args.id,
      antes: before,
    });
  },
});
