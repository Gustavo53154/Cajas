// Gestión de JefesEntrenador (lecturas; mutaciones viven en auth.ts)
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./_helpers";

export const list = query({
  args: { sessionAdminId: v.id("admins") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, { kind: "admin", id: args.sessionAdminId });
    return await ctx.db.query("jefesEntrenador").collect();
  },
});

export const listAll = query({
  args: { sessionAdminId: v.id("admins") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, { kind: "admin", id: args.sessionAdminId });
    return await ctx.db.query("jefesEntrenador").collect();
  },
});

export const get = query({
  args: { id: v.id("jefesEntrenador") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jefesEntrenador")
      .withIndex("by_username", (q) => q.eq("username", args.username.toLowerCase()))
      .first();
  },
});

export const listTiendasAsignadas = query({
  args: { jefeEntrenadorId: v.id("jefesEntrenador") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tiendas")
      .withIndex("by_je", (q) => q.eq("jefeEntrenadorId", args.jefeEntrenadorId))
      .collect();
  },
});

// Para mostrar en pantalla admin: lista de JEs con # de tiendas asignadas
export const listWithCount = query({
  args: { sessionAdminId: v.id("admins") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, { kind: "admin", id: args.sessionAdminId });
    const jes = await ctx.db.query("jefesEntrenador").collect();
    const result = [];
    for (const je of jes) {
      const tiendas = await ctx.db
        .query("tiendas")
        .withIndex("by_je", (q) => q.eq("jefeEntrenadorId", je._id))
        .collect();
      result.push({ ...je, nTiendas: tiendas.length });
    }
    return result;
  },
});
