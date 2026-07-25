import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./_helpers";
import { audit } from "./logs";

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

const asignadosModoEnum = v.union(
  v.literal("todos"),
  v.literal("cargo"),
  v.literal("personales"),
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
    obligatoria: v.optional(v.boolean()),
    asignadosModo: v.optional(asignadosModoEnum),
    asignadosCargo: v.optional(cargoEnum),
    asignadosIds: v.optional(v.array(v.id("personales"))),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const id = await ctx.db.insert("plantillasEvaluacion", {
      tiendaId: args.tiendaId,
      nombre: args.nombre,
      tipoNota: args.tipoNota,
      campos: args.campos,
      recurrencia: args.recurrencia,
      obligatoria: args.obligatoria ?? false,
      asignadosModo: args.asignadosModo ?? "todos",
      asignadosCargo: args.asignadosCargo,
      asignadosIds: args.asignadosIds,
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
    obligatoria: v.optional(v.boolean()),
    asignadosModo: v.optional(asignadosModoEnum),
    asignadosCargo: v.optional(cargoEnum),
    asignadosIds: v.optional(v.array(v.id("personales"))),
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

export const removePlantilla = mutation({
  args: { id: v.id("plantillasEvaluacion") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Plantilla no encontrada");
    const evaluaciones = await ctx.db
      .query("evaluaciones")
      .withIndex("by_plantilla", (q) => q.eq("plantillaId", args.id))
      .collect();
    for (const e of evaluaciones) await ctx.db.delete(e._id);
    await ctx.db.delete(args.id);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "eliminar",
      entidad: "plantillasEvaluacion",
      entidadId: args.id,
      antes: before,
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

export const getEvaluacionesByPlantilla = query({
  args: { plantillaId: v.id("plantillasEvaluacion") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("evaluaciones")
      .withIndex("by_plantilla", (q) => q.eq("plantillaId", args.plantillaId))
      .collect();
    return all.sort((a, b) => (a.fechaProgramada < b.fechaProgramada ? 1 : -1));
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
    const plantilla = await ctx.db.get(args.plantillaId);
    if (!plantilla) throw new Error("Plantilla no encontrada");
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
      tiendaId: plantilla.tiendaId,
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

// ============================
// CUMPLIMIENTO (para plantillas obligatorias)
// ============================
export const getCumplimiento = query({
  args: {
    plantillaId: v.id("plantillasEvaluacion"),
    fecha: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const plantilla = await ctx.db.get(args.plantillaId);
    if (!plantilla) throw new Error("Plantilla no encontrada");
    if (!plantilla.obligatoria) return null;

    const personales = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", plantilla.tiendaId))
      .collect();

    let esperados: typeof personales = [];
    if (plantilla.asignadosModo === "todos") {
      esperados = personales.filter((p) => p.activo);
    } else if (plantilla.asignadosModo === "cargo" && plantilla.asignadosCargo) {
      esperados = personales.filter(
        (p) => p.activo && p.cargo === plantilla.asignadosCargo,
      );
    } else if (plantilla.asignadosModo === "personales" && plantilla.asignadosIds) {
      const setIds = new Set(plantilla.asignadosIds);
      esperados = personales.filter((p) => p.activo && setIds.has(p._id));
    }
    esperados.sort((a, b) => a.orden - b.orden);

    const evaluaciones = await ctx.db
      .query("evaluaciones")
      .withIndex("by_plantilla", (q) => q.eq("plantillaId", args.plantillaId))
      .collect();

    let enPeriodo = evaluaciones;
    if (plantilla.recurrencia === "15dias") {
      const yyyy = args.fecha.slice(0, 4);
      const mm = args.fecha.slice(5, 7);
      const dia = parseInt(args.fecha.slice(8, 10), 10);
      const desde = `${yyyy}-${mm}-${dia <= 15 ? "01" : "16"}`;
      const ultimoDia = new Date(parseInt(yyyy, 10), parseInt(mm, 10), 0).getDate();
      const hasta = `${yyyy}-${mm}-${dia <= 15 ? "15" : String(ultimoDia).padStart(2, "0")}`;
      enPeriodo = evaluaciones.filter(
        (e) => e.fechaProgramada >= desde && e.fechaProgramada <= hasta,
      );
    } else {
      enPeriodo = evaluaciones.filter((e) => e.fechaProgramada === args.fecha);
    }

    const porPersonal = new Map(enPeriodo.map((e) => [e.personalId, e]));

    const detalle = esperados.map((p) => {
      const ev = porPersonal.get(p._id);
      return {
        personalId: p._id,
        apellidos: p.apellidos,
        nombres: p.nombres,
        nick: p.nick,
        cargo: p.cargo,
        estado: ev ? ("hecho" as const) : ("pendiente" as const),
        notaFinal: ev?.notaFinal,
        fechaRealizada: ev?.fechaRealizada,
        observaciones: ev?.observaciones,
        evaluacionId: ev?._id,
      };
    });

    const total = detalle.length;
    const hechos = detalle.filter((d) => d.estado === "hecho").length;
    return {
      plantilla: {
        _id: plantilla._id,
        nombre: plantilla.nombre,
        asignadosModo: plantilla.asignadosModo,
        asignadosCargo: plantilla.asignadosCargo,
      },
      fecha: args.fecha,
      total,
      hechos,
      pendientes: total - hechos,
      detalle,
    };
  },
});
