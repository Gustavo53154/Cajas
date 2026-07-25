import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireUser } from "./_helpers";

// Helper interno de logs
export async function audit(
  ctx: MutationCtx,
  args: {
    tiendaId: Id<"tiendas">;
    accion: "crear" | "actualizar" | "eliminar";
    entidad: string;
    entidadId: string;
    antes?: any;
    despues?: any;
  },
) {
  const identity = await ctx.auth.getUserIdentity();
  let usuarioNombre = "sistema";
  let usuarioId: Id<"users"> | undefined;
  if (identity?.email) {
    usuarioNombre = identity.email;
    const user = await ctx.db
      .query("users")
      .filter((q: any) => q.eq(q.field("email"), identity.email))
      .first();
    if (user) usuarioId = user._id;
  }
  await ctx.db.insert("logs", {
    tiendaId: args.tiendaId,
    usuarioId,
    usuarioNombre,
    accion: args.accion,
    entidad: args.entidad,
    entidadId: args.entidadId,
    antes: args.antes,
    despues: args.despues,
    createdAt: Date.now(),
  });
}

export const listLogs = query({
  args: {
    tiendaId: v.id("tiendas"),
    entidad: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const limit = args.limit ?? 100;
    let q = ctx.db
      .query("logs")
      .withIndex("by_tienda", (q2) => q2.eq("tiendaId", args.tiendaId));
    if (args.entidad) {
      q = ctx.db
        .query("logs")
        .withIndex("by_tienda_entidad", (q2) =>
          q2.eq("tiendaId", args.tiendaId).eq("entidad", args.entidad),
        );
    }
    const all = await q.order("desc").take(limit);
    return all;
  },
});
