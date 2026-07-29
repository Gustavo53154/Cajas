// Mutations de bootstrap (sin auth requerida).
// Solo se pueden usar si la tabla está vacía.

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { hashPassword } from "./auth";

function normalizeUsername(u: string): string {
  return u.toLowerCase().trim().replace(/[^a-z0-9_]/g, "").slice(0, 32);
}

export const createFirstAdmin = mutation({
  args: {
    username: v.string(),
    password: v.string(),
    nombre: v.string(),
    apellido: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("admins").first();
    if (existing) {
      throw new Error("Ya existe al menos un Admin. Usa createAdmin desde la app.");
    }
    const username = normalizeUsername(args.username);
    if (username.length < 3 || username.length > 32) {
      throw new Error("Username debe tener entre 3 y 32 caracteres");
    }
    if (args.password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    }
    const passwordHash = await hashPassword(args.password);
    return await ctx.db.insert("admins", {
      username,
      nombre: args.nombre,
      apellido: args.apellido,
      passwordHash,
      activo: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const createFirstJefeEntrenador = mutation({
  args: {
    username: v.string(),
    password: v.optional(v.string()),
    nombre: v.string(),
    apellido: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("jefesEntrenador").first();
    if (existing) {
      throw new Error("Ya existe al menos un JE. Usa createJefeEntrenador desde la app.");
    }
    const username = normalizeUsername(args.username);
    const password = args.password ?? "12345678";
    if (password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    }
    const passwordHash = await hashPassword(password);
    return await ctx.db.insert("jefesEntrenador", {
      username,
      nombre: args.nombre,
      apellido: args.apellido,
      passwordHash,
      mustChangePassword: true,
      activo: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
