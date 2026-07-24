// Auth simple: signIn / signOut / currentUser
// Usa la tabla `users` y `userProfiles` directamente
// sin dependencias del flujo complejo de Convex Auth

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Hash simple para passwords (MVP, no usar en producción)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "salt_dreamteam_2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Crear cuenta nueva
export const signUp = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    nombreCompleto: v.string(),
    tiendaId: v.id("tiendas"),
    rol: v.union(
      v.literal("Admin"),
      v.literal("JefeCajas"),
      v.literal("Supervisor"),
      v.literal("SubGerente"),
      v.literal("Gerente"),
    ),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      throw new Error("Ya existe una cuenta con ese email");
    }
    const passwordHash = await hashPassword(args.password);
    const userId = await ctx.db.insert("users", {
      email,
      name: args.nombreCompleto,
      image: passwordHash,
    });
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      tiendaId: args.tiendaId,
      nombreCompleto: args.nombreCompleto,
      rol: args.rol,
    });
    return { userId, profileId };
  },
});

// Iniciar sesión
export const signIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user) {
      throw new Error("Email o contraseña inválidos");
    }
    const passwordHash = await hashPassword(args.password);
    if (user.image !== passwordHash) {
      throw new Error("Email o contraseña inválidos");
    }
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!profile) {
      throw new Error("Perfil no encontrado, contacta al administrador");
    }
    return { userId: user._id, profileId: profile._id };
  },
});

// Obtener usuario actual por ID (usado después de signIn)
export const getCurrentUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    return { user, profile };
  },
});

// Cambiar contraseña
export const changePassword = mutation({
  args: {
    userId: v.id("users"),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Usuario no encontrado");
    const currentHash = await hashPassword(args.currentPassword);
    if (user.image !== currentHash) throw new Error("Contraseña actual incorrecta");
    const newHash = await hashPassword(args.newPassword);
    await ctx.db.patch(args.userId, { image: newHash });
  },
});
