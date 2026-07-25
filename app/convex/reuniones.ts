import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./logs";

export const listReuniones = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("reuniones")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .order("desc")
      .collect();
  },
});

export const listReunionesFecha = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("reuniones")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

export const createReunion = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    hora: v.string(),
    duracionMin: v.number(),
    motivo: v.string(),
    personalIds: v.array(v.id("personales")),
    notas: v.optional(v.string()),
    paraTodaArea: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserProfile(ctx);
    // Si paraTodaArea, expandir a todos los personales activos
    let personalIds = args.personalIds;
    if (args.paraTodaArea) {
      const todos = await ctx.db
        .query("personales")
        .withIndex("by_tienda_activo", (q) =>
          q.eq("tiendaId", args.tiendaId).eq("activo", true),
        )
        .collect();
      personalIds = todos.map((p) => p._id);
    }
    const id = await ctx.db.insert("reuniones", {
      tiendaId: args.tiendaId,
      fecha: args.fecha,
      hora: args.hora,
      duracionMin: args.duracionMin,
      motivo: args.motivo,
      personalIds,
      notas: args.notas,
      paraTodaArea: args.paraTodaArea,
      createdBy: user._id,
      createdAt: Date.now(),
    });
    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "reuniones",
      entidadId: id,
      despues: { fecha: args.fecha, motivo: args.motivo },
    });
    return id;
  },
});

export const updateNotas = mutation({
  args: { id: v.id("reuniones"), notas: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("No encontrada");
    await ctx.db.patch(args.id, { notas: args.notas });
  },
});

export const deleteReunion = mutation({
  args: { id: v.id("reuniones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("No encontrada");
    await ctx.db.delete(args.id);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "eliminar",
      entidad: "reuniones",
      entidadId: args.id,
      antes: before,
    });
  },
});
