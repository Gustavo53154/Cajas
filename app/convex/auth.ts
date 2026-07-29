// Auth multi-rol: Admin, JefeEntrenador, Cajas (tienda), Gerencia (tienda)
// Usa 3 sistemas:
//   1) tabla `admins` para Admins
//   2) tabla `jefesEntrenador` para JefesEntrenador
//   3) tabla `users` (Convex Auth) + `userProfiles` para cuentas de tienda
//
// Hash: SHA-256 con sal hardcodeada (MVP). Migrar a Argon2/scrypt en prod.
//
// El "session payload" que devuelve signIn es un objeto discriminado por `kind`.

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const DEFAULT_PASSWORD = "12345678";
const SALT = "salt_dreamteam_2026";

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeUsername(u: string): string {
  return u.toLowerCase().trim();
}

function validateUsername(u: string): string {
  const n = normalizeUsername(u);
  if (n.length < 3 || n.length > 32) {
    throw new Error("El username debe tener entre 3 y 32 caracteres");
  }
  if (!/^[a-z0-9_]+$/.test(n)) {
    throw new Error("El username solo puede tener letras minúsculas, números y guion bajo");
  }
  return n;
}

// =====================================================================
// SignIn: busca primero en admins, luego en jefesEntrenador, luego en users
// =====================================================================

export const signIn = mutation({
  args: {
    username: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const username = normalizeUsername(args.username);
    const passwordHash = await hashPassword(args.password);
    const now = Date.now();

    // 1) Buscar en admins
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (admin) {
      if (!admin.activo) throw new Error("Cuenta desactivada");
      if (admin.passwordHash !== passwordHash) {
        throw new Error("Username o contraseña inválidos");
      }
      await ctx.db.patch(admin._id, { lastLoginAt: now });
      return {
        kind: "admin" as const,
        id: admin._id,
        username: admin.username,
        nombre: admin.nombre,
        apellido: admin.apellido,
      };
    }

    // 2) Buscar en jefesEntrenador
    const je = await ctx.db
      .query("jefesEntrenador")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (je) {
      if (!je.activo) throw new Error("Cuenta desactivada");
      if (je.passwordHash !== passwordHash) {
        throw new Error("Username o contraseña inválidos");
      }
      await ctx.db.patch(je._id, { lastLoginAt: now });
      return {
        kind: "jefeEntrenador" as const,
        id: je._id,
        username: je.username,
        nombre: je.nombre,
        apellido: je.apellido,
        mustChangePassword: je.mustChangePassword,
      };
    }

    // 3) Buscar en userProfiles (Caja/Gerencia) por username denormalizado
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (profile) {
      if (!profile.activo) throw new Error("Cuenta desactivada");
      const user = await ctx.db.get(profile.userId);
      if (!user) throw new Error("Cuenta de usuario no encontrada");
      if (user.image !== passwordHash) {
        throw new Error("Username o contraseña inválidos");
      }
      const tienda = await ctx.db.get(profile.tiendaId);
      if (tienda && !tienda.activa) {
        throw new Error("La tienda está desactivada");
      }
      await ctx.db.patch(profile._id, { lastLoginAt: now });
      return {
        kind: "user" as const,
        id: profile._id,
        userId: profile.userId,
        username: profile.username,
        nombreCompleto: profile.nombreCompleto,
        tiendaId: profile.tiendaId,
        tipoCuenta: profile.tipoCuenta,
        mustChangePassword: profile.mustChangePassword,
      };
    }

    throw new Error("Username o contraseña inválidos");
  },
});

// =====================================================================
// Sesión actual (recibe el payload guardado en localStorage)
// =====================================================================

export const getCurrentSession = query({
  args: {
    session: v.union(
      v.object({
        kind: v.literal("admin"),
        id: v.id("admins"),
      }),
      v.object({
        kind: v.literal("jefeEntrenador"),
        id: v.id("jefesEntrenador"),
      }),
      v.object({
        kind: v.literal("user"),
        id: v.id("userProfiles"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.session.kind === "admin") {
      const admin = await ctx.db.get(args.session.id);
      if (!admin || !admin.activo) return null;
      return { kind: "admin" as const, admin };
    }
    if (args.session.kind === "jefeEntrenador") {
      const je = await ctx.db.get(args.session.id);
      if (!je || !je.activo) return null;
      // Traer tiendas asignadas
      const tiendas = await ctx.db
        .query("tiendas")
        .withIndex("by_je", (q) => q.eq("jefeEntrenadorId", je._id))
        .collect();
      return { kind: "jefeEntrenador" as const, jefeEntrenador: je, tiendas };
    }
    const profile = await ctx.db.get(args.session.id);
    if (!profile || !profile.activo) return null;
    return { kind: "user" as const, profile };
  },
});

// =====================================================================
// Change password (rol-aware)
// =====================================================================

export const changePassword = mutation({
  args: {
    session: v.union(
      v.object({ kind: v.literal("admin"), id: v.id("admins") }),
      v.object({ kind: v.literal("jefeEntrenador"), id: v.id("jefesEntrenador") }),
      v.object({ kind: v.literal("user"), id: v.id("userProfiles") }),
    ),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.newPassword.length < 8) {
      throw new Error("La nueva contraseña debe tener al menos 8 caracteres");
    }

    if (args.session.kind === "admin") {
      const admin = await ctx.db.get(args.session.id);
      if (!admin) throw new Error("Cuenta no encontrada");
      const currentHash = await hashPassword(args.currentPassword);
      if (admin.passwordHash !== currentHash) {
        throw new Error("Contraseña actual incorrecta");
      }
      if (args.newPassword === args.currentPassword) {
        throw new Error("La nueva contraseña debe ser distinta a la actual");
      }
      const newHash = await hashPassword(args.newPassword);
      await ctx.db.patch(admin._id, { passwordHash: newHash, updatedAt: Date.now() });
      return { ok: true };
    }

    if (args.session.kind === "jefeEntrenador") {
      const je = await ctx.db.get(args.session.id);
      if (!je) throw new Error("Cuenta no encontrada");
      const currentHash = await hashPassword(args.currentPassword);
      if (je.passwordHash !== currentHash) {
        throw new Error("Contraseña actual incorrecta");
      }
      if (args.newPassword === args.currentPassword) {
        throw new Error("La nueva contraseña debe ser distinta a la actual");
      }
      if (args.newPassword === DEFAULT_PASSWORD) {
        throw new Error("La nueva contraseña no puede ser 12345678");
      }
      const newHash = await hashPassword(args.newPassword);
      await ctx.db.patch(je._id, {
        passwordHash: newHash,
        mustChangePassword: false,
        updatedAt: Date.now(),
      });
      return { ok: true };
    }

    // user (Caja / Gerencia)
    const profile = await ctx.db.get(args.session.id);
    if (!profile) throw new Error("Cuenta no encontrada");
    const user = await ctx.db.get(profile.userId);
    if (!user) throw new Error("Cuenta de usuario no encontrada");
    const currentHash = await hashPassword(args.currentPassword);
    if (user.image !== currentHash) {
      throw new Error("Contraseña actual incorrecta");
    }
    if (args.newPassword === args.currentPassword) {
      throw new Error("La nueva contraseña debe ser distinta a la actual");
    }
    if (args.newPassword === DEFAULT_PASSWORD) {
      throw new Error("La nueva contraseña no puede ser 12345678");
    }
    const newHash = await hashPassword(args.newPassword);
    await ctx.db.patch(user._id, { image: newHash });
    await ctx.db.patch(profile._id, {
      mustChangePassword: false,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// =====================================================================
// Creación de cuentas (solo Admin / script)
// =====================================================================

export const createAdmin = mutation({
  args: {
    username: v.string(),
    nombre: v.string(),
    apellido: v.string(),
    password: v.string(),
    sessionAdminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    const me = await ctx.db.get(args.sessionAdminId);
    if (!me || !me.activo) throw new Error("No autorizado");
    const username = validateUsername(args.username);
    if (args.password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    }
    await assertUsernameAvailable(ctx, username);
    const passwordHash = await hashPassword(args.password);
    const id = await ctx.db.insert("admins", {
      username,
      nombre: args.nombre,
      apellido: args.apellido,
      passwordHash,
      activo: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  },
});

export const createJefeEntrenador = mutation({
  args: {
    username: v.string(),
    nombre: v.string(),
    apellido: v.string(),
    sessionAdminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    const me = await ctx.db.get(args.sessionAdminId);
    if (!me || !me.activo) throw new Error("No autorizado");
    const username = validateUsername(args.username);
    await assertUsernameAvailable(ctx, username);
    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    const id = await ctx.db.insert("jefesEntrenador", {
      username,
      nombre: args.nombre,
      apellido: args.apellido,
      passwordHash,
      mustChangePassword: true,
      activo: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { id, defaultPassword: DEFAULT_PASSWORD };
  },
});

export const updateJefeEntrenador = mutation({
  args: {
    id: v.id("jefesEntrenador"),
    nombre: v.optional(v.string()),
    apellido: v.optional(v.string()),
    activo: v.optional(v.boolean()),
    sessionAdminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    const me = await ctx.db.get(args.sessionAdminId);
    if (!me || !me.activo) throw new Error("No autorizado");
    const je = await ctx.db.get(args.id);
    if (!je) throw new Error("JE no encontrado");
    const patch: any = { updatedAt: Date.now() };
    if (args.nombre !== undefined) patch.nombre = args.nombre;
    if (args.apellido !== undefined) patch.apellido = args.apellido;
    if (args.activo !== undefined) {
      if (args.activo === false) {
        // Bloquear si tiene tiendas asignadas
        const tiendas = await ctx.db
          .query("tiendas")
          .withIndex("by_je", (q) => q.eq("jefeEntrenadorId", args.id))
          .collect();
        if (tiendas.length > 0) {
          throw new Error(
            `No se puede desactivar: el JE tiene ${tiendas.length} tienda(s) asignada(s). Reasigna primero.`,
          );
        }
      }
      patch.activo = args.activo;
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const adminResetPassword = mutation({
  args: {
    targetKind: v.union(v.literal("admin"), v.literal("jefeEntrenador"), v.literal("cuentaTienda")),
    targetId: v.union(v.id("admins"), v.id("jefesEntrenador"), v.id("userProfiles")),
    newPassword: v.optional(v.string()),
    sessionAdminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    const me = await ctx.db.get(args.sessionAdminId);
    if (!me || !me.activo) throw new Error("No autorizado");
    const now = Date.now();

    if (args.targetKind === "admin") {
      if (args.targetId === args.sessionAdminId) {
        throw new Error("Usa 'Cambiar contraseña' para tu propia cuenta");
      }
      if (!args.newPassword || args.newPassword.length < 8) {
        throw new Error("Proporciona una nueva contraseña de al menos 8 caracteres");
      }
      const newHash = await hashPassword(args.newPassword);
      await ctx.db.patch(args.targetId as Id<"admins">, {
        passwordHash: newHash,
        updatedAt: now,
      });
      return { ok: true };
    }

    if (args.targetKind === "jefeEntrenador") {
      const newPass = args.newPassword ?? DEFAULT_PASSWORD;
      const newHash = await hashPassword(newPass);
      await ctx.db.patch(args.targetId as Id<"jefesEntrenador">, {
        passwordHash: newHash,
        mustChangePassword: args.newPassword ? false : true,
        updatedAt: now,
      });
      return { ok: true, newPassword: newPass };
    }

    // cuentaTienda
    const profile = await ctx.db.get(args.targetId as Id<"userProfiles">);
    if (!profile) throw new Error("Cuenta de tienda no encontrada");
    const user = await ctx.db.get(profile.userId);
    if (!user) throw new Error("User no encontrado");
    const newPass = args.newPassword ?? DEFAULT_PASSWORD;
    const newHash = await hashPassword(newPass);
    await ctx.db.patch(user._id, { image: newHash });
    await ctx.db.patch(profile._id, {
      mustChangePassword: args.newPassword ? false : true,
      updatedAt: now,
    });
    return { ok: true, newPassword: newPass };
  },
});

// =====================================================================
// Solicitud de reseteo de contraseña (Caja/Gerencia → JE)
// =====================================================================

export const createSolicitudReset = mutation({
  args: {
    session: v.object({ kind: v.literal("user"), id: v.id("userProfiles") }),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.session.id);
    if (!profile) throw new Error("Cuenta no encontrada");
    if (!profile.activo) throw new Error("Cuenta desactivada");
    const id = await ctx.db.insert("passwordResetRequests", {
      tiendaId: profile.tiendaId,
      tipoSolicitante: profile.tipoCuenta,
      userProfileId: profile._id,
      usernameSnapshot: profile.username,
      motivo: args.motivo,
      estado: "pendiente",
      createdAt: Date.now(),
    });
    return id;
  },
});

// Variante PÚBLICA: para usar desde el login cuando el usuario olvidó su contraseña
// y no puede loguearse. No requiere auth.
export const createSolicitudResetPublic = mutation({
  args: {
    username: v.string(),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const username = normalizeUsername(args.username);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (!profile) {
      throw new Error("No existe una cuenta con ese username");
    }
    if (!profile.activo) {
      throw new Error("La cuenta está desactivada");
    }
    const id = await ctx.db.insert("passwordResetRequests", {
      tiendaId: profile.tiendaId,
      tipoSolicitante: profile.tipoCuenta,
      userProfileId: profile._id,
      usernameSnapshot: profile.username,
      motivo: args.motivo,
      estado: "pendiente",
      createdAt: Date.now(),
    });
    return id;
  },
});

export const atenderSolicitudReset = mutation({
  args: {
    solicitudId: v.id("passwordResetRequests"),
    accion: v.union(v.literal("aceptar"), v.literal("rechazar")),
    motivoRechazo: v.optional(v.string()),
    sessionJefeEntrenadorId: v.id("jefesEntrenador"),
  },
  handler: async (ctx, args) => {
    const je = await ctx.db.get(args.sessionJefeEntrenadorId);
    if (!je || !je.activo) throw new Error("No autorizado");
    const sol = await ctx.db.get(args.solicitudId);
    if (!sol) throw new Error("Solicitud no encontrada");
    if (sol.estado !== "pendiente") {
      throw new Error("La solicitud ya fue respondida");
    }
    const tienda = await ctx.db.get(sol.tiendaId);
    if (!tienda) throw new Error("Tienda no encontrada");
    if (tienda.jefeEntrenadorId !== je._id) {
      throw new Error("No eres el JE asignado a esta tienda");
    }
    const now = Date.now();
    if (args.accion === "rechazar") {
      await ctx.db.patch(sol._id, {
        estado: "rechazada",
        respondidaPorJefeEntrenadorId: je._id,
        respondidaAt: now,
        motivoRechazo: args.motivoRechazo,
      });
      return { ok: true, accion: "rechazada" as const };
    }
    // Aceptar: resetear la cuenta a 12345678
    const profile = await ctx.db.get(sol.userProfileId);
    if (!profile) throw new Error("Cuenta no encontrada");
    const user = await ctx.db.get(profile.userId);
    if (!user) throw new Error("User no encontrado");
    const newHash = await hashPassword(DEFAULT_PASSWORD);
    await ctx.db.patch(user._id, { image: newHash });
    await ctx.db.patch(profile._id, {
      mustChangePassword: true,
      updatedAt: now,
    });
    await ctx.db.patch(sol._id, {
      estado: "aceptada",
      respondidaPorJefeEntrenadorId: je._id,
      respondidaAt: now,
      passwordReseteadaHash: newHash,
    });
    return { ok: true, accion: "aceptada" as const, newPassword: DEFAULT_PASSWORD };
  },
});

export const jeResetPassword = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    tipoCuenta: v.union(v.literal("Cajas"), v.literal("Gerencia")),
    sessionJefeEntrenadorId: v.id("jefesEntrenador"),
  },
  handler: async (ctx, args) => {
    const je = await ctx.db.get(args.sessionJefeEntrenadorId);
    if (!je || !je.activo) throw new Error("No autorizado");
    const tienda = await ctx.db.get(args.tiendaId);
    if (!tienda) throw new Error("Tienda no encontrada");
    if (tienda.jefeEntrenadorId !== je._id) {
      throw new Error("No eres el JE asignado a esta tienda");
    }
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_tienda_tipo", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("tipoCuenta", args.tipoCuenta),
      )
      .first();
    if (!profile) throw new Error("Cuenta no encontrada");
    const user = await ctx.db.get(profile.userId);
    if (!user) throw new Error("User no encontrado");
    const newHash = await hashPassword(DEFAULT_PASSWORD);
    await ctx.db.patch(user._id, { image: newHash });
    await ctx.db.patch(profile._id, {
      mustChangePassword: true,
      updatedAt: Date.now(),
    });
    return { ok: true, newPassword: DEFAULT_PASSWORD };
  },
});

export const jeToggleCuentaTienda = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    tipoCuenta: v.union(v.literal("Cajas"), v.literal("Gerencia")),
    activo: v.boolean(),
    sessionJefeEntrenadorId: v.id("jefesEntrenador"),
  },
  handler: async (ctx, args) => {
    const je = await ctx.db.get(args.sessionJefeEntrenadorId);
    if (!je || !je.activo) throw new Error("No autorizado");
    const tienda = await ctx.db.get(args.tiendaId);
    if (!tienda) throw new Error("Tienda no encontrada");
    if (tienda.jefeEntrenadorId !== je._id) {
      throw new Error("No eres el JE asignado a esta tienda");
    }
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_tienda_tipo", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("tipoCuenta", args.tipoCuenta),
      )
      .first();
    if (!profile) throw new Error("Cuenta no encontrada");
    await ctx.db.patch(profile._id, { activo: args.activo, updatedAt: Date.now() });
  },
});

// =====================================================================
// Helpers
// =====================================================================

async function assertUsernameAvailable(
  ctx: { db: any },
  username: string,
): Promise<void> {
  const inAdmins = await ctx.db
    .query("admins")
    .withIndex("by_username", (q: any) => q.eq("username", username))
    .first();
  if (inAdmins) throw new Error(`El username "${username}" ya está en uso`);
  const inJE = await ctx.db
    .query("jefesEntrenador")
    .withIndex("by_username", (q: any) => q.eq("username", username))
    .first();
  if (inJE) throw new Error(`El username "${username}" ya está en uso`);
  const inUP = await ctx.db
    .query("userProfiles")
    .withIndex("by_username", (q: any) => q.eq("username", username))
    .first();
  if (inUP) throw new Error(`El username "${username}" ya está en uso`);
}

// Re-exports para compatibilidad
export { hashPassword as _hashPassword, DEFAULT_PASSWORD as _DEFAULT_PASSWORD };
