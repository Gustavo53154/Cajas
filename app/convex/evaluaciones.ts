import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./auditoria";

// ============================
// PLANTILLAS
// ============================
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

export const listPlantillas = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("plantillasEvaluacion")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
  },
});

export const createPlantilla = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    nombre: v.string(),
    tipoNota: tipoNotaEnum,
    campos: v.array(
      v.object({
        label: v.string(),
        tipo: tipoNotaEnum,
        peso: v.number(),
      }),
    ),
    recurrencia: recurrenciaEnum,
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const id = await ctx.db.insert("plantillasEvaluacion", {
      tiendaId: args.tiendaId,
      nombre: args.nombre,
      tipoNota: args.tipoNota,
      campos: args.campos,
      recurrencia: args.recurrencia,
      activa: true,
      createdAt: Date.now(),
    });
    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "plantillasEvaluacion",
      entidadId: id,
      despues: { nombre: args.nombre },
    });
    return id;
  },
});

export const updatePlantilla = mutation({
  args: {
    id: v.id("plantillasEvaluacion"),
    nombre: v.optional(v.string()),
    campos: v.optional(
      v.array(
        v.object({
          label: v.string(),
          tipo: tipoNotaEnum,
          peso: v.number(),
        }),
      ),
    ),
    activa: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { id, ...rest } = args;
    const before = await ctx.db.get(id);
    if (!before) throw new Error("Plantilla no encontrada");
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) updates[k] = v;
    }
    await ctx.db.patch(id, updates);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "plantillasEvaluacion",
      entidadId: id,
      antes: before,
      despues: { ...before, ...updates },
    });
  },
});

// ============================
// EVALUACIONES
// ============================
export const getEvaluacionesFecha = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("evaluaciones")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fechaProgramada", args.fecha),
      )
      .collect();
  },
});

export const getEvaluacionesPersonal = query({
  args: { personalId: v.id("personales") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("evaluaciones")
      .withIndex("by_personal", (q) => q.eq("personalId", args.personalId))
      .order("desc")
      .collect();
  },
});

export const upsertEvaluacion = mutation({
  args: {
    plantillaId: v.id("plantillasEvaluacion"),
    fechaProgramada: v.string(),
    personalId: v.id("personales"),
    valores: v.array(
      v.object({
        label: v.string(),
        valor: v.union(v.number(), v.boolean()),
        peso: v.number(),
      }),
    ),
    notaFinal: v.number(),
    fechaRealizada: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireUserProfile(ctx);
    const existing = await ctx.db
      .query("evaluaciones")
      .withIndex("by_personal", (q) => q.eq("personalId", args.personalId))
      .filter((q) =>
        q.and(
          q.eq(q.field("plantillaId"), args.plantillaId),
          q.eq(q.field("fechaProgramada"), args.fechaProgramada),
        ),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        valores: args.valores,
        notaFinal: args.notaFinal,
        fechaRealizada: args.fechaRealizada,
        observaciones: args.observaciones,
      });
      return existing._id;
    }
    return await ctx.db.insert("evaluaciones", {
      tiendaId: profile.tiendaId,
      plantillaId: args.plantillaId,
      fechaProgramada: args.fechaProgramada,
      personalId: args.personalId,
      valores: args.valores,
      notaFinal: args.notaFinal,
      fechaRealizada: args.fechaRealizada,
      observaciones: args.observaciones,
    });
  },
});
