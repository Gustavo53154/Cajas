import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./auditoria";

// ============================
// METAS SEMANALES
// ============================
export const setMeta = mutation({
  args: {
    semanaId: v.id("semanas"),
    debitoPct: v.number(),
    totalPct: v.number(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const semana = await ctx.db.get(args.semanaId);
    if (!semana) throw new Error("Semana no encontrada");
    const existing = await ctx.db
      .query("metasSemanales")
      .withIndex("by_semana", (q) => q.eq("semanaId", args.semanaId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        debitoPct: args.debitoPct,
        totalPct: args.totalPct,
      });
      return existing._id;
    }
    return await ctx.db.insert("metasSemanales", {
      tiendaId: semana.tiendaId,
      semanaId: args.semanaId,
      debitoPct: args.debitoPct,
      totalPct: args.totalPct,
    });
  },
});

export const getMeta = query({
  args: { semanaId: v.id("semanas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("metasSemanales")
      .withIndex("by_semana", (q) => q.eq("semanaId", args.semanaId))
      .first();
  },
});

// ============================
// PARTICIPACIONES SIP
// ============================
export const setParticipacion = mutation({
  args: {
    fecha: v.string(),
    personalId: v.id("personales"),
    debitoPct: v.number(),
    totalPct: v.number(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireUserProfile(ctx);
    const existing = await ctx.db
      .query("participacionesSIP")
      .withIndex("by_personal_fecha", (q) =>
        q.eq("personalId", args.personalId).eq("fecha", args.fecha),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        debitoPct: args.debitoPct,
        totalPct: args.totalPct,
      });
      return existing._id;
    }
    return await ctx.db.insert("participacionesSIP", {
      tiendaId: profile.tiendaId,
      fecha: args.fecha,
      personalId: args.personalId,
      debitoPct: args.debitoPct,
      totalPct: args.totalPct,
      createdAt: Date.now(),
    });
  },
});

export const getParticipaciones = query({
  args: {
    fecha: v.string(),
    tiendaId: v.id("tiendas"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("participacionesSIP")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

export const getParticipacionesRango = query({
  args: {
    fechaInicio: v.string(),
    fechaFin: v.string(),
    tiendaId: v.id("tiendas"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("participacionesSIP")
      .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    return all.filter(
      (p) => p.fecha >= args.fechaInicio && p.fecha <= args.fechaFin,
    );
  },
});

// ============================
// VELOCIDAD
// ============================
export const setVelocidad = mutation({
  args: {
    fecha: v.string(),
    personalId: v.id("personales"),
    valor: v.number(),
    meta: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireUserProfile(ctx);
    const existing = await ctx.db
      .query("velocidades")
      .withIndex("by_personal_fecha", (q) =>
        q.eq("personalId", args.personalId).eq("fecha", args.fecha),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        valor: args.valor,
        meta: args.meta,
      });
      return existing._id;
    }
    return await ctx.db.insert("velocidades", {
      tiendaId: profile.tiendaId,
      fecha: args.fecha,
      personalId: args.personalId,
      valor: args.valor,
      meta: args.meta,
    });
  },
});

export const getVelocidades = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("velocidades")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

// ============================
// TINKAS
// ============================
export const setTinka = mutation({
  args: {
    fecha: v.string(),
    personalId: v.id("personales"),
    cantidad: v.number(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireUserProfile(ctx);
    const cant = Math.max(0, Math.floor(args.cantidad));
    const existing = await ctx.db
      .query("tinkas")
      .withIndex("by_personal_fecha", (q) =>
        q.eq("personalId", args.personalId).eq("fecha", args.fecha),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { cantidad: cant });
      return existing._id;
    }
    return await ctx.db.insert("tinkas", {
      tiendaId: profile.tiendaId,
      fecha: args.fecha,
      personalId: args.personalId,
      cantidad: cant,
    });
  },
});

export const getTinkas = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("tinkas")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

export const getTinkasRango = query({
  args: {
    fechaInicio: v.string(),
    fechaFin: v.string(),
    tiendaId: v.id("tiendas"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("tinkas")
      .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    return all.filter(
      (t) => t.fecha >= args.fechaInicio && t.fecha <= args.fechaFin,
    );
  },
});
