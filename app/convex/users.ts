// Helpers para selección de personal
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./_helpers";

// Lista de personas con cargo Supervisor(a) (para asignar como supervisor a cargo)
export const listSupervisores = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("personales")
      .withIndex("by_tienda_cargo", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("cargo", "Supervisor(@)"),
      )
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();
  },
});
