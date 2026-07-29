// Gestión de Admins
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./_helpers";

export const list = query({
  args: { sessionAdminId: v.id("admins") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, { kind: "admin", id: args.sessionAdminId });
    return await ctx.db.query("admins").collect();
  },
});

export const get = query({
  args: { id: v.id("admins") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const update = mutation({
  args: {
    sessionAdminId: v.id("admins"),
    id: v.id("admins"),
    nombre: v.optional(v.string()),
    apellido: v.optional(v.string()),
    activo: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx, { kind: "admin", id: args.sessionAdminId });
    if (args.id === me._id && args.activo === false) {
      throw new Error("No puedes desactivar tu propia cuenta");
    }
    const target = await ctx.db.get(args.id);
    if (!target) throw new Error("Admin no encontrado");
    const patch: any = { updatedAt: Date.now() };
    if (args.nombre !== undefined) patch.nombre = args.nombre;
    if (args.apellido !== undefined) patch.apellido = args.apellido;
    if (args.activo !== undefined) patch.activo = args.activo;
    await ctx.db.patch(args.id, patch);
  },
});
