import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./auditoria";

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

export const createInduccion = mutation({
  args: {
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
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserProfile(ctx);
    const id = await ctx.db.insert("inducciones", {
      tiendaId: args.tiendaId,
      tema: args.tema,
      descripcion: args.descripcion,
      fechaProgramada: args.fechaProgramada,
      plazo: args.plazo,
      asistenciales: args.asistenciales,
      createdBy: user._id,
      createdAt: Date.now(),
    });
    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "inducciones",
      entidadId: id,
      despues: { tema: args.tema },
    });
    return id;
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
    const nuevosAsist = induccion.asistenciales.map((a) =>
      a.personalId === args.personalId
        ? {
            ...a,
            fechaRecibido: new Date().toISOString().slice(0, 10),
            nota: args.nota ?? a.nota,
          }
        : a,
    );
    await ctx.db.patch(args.induccionId, { asistenciales: nuevosAsist });
    await audit(ctx, {
      tiendaId: induccion.tiendaId,
      accion: "actualizar",
      entidad: "inducciones",
      entidadId: args.induccionId,
      despues: { personalId: args.personalId, recibido: true },
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
