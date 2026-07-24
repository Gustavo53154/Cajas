import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./auditoria";

export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("notificaciones")
      .withIndex("by_usuario", (q) => q.eq("usuarioId", user._id))
      .order("desc")
      .collect();
  },
});

export const countUnread = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;
    const all = await ctx.db
      .query("notificaciones")
      .withIndex("by_usuario_leida", (q) =>
        q.eq("usuarioId", user._id).eq("leida", false),
      )
      .collect();
    return all.length;
  },
});

export const markAsRead = mutation({
  args: { id: v.id("notificaciones") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.patch(args.id, { leida: true });
  },
});

export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db
      .query("notificaciones")
      .withIndex("by_usuario_leida", (q) =>
        q.eq("usuarioId", user._id).eq("leida", false),
      )
      .collect();
    for (const n of all) await ctx.db.patch(n._id, { leida: true });
  },
});

export const create = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    usuarioId: v.id("users"),
    tipo: v.string(),
    titulo: v.string(),
    mensaje: v.string(),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.insert("notificaciones", {
      tiendaId: args.tiendaId,
      usuarioId: args.usuarioId,
      tipo: args.tipo,
      titulo: args.titulo,
      mensaje: args.mensaje,
      link: args.link,
      leida: false,
      createdAt: Date.now(),
    });
  },
});
