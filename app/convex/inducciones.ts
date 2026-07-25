import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./logs";
import { Id } from "./_generated/dataModel";

const cargoCajaEnum = v.union(
  v.literal("Cajer@"),
  v.literal("Self Checkout"),
  v.literal("RS"),
  v.literal("Ecommerce")
);

// ============================
// QUERIES
// ============================

export const listInducciones = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("inducciones")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .order("desc")
      .collect();
  },
});

export const getInduccion = query({
  args: { id: v.id("inducciones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.get(args.id);
  },
});

// Query de seguimiento: devuelve por cada induccion activa la lista de personal
// con su estado (recibido / pendiente) y la fecha de la induccion.
export const getSeguimiento = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const inducciones = await ctx.db
      .query("inducciones")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    const hoy = new Date().toISOString().slice(0, 10);
    return inducciones
      .filter((i) => i.estado !== "cancelada")
      .map((i) => {
        const total = i.personalIds.length;
        const recibidos = i.asistenciales.filter((a) => a.fechaRecibido).length;
        const pendientes = i.personalIds
          .filter(
            (pid) => !i.asistenciales.find((a) => a.personalId === pid && a.fechaRecibido)
          );
        return {
          _id: i._id,
          tema: i.tema,
          dias: i.dias,
          fechaProgramada: i.fechaProgramada,
          fechaFin: i.fechaFin,
          plazo: i.plazo,
          estado: i.estado,
          total,
          recibidos,
          pendientes: pendientes.length,
          porcentaje: total > 0 ? Math.round((recibidos / total) * 100) : 0,
          vencido: i.estado !== "completada" && i.plazo ? i.plazo < hoy : false,
        };
      })
      .sort((a, b) => {
        // Pendientes primero, luego por fecha
        if (a.pendientes > 0 && b.pendientes === 0) return -1;
        if (a.pendientes === 0 && b.pendientes > 0) return 1;
        return a.fechaProgramada.localeCompare(b.fechaProgramada);
      });
  },
});

// Query de seguimiento por persona: para una persona, qué inducciones le faltan.
export const getSeguimientoPorPersonal = query({
  args: { tiendaId: v.id("tiendas"), personalId: v.id("personales") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("inducciones")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    return all
      .filter(
        (i) =>
          i.estado !== "cancelada" &&
          i.personalIds.includes(args.personalId) &&
          !i.asistenciales.find(
            (a) => a.personalId === args.personalId && a.fechaRecibido
          )
      )
      .map((i) => ({
        _id: i._id,
        tema: i.tema,
        dias: i.dias,
        fechaProgramada: i.fechaProgramada,
        plazo: i.plazo,
        estado: i.estado,
      }));
  },
});

// ============================
// MUTATIONS
// ============================

async function regenerarEstadoInduccion(
  ctx: any,
  induccionId: Id<"inducciones">
) {
  const ind = await ctx.db.get(induccionId);
  if (!ind) return;
  if (ind.estado === "cancelada" || ind.estado === "vencida") return;
  const total = ind.personalIds.length;
  if (total === 0) return;
  const recibidos = ind.asistenciales.filter((a: any) => a.fechaRecibido).length;
  if (recibidos === total) {
    await ctx.db.patch(induccionId, { estado: "completada" });
  } else if (recibidos > 0) {
    await ctx.db.patch(induccionId, { estado: "en_curso" });
  } else {
    await ctx.db.patch(induccionId, { estado: "programada" });
  }
}

export const createInduccion = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    tema: v.string(),
    descripcion: v.string(),
    fechaProgramada: v.string(),
    fechaFin: v.optional(v.string()),
    dias: v.array(v.string()),
    plazo: v.optional(v.string()),
    modoAsignacion: v.union(
      v.literal("manual"),
      v.literal("cargo"),
      v.literal("todos")
    ),
    cargos: v.optional(v.array(cargoCajaEnum)),
    personalIds: v.optional(v.array(v.id("personales"))),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserProfile(ctx);
    if (args.dias.length === 0) {
      throw new Error("Selecciona al menos un día para realizar la inducción.");
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
      throw new Error("No hay personal seleccionado para la inducción.");
    }

    const id = await ctx.db.insert("inducciones", {
      tiendaId: args.tiendaId,
      tema: args.tema,
      descripcion: args.descripcion,
      fechaProgramada: args.fechaProgramada,
      fechaFin: args.fechaFin,
      dias: args.dias,
      plazo: args.plazo,
      asistenciales: personalIds.map((pid) => ({ personalId: pid })),
      modoAsignacion: args.modoAsignacion,
      cargos: args.cargos,
      personalIds,
      estado: "programada",
      createdBy: user?._id,
      createdAt: Date.now(),
    });
    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "inducciones",
      entidadId: id,
      despues: {
        tema: args.tema,
        dias: args.dias.length,
        personal: personalIds.length,
      },
    });
    return id;
  },
});

export const updateInduccion = mutation({
  args: {
    id: v.id("inducciones"),
    tema: v.optional(v.string()),
    descripcion: v.optional(v.string()),
    fechaProgramada: v.optional(v.string()),
    fechaFin: v.optional(v.string()),
    dias: v.optional(v.array(v.string())),
    plazo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("No encontrada");
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(args)) {
      if (k === "id") continue;
      if (v !== undefined) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) return;
    await ctx.db.patch(args.id, updates);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "inducciones",
      entidadId: args.id,
      antes: before,
      despues: { ...before, ...updates },
    });
  },
});

export const marcarRecibido = mutation({
  args: {
    induccionId: v.id("inducciones"),
    personalId: v.id("personales"),
    nota: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const induccion = await ctx.db.get(args.induccionId);
    if (!induccion) throw new Error("Inducción no encontrada");
    const yaExiste = induccion.asistenciales.find(
      (a) => a.personalId === args.personalId
    );
    const nuevosAsist = yaExiste
      ? induccion.asistenciales.map((a) =>
          a.personalId === args.personalId
            ? {
                ...a,
                fechaRecibido: new Date().toISOString().slice(0, 10),
                nota: args.nota ?? a.nota,
              }
            : a
        )
      : [
          ...induccion.asistenciales,
          {
            personalId: args.personalId,
            fechaRecibido: new Date().toISOString().slice(0, 10),
            nota: args.nota,
          },
        ];
    await ctx.db.patch(args.induccionId, { asistenciales: nuevosAsist });
    await regenerarEstadoInduccion(ctx, args.induccionId);
    await audit(ctx, {
      tiendaId: induccion.tiendaId,
      accion: "actualizar",
      entidad: "inducciones",
      entidadId: args.induccionId,
      despues: { personalId: args.personalId, recibido: true },
    });
  },
});

export const desmarcarRecibido = mutation({
  args: {
    induccionId: v.id("inducciones"),
    personalId: v.id("personales"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const induccion = await ctx.db.get(args.induccionId);
    if (!induccion) return;
    const nuevosAsist = induccion.asistenciales.map((a) =>
      a.personalId === args.personalId
        ? { ...a, fechaRecibido: undefined }
        : a
    );
    await ctx.db.patch(args.induccionId, { asistenciales: nuevosAsist });
    await regenerarEstadoInduccion(ctx, args.induccionId);
  },
});

export const cancelInduccion = mutation({
  args: { id: v.id("inducciones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("No encontrada");
    await ctx.db.patch(args.id, { estado: "cancelada" });
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "inducciones",
      entidadId: args.id,
      antes: { estado: before.estado },
      despues: { estado: "cancelada" },
    });
  },
});

export const deleteInduccion = mutation({
  args: { id: v.id("inducciones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("No encontrada");
    await ctx.db.delete(args.id);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "eliminar",
      entidad: "inducciones",
      entidadId: args.id,
      antes: before,
    });
  },
});
