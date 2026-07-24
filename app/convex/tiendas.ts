import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireUser } from "./_helpers";

export const createTienda = mutation({
  args: {
    nombre: v.string(),
    codigo: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.insert("tiendas", {
      nombre: args.nombre,
      codigo: args.codigo,
      activa: true,
    });
  },
});

export const listTiendas = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tiendas").collect();
  },
});

export const getTiendaDefault = query({
  args: {},
  handler: async (ctx) => {
    const tiendas = await ctx.db.query("tiendas").take(1);
    return tiendas[0] ?? null;
  },
});

// Inicializar tienda por defecto (idempotente, usado en seed/migración)
export const ensureTiendaDefault = mutation({
  args: {
    nombre: v.string(),
    codigo: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tiendas")
      .filter((q) => q.eq(q.field("codigo"), args.codigo))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("tiendas", {
      nombre: args.nombre,
      codigo: args.codigo,
      activa: true,
    });
  },
});
