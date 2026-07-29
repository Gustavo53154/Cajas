// Bandeja de solicitudes de reseteo (queries; mutaciones en auth.ts)
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireSession } from "./_helpers";

export const listForJE = query({
  args: {
    sessionJefeEntrenadorId: v.id("jefesEntrenador"),
    tiendaId: v.optional(v.id("tiendas")),
    estado: v.optional(
      v.union(
        v.literal("pendiente"),
        v.literal("aceptada"),
        v.literal("rechazada"),
        v.literal("expirada"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, { kind: "jefeEntrenador", id: args.sessionJefeEntrenadorId });
    const je = await ctx.db.get(args.sessionJefeEntrenadorId);
    if (!je) return [];
    const tiendasAsignadas = await ctx.db
      .query("tiendas")
      .withIndex("by_je", (q) => q.eq("jefeEntrenadorId", je._id))
      .collect();
    const tiendaIds = new Set(tiendasAsignadas.map((t) => t._id));
    let q = ctx.db.query("passwordResetRequests");
    const all = await q.collect();
    return all.filter((s) => {
      if (!tiendaIds.has(s.tiendaId)) return false;
      if (args.tiendaId && s.tiendaId !== args.tiendaId) return false;
      if (args.estado && s.estado !== args.estado) return false;
      return true;
    });
  },
});

export const countPendientesForJE = query({
  args: { sessionJefeEntrenadorId: v.id("jefesEntrenador") },
  handler: async (ctx, args) => {
    await requireSession(ctx, { kind: "jefeEntrenador", id: args.sessionJefeEntrenadorId });
    const je = await ctx.db.get(args.sessionJefeEntrenadorId);
    if (!je) return 0;
    const tiendasAsignadas = await ctx.db
      .query("tiendas")
      .withIndex("by_je", (q) => q.eq("jefeEntrenadorId", je._id))
      .collect();
    const tiendaIds = new Set(tiendasAsignadas.map((t) => t._id));
    const all = await ctx.db
      .query("passwordResetRequests")
      .withIndex("by_tienda_estado", (q) => q.eq("estado", "pendiente"))
      .collect();
    return all.filter((s) => tiendaIds.has(s.tiendaId)).length;
  },
});

// Detalle de cuentas Caja/Gerencia de las tiendas de un JE
export const listCuentasTiendaForJE = query({
  args: {
    sessionJefeEntrenadorId: v.id("jefesEntrenador"),
    tiendaId: v.optional(v.id("tiendas")),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, { kind: "jefeEntrenador", id: args.sessionJefeEntrenadorId });
    const je = await ctx.db.get(args.sessionJefeEntrenadorId);
    if (!je) return [];
    const tiendasAsignadas = await ctx.db
      .query("tiendas")
      .withIndex("by_je", (q) => q.eq("jefeEntrenadorId", je._id))
      .collect();
    const tiendaIds = new Set(tiendasAsignadas.map((t) => t._id));
    let q = ctx.db.query("userProfiles");
    const all = await q.collect();
    return all.filter((p) => {
      if (!tiendaIds.has(p.tiendaId)) return false;
      if (args.tiendaId && p.tiendaId !== args.tiendaId) return false;
      return true;
    });
  },
});
