import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./auditoria";

// ============================
// TAREAS RECURRENTES (plantillas)
// ============================
export const listRecurrentes = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("tareasRecurrentes")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
  },
});

export const createRecurrente = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    horaSugerida: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.insert("tareasRecurrentes", {
      tiendaId: args.tiendaId,
      titulo: args.titulo,
      descripcion: args.descripcion,
      horaSugerida: args.horaSugerida,
      activa: true,
    });
  },
});

export const updateRecurrente = mutation({
  args: {
    id: v.id("tareasRecurrentes"),
    titulo: v.optional(v.string()),
    descripcion: v.optional(v.string()),
    horaSugerida: v.optional(v.string()),
    activa: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { id, ...rest } = args;
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) updates[k] = v;
    }
    await ctx.db.patch(id, updates);
  },
});

export const deleteRecurrente = mutation({
  args: { id: v.id("tareasRecurrentes") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.delete(args.id);
  },
});

// Generar instancias del día desde recurrentes (idempotente)
export const generarInstanciasDelDia = mutation({
  args: { tiendaId: v.id("tiendas"), fecha: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const recurrentes = await ctx.db
      .query("tareasRecurrentes")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .filter((q) => q.eq(q.field("activa"), true))
      .collect();
    const existentes = await ctx.db
      .query("tareasInstancia")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
    const existentesRecurrentes = new Set(
      existentes.filter((e) => e.recurrenteId).map((e) => e.recurrenteId!),
    );
    let creadas = 0;
    for (const r of recurrentes) {
      if (existentesRecurrentes.has(r._id)) continue;
      await ctx.db.insert("tareasInstancia", {
        tiendaId: args.tiendaId,
        fecha: args.fecha,
        titulo: r.titulo,
        descripcion: r.descripcion,
        plazo: r.horaSugerida,
        recurrenteId: r._id,
        asignadosIds: [],
        completadosIds: [],
        estado: "pendiente",
        createdBy: "users" as any, // sistema
        createdAt: Date.now(),
      });
      creadas++;
    }
    return creadas;
  },
});

// ============================
// TAREAS INSTANCIA
// ============================
export const listInstancias = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("tareasInstancia")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

export const createInstancia = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    plazo: v.optional(v.string()),
    asignadosIds: v.array(v.id("personales")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserProfile(ctx);
    return await ctx.db.insert("tareasInstancia", {
      tiendaId: args.tiendaId,
      fecha: args.fecha,
      titulo: args.titulo,
      descripcion: args.descripcion,
      plazo: args.plazo,
      asignadosIds: args.asignadosIds,
      completadosIds: [],
      estado: "pendiente",
      createdBy: user._id,
      createdAt: Date.now(),
    });
  },
});

export const toggleCompletada = mutation({
  args: {
    tareaId: v.id("tareasInstancia"),
    personalId: v.id("personales"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const tarea = await ctx.db.get(args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");
    const ya = tarea.completadosIds.includes(args.personalId);
    const nuevos = ya
      ? tarea.completadosIds.filter((id) => id !== args.personalId)
      : [...tarea.completadosIds, args.personalId];
    // Estado: si todos los asignados están en completados -> completada; si ninguno -> pendiente; si algunos -> en_curso
    let estado: "pendiente" | "en_curso" | "completada" = "pendiente";
    if (nuevos.length === tarea.asignadosIds.length && tarea.asignadosIds.length > 0) {
      estado = "completada";
    } else if (nuevos.length > 0) {
      estado = "en_curso";
    }
    await ctx.db.patch(args.tareaId, {
      completadosIds: nuevos,
      estado,
    });
  },
});

export const updateAsignados = mutation({
  args: {
    tareaId: v.id("tareasInstancia"),
    asignadosIds: v.array(v.id("personales")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const tarea = await ctx.db.get(args.tareaId);
    if (!tarea) throw new Error("No encontrada");
    await ctx.db.patch(args.tareaId, { asignadosIds: args.asignadosIds });
  },
});

export const deleteInstancia = mutation({
  args: { id: v.id("tareasInstancia") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.delete(args.id);
  },
});
