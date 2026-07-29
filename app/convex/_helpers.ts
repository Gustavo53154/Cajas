// Helpers de sesión / autorización para el modelo multi-rol.
//
// Sesión (kind):
//   - "admin"            → id es Id<"admins">
//   - "jefeEntrenador"   → id es Id<"jefesEntrenador">
//   - "user"             → id es Id<"userProfiles"> (Caja o Gerencia de tienda)
//
// Estos helpers reciben la sesión del cliente (que la mantiene en localStorage).
// El backend **confía** en que el cliente no la manipula, igual que el sistema
// anterior con `requireUser` (MVP). En producción se debe firmar con un JWT.
//
// Funciones:
//   - getSession(ctx, session)              → { kind, ... }
//   - requireAdmin(ctx, session)
//   - requireJefeEntrenador(ctx, session, tiendaId)   → verifica que el JE es el asignado a la tienda
//   - requireCaja(ctx, session, tiendaId)             → solo cuenta Caja
//   - requireWriteAccess(ctx, session, tiendaId)      → Admin, JE de la tienda, o Caja
//   - requireReadAccess(ctx, session, tiendaId)       → cualquiera de los 4 si la tienda les corresponde
//   - requireReadOnly(ctx, session, tiendaId)         → Gerencia (nunca escribe)
//   - assertSessionActive(ctx, session)              → throws si !activo
//   - assertTiendaActiva(ctx, tiendaId)               → throws si tienda.activa = false

import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export const sessionArg = v.union(
  v.object({ kind: v.literal("admin"), id: v.id("admins") }),
  v.object({ kind: v.literal("jefeEntrenador"), id: v.id("jefesEntrenador") }),
  v.object({ kind: v.literal("user"), id: v.id("userProfiles") }),
);

export type Session = { kind: "admin"; id: Id<"admins"> }
  | { kind: "jefeEntrenador"; id: Id<"jefesEntrenador"> }
  | { kind: "user"; id: Id<"userProfiles"> };

export type ResolvedSession =
  | { kind: "admin"; admin: Doc<"admins"> }
  | { kind: "jefeEntrenador"; je: Doc<"jefesEntrenador"> }
  | { kind: "user"; profile: Doc<"userProfiles">; user: Doc<"users"> };

export async function getSession(ctx: Ctx, session: Session): Promise<ResolvedSession | null> {
  if (session.kind === "admin") {
    const admin = await ctx.db.get(session.id);
    if (!admin) return null;
    return { kind: "admin", admin };
  }
  if (session.kind === "jefeEntrenador") {
    const je = await ctx.db.get(session.id);
    if (!je) return null;
    return { kind: "jefeEntrenador", je };
  }
  const profile = await ctx.db.get(session.id);
  if (!profile) return null;
  const user = await ctx.db.get(profile.userId);
  if (!user) return null;
  return { kind: "user", profile, user };
}

export async function assertSessionActive(resolved: ResolvedSession): Promise<void> {
  if (resolved.kind === "admin" && !resolved.admin.activo) {
    throw new Error("Tu cuenta de Admin está desactivada");
  }
  if (resolved.kind === "jefeEntrenador" && !resolved.je.activo) {
    throw new Error("Tu cuenta de JefeEntrenador está desactivada");
  }
  if (resolved.kind === "user" && !resolved.profile.activo) {
    throw new Error("Tu cuenta está desactivada");
  }
}

export async function requireSession(ctx: Ctx, session: Session): Promise<ResolvedSession> {
  const resolved = await getSession(ctx, session);
  if (!resolved) throw new Error("Sesión inválida");
  await assertSessionActive(resolved);
  return resolved;
}

export async function requireAdmin(ctx: Ctx, session: Session) {
  const resolved = await requireSession(ctx, session);
  if (resolved.kind !== "admin") throw new Error("Requiere permisos de Admin");
  return resolved.admin;
}

export async function requireJefeEntrenadorDeTienda(
  ctx: Ctx,
  session: Session,
  tiendaId: Id<"tiendas">,
) {
  const resolved = await requireSession(ctx, session);
  if (resolved.kind === "admin") return { admin: resolved.admin };
  if (resolved.kind === "jefeEntrenador") {
    const tienda = await ctx.db.get(tiendaId);
    if (!tienda) throw new Error("Tienda no encontrada");
    if (tienda.jefeEntrenadorId !== resolved.je._id) {
      throw new Error("No eres el JE asignado a esta tienda");
    }
    return { je: resolved.je };
  }
  throw new Error("Requiere permisos de Admin o JefeEntrenador");
}

export async function requireWriteAccess(ctx: Ctx, session: Session, tiendaId: Id<"tiendas">) {
  const resolved = await requireSession(ctx, session);
  if (resolved.kind === "admin") return resolved;
  if (resolved.kind === "jefeEntrenador") {
    const tienda = await ctx.db.get(tiendaId);
    if (!tienda) throw new Error("Tienda no encontrada");
    if (tienda.jefeEntrenadorId !== resolved.je._id) {
      throw new Error("No tienes acceso a esta tienda");
    }
    return resolved;
  }
  // user
  if (resolved.profile.tiendaId !== tiendaId) {
    throw new Error("No tienes acceso a esta tienda");
  }
  if (resolved.profile.tipoCuenta === "Gerencia") {
    throw new Error("Tu cuenta es de solo lectura (Gerencia)");
  }
  return resolved;
}

export async function requireReadAccess(ctx: Ctx, session: Session, tiendaId: Id<"tiendas">) {
  const resolved = await requireSession(ctx, session);
  if (resolved.kind === "admin") return resolved;
  if (resolved.kind === "jefeEntrenador") {
    const tienda = await ctx.db.get(tiendaId);
    if (!tienda) throw new Error("Tienda no encontrada");
    if (tienda.jefeEntrenadorId !== resolved.je._id) {
      throw new Error("No tienes acceso a esta tienda");
    }
    return resolved;
  }
  if (resolved.profile.tiendaId !== tiendaId) {
    throw new Error("No tienes acceso a esta tienda");
  }
  return resolved;
}

export async function requireGerencia(ctx: Ctx, session: Session, tiendaId: Id<"tiendas">) {
  const resolved = await requireSession(ctx, session);
  if (resolved.kind === "admin") return resolved;
  if (resolved.kind === "jefeEntrenador") {
    throw new Error("Esta acción es solo para cuentas de Gerencia");
  }
  if (resolved.profile.tiendaId !== tiendaId) {
    throw new Error("No tienes acceso a esta tienda");
  }
  if (resolved.profile.tipoCuenta !== "Gerencia") {
    throw new Error("Esta acción es solo para cuentas de Gerencia");
  }
  return resolved;
}

export async function assertTiendaActiva(ctx: Ctx, tiendaId: Id<"tiendas">) {
  const tienda = await ctx.db.get(tiendaId);
  if (!tienda) throw new Error("Tienda no encontrada");
  if (!tienda.activa) throw new Error("La tienda está desactivada");
  return tienda;
}

// Compatibilidad con código previo
export async function requireUser(_ctx: any) {
  return null as any;
}
export async function requireUserProfile(_ctx: any) {
  return { user: null, profile: null } as any;
}
export async function getUserProfile(_ctx: any, _userId: any) {
  return null as any;
}
