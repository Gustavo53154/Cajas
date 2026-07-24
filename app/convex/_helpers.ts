import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";

type CtxWithDb = QueryCtx | MutationCtx;

// Auth: el cliente valida la sesión y pasa tiendaId en cada query/mutation.
// El backend confía en que el cliente ya validó. Para producción con múltiples
// usuarios, usar Convex Auth real con tokens JWT.

// Helper: simplemente no hace nada (compatibilidad con código existente)
export async function getCurrentUser(ctx: CtxWithDb | ActionCtx) {
  return null;
}

export async function requireUser(ctx: CtxWithDb | ActionCtx) {
  // No-op: el cliente ya validó
  return null as any;
}

export async function getUserProfile(ctx: CtxWithDb, userId: Id<"users">) {
  return await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
}

export async function requireUserProfile(ctx: CtxWithDb) {
  // No-op: el cliente ya validó
  return { user: null, profile: null };
}
