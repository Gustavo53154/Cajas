import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireAdmin, requireSession } from "./_helpers";
import { hashPassword } from "./auth";
import { audit } from "./logs";

const DEFAULT_PASSWORD = "12345678";

function normalizeUsername(u: string): string {
  return u.toLowerCase().trim().replace(/[^a-z0-9_]/g, "").slice(0, 32);
}

export const listTiendas = query({
  args: {
    session: v.optional(
      v.union(
        v.object({ kind: v.literal("admin"), id: v.id("admins") }),
        v.object({ kind: v.literal("jefeEntrenador"), id: v.id("jefesEntrenador") }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    if (args.session) {
      await requireSession(ctx, args.session);
    }
    if (args.session?.kind === "jefeEntrenador") {
      return await ctx.db
        .query("tiendas")
        .withIndex("by_je", (q) => q.eq("jefeEntrenadorId", args.session!.kind === "jefeEntrenador" ? (args.session as any).id : undefined as any))
        .collect();
    }
    return await ctx.db.query("tiendas").collect();
  },
});

export const getTienda = query({
  args: { id: v.id("tiendas") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getTiendaDefault = query({
  args: {},
  handler: async (ctx) => {
    const tiendas = await ctx.db.query("tiendas").take(1);
    return tiendas[0] ?? null;
  },
});

// Crear tienda + cajas + cuentas Caja/Gerencia (solo Admin)
export const createTiendaFull = mutation({
  args: {
    sessionAdminId: v.id("admins"),
    nombre: v.string(),
    codigo: v.string(),
    direccion: v.string(),
    nCajasRegulares: v.number(),
    nCajasRapidas: v.number(),
    nCajasSelf: v.number(),
    tienePersonalSelf: v.boolean(),
    tienePersonalRs: v.boolean(),
    jefeEntrenadorId: v.id("jefesEntrenador"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, { kind: "admin", id: args.sessionAdminId });
    const now = Date.now();

    if (args.nCajasRegulares < 0 || args.nCajasRapidas < 0 || args.nCajasSelf < 0) {
      throw new Error("Las cantidades de cajas no pueden ser negativas");
    }
    if (args.nCajasRegulares + args.nCajasRapidas + args.nCajasSelf < 1) {
      throw new Error("Debe haber al menos 1 caja");
    }

    const codigo = args.codigo.trim();
    if (!codigo) throw new Error("El código es obligatorio");

    const je = await ctx.db.get(args.jefeEntrenadorId);
    if (!je || !je.activo) throw new Error("JE no encontrado o inactivo");

    // 1) Crear tienda
    const tiendaId = await ctx.db.insert("tiendas", {
      nombre: args.nombre,
      codigo,
      direccion: args.direccion,
      nCajasRegulares: args.nCajasRegulares,
      nCajasRapidas: args.nCajasRapidas,
      nCajasSelf: args.nCajasSelf,
      tienePersonalSelf: args.tienePersonalSelf,
      tienePersonalRs: args.tienePersonalRs,
      jefeEntrenadorId: args.jefeEntrenadorId,
      activa: true,
      createdAt: now,
      updatedAt: now,
    });

    // 2) Crear cajas físicas
    const totalCajas = args.nCajasRegulares + args.nCajasRapidas + args.nCajasSelf;
    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    for (let i = 1; i <= totalCajas; i++) {
      let tipo: "regular" | "rapida" | "autoservicio";
      if (i <= args.nCajasRegulares) tipo = "regular";
      else if (i <= args.nCajasRegulares + args.nCajasRapidas) tipo = "rapida";
      else tipo = "autoservicio";
      await ctx.db.insert("cajas", {
        tiendaId,
        codigo: i,
        tipo,
        preferencial: i === 1,
      });
    }

    // 3) Crear cuenta de Caja
    const cajaUsername = normalizeUsername(`caja-${codigo}`);
    if (cajaUsername.length < 3) {
      throw new Error("El código de tienda genera un username de Caja muy corto");
    }
    const cajaUserId = await ctx.db.insert("users", {
      email: `${cajaUsername}@local.dreamteam`,
      name: `Caja - ${args.nombre}`,
      image: passwordHash,
    });
    const cajaProfileId = await ctx.db.insert("userProfiles", {
      userId: cajaUserId,
      tiendaId,
      tipoCuenta: "Cajas",
      nombreCompleto: `Caja - ${args.nombre}`,
      username: cajaUsername,
      activo: true,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    });

    // 4) Crear cuenta de Gerencia
    const gerUsername = normalizeUsername(`gerencia-${codigo}`);
    const gerUserId = await ctx.db.insert("users", {
      email: `${gerUsername}@local.dreamteam`,
      name: `Gerencia - ${args.nombre}`,
      image: passwordHash,
    });
    const gerProfileId = await ctx.db.insert("userProfiles", {
      userId: gerUserId,
      tiendaId,
      tipoCuenta: "Gerencia",
      nombreCompleto: `Gerencia - ${args.nombre}`,
      username: gerUsername,
      activo: true,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    });

    await audit(ctx, {
      tiendaId,
      accion: "crear",
      entidad: "tienda",
      entidadId: tiendaId,
      despues: { nombre: args.nombre, codigo, nCajas: totalCajas },
    });

    return {
      tiendaId,
      caja: { userId: cajaUserId, profileId: cajaProfileId, username: cajaUsername, password: DEFAULT_PASSWORD },
      gerencia: { userId: gerUserId, profileId: gerProfileId, username: gerUsername, password: DEFAULT_PASSWORD },
    };
  },
});

export const updateTienda = mutation({
  args: {
    sessionAdminId: v.id("admins"),
    id: v.id("tiendas"),
    nombre: v.optional(v.string()),
    direccion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, { kind: "admin", id: args.sessionAdminId });
    const tienda = await ctx.db.get(args.id);
    if (!tienda) throw new Error("Tienda no encontrada");
    const antes = { nombre: tienda.nombre, direccion: tienda.direccion };
    const patch: any = { updatedAt: Date.now() };
    if (args.nombre !== undefined) patch.nombre = args.nombre;
    if (args.direccion !== undefined) patch.direccion = args.direccion;
    await ctx.db.patch(args.id, patch);
    await audit(ctx, {
      tiendaId: args.id,
      accion: "actualizar",
      entidad: "tienda",
      entidadId: args.id,
      antes,
      despues: { nombre: patch.nombre, direccion: patch.direccion },
    });
  },
});

export const toggleTiendaActiva = mutation({
  args: {
    sessionAdminId: v.id("admins"),
    id: v.id("tiendas"),
    activa: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, { kind: "admin", id: args.sessionAdminId });
    const tienda = await ctx.db.get(args.id);
    if (!tienda) throw new Error("Tienda no encontrada");
    await ctx.db.patch(args.id, { activa: args.activa, updatedAt: Date.now() });
    await audit(ctx, {
      tiendaId: args.id,
      accion: "actualizar",
      entidad: "tienda",
      entidadId: args.id,
      antes: { activa: tienda.activa },
      despues: { activa: args.activa },
    });
  },
});

export const reasignarJefeEntrenador = mutation({
  args: {
    sessionAdminId: v.id("admins"),
    tiendaId: v.id("tiendas"),
    nuevoJefeEntrenadorId: v.id("jefesEntrenador"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, { kind: "admin", id: args.sessionAdminId });
    const tienda = await ctx.db.get(args.tiendaId);
    if (!tienda) throw new Error("Tienda no encontrada");
    const je = await ctx.db.get(args.nuevoJefeEntrenadorId);
    if (!je || !je.activo) throw new Error("JE no encontrado o inactivo");
    const antes = { jefeEntrenadorId: tienda.jefeEntrenadorId };
    await ctx.db.patch(args.tiendaId, {
      jefeEntrenadorId: args.nuevoJefeEntrenadorId,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "actualizar",
      entidad: "tienda",
      entidadId: args.tiendaId,
      antes,
      despues: { jefeEntrenadorId: args.nuevoJefeEntrenadorId },
    });
  },
});

// Compatibilidad con seed/migración
export const ensureTiendaDefault = internalMutation({
  args: {
    nombre: v.string(),
    codigo: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tiendas")
      .withIndex("by_codigo", (q) => q.eq("codigo", args.codigo))
      .first();
    if (existing) return existing._id;
    return existing;
  },
});

// Legacy: usado solo por código muy viejo, se mantiene firma
export const createTienda = mutation({
  args: {
    nombre: v.string(),
    codigo: v.string(),
  },
  handler: async (_ctx, _args) => {
    throw new Error(
      "createTienda (legacy) está deprecado. Usa createTiendaFull desde /admin/tiendas (requiere sesión Admin).",
    );
  },
});
