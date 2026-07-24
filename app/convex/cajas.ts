import { v } from "convex/values";
import { mutation, query, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./auditoria";

// ============================
// CAJAS (configuración de las 30 cajas)
// ============================
export const listCajas = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("cajas")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
  },
});

// Crear/asegurarse las 30 cajas (idempotente, no requiere auth)
export const ensureCajas = mutation({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cajas")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    if (existing.length >= 30) return existing;
    const toCreate: { codigo: number; tipo: "regular" | "rapida" | "autoservicio"; preferencial: boolean }[] = [];
    for (let i = 1; i <= 18; i++) {
      toCreate.push({ codigo: i, tipo: "regular", preferencial: i === 1 });
    }
    for (let i = 19; i <= 24; i++) {
      toCreate.push({ codigo: i, tipo: "rapida", preferencial: false });
    }
    for (let i = 25; i <= 30; i++) {
      toCreate.push({ codigo: i, tipo: "autoservicio", preferencial: false });
    }
    for (const c of toCreate) {
      const dup = existing.find((e) => e.codigo === c.codigo);
      if (!dup) {
        await ctx.db.insert("cajas", { tiendaId: args.tiendaId, ...c });
      }
    }
    return await ctx.db
      .query("cajas")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
  },
});

// ============================
// FUNCIONES SECUNDARIAS
// ============================
export const listFunciones = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("funcionesSecundarias")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
  },
});

export const createFuncion = mutation({
  args: { tiendaId: v.id("tiendas"), nombre: v.string(), color: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.insert("funcionesSecundarias", {
      tiendaId: args.tiendaId,
      nombre: args.nombre,
      color: args.color,
    });
  },
});

// ============================
// ASIGNACIONES DE CAJA
// ============================
export const listAsignaciones = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("asignacionesCaja")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

export const upsertAsignacion = mutation({
  args: {
    id: v.optional(v.id("asignacionesCaja")),
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    cajaId: v.optional(v.id("cajas")),
    personalId: v.id("personales"),
    horaInicio: v.string(),
    horaFin: v.string(),
    bloque: v.number(),
    funcionSecundaria: v.optional(v.id("funcionesSecundarias")),
    observaciones: v.optional(v.string()),
    estado: v.optional(
      v.union(
        v.literal("activa"),
        v.literal("refrigerio"),
        v.literal("inasistencia"),
        v.literal("finalizada"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    if (args.id) {
      const updates: any = {
        personalId: args.personalId,
        horaInicio: args.horaInicio,
        horaFin: args.horaFin,
        bloque: args.bloque,
        funcionSecundaria: args.funcionSecundaria,
        observaciones: args.observaciones,
        updatedAt: Date.now(),
      };
      // cajaId se puede setear a undefined explícitamente para limpiarlo
      if ("cajaId" in args) updates.cajaId = args.cajaId;
      else updates.cajaId = undefined;
      if (args.estado) updates.estado = args.estado;
      await ctx.db.patch(args.id, updates);
      return args.id;
    }
    return await ctx.db.insert("asignacionesCaja", {
      tiendaId: args.tiendaId,
      fecha: args.fecha,
      cajaId: args.cajaId,
      personalId: args.personalId,
      horaInicio: args.horaInicio,
      horaFin: args.horaFin,
      bloque: args.bloque,
      funcionSecundaria: args.funcionSecundaria,
      observaciones: args.observaciones,
      estado: args.estado ?? "activa",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const cambiarCaja = mutation({
  args: {
    asignacionId: v.id("asignacionesCaja"),
    nuevaCajaId: v.id("cajas"),
    nuevaHoraInicio: v.optional(v.string()),
    nuevaHoraFin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.asignacionId);
    if (!before) throw new Error("Asignación no encontrada");
    await ctx.db.patch(args.asignacionId, {
      cajaId: args.nuevaCajaId,
      horaInicio: args.nuevaHoraInicio ?? before.horaInicio,
      horaFin: args.nuevaHoraFin ?? before.horaFin,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "asignacionesCaja",
      entidadId: args.asignacionId,
      antes: before,
      despues: { cajaId: args.nuevaCajaId },
    });
  },
});

// Intercambiar dos personas entre cajas (swap)
export const swapCajas = mutation({
  args: {
    asignacionId1: v.id("asignacionesCaja"),
    asignacionId2: v.id("asignacionesCaja"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (args.asignacionId1 === args.asignacionId2) return;
    const a1 = await ctx.db.get(args.asignacionId1);
    const a2 = await ctx.db.get(args.asignacionId2);
    if (!a1 || !a2) throw new Error("Asignación no encontrada");
    if (!a1.cajaId || !a2.cajaId) {
      throw new Error("Solo se pueden intercambiar asignaciones de caja");
    }
    const a1Caja = a1.cajaId;
    const a2Caja = a2.cajaId;
    await ctx.db.patch(args.asignacionId1, { cajaId: a2Caja, updatedAt: Date.now() });
    await ctx.db.patch(args.asignacionId2, { cajaId: a1Caja, updatedAt: Date.now() });
    await audit(ctx, {
      tiendaId: a1.tiendaId,
      accion: "actualizar",
      entidad: "asignacionesCaja",
      entidadId: args.asignacionId1,
      antes: { cajaId: a1Caja },
      despues: { cajaId: a2Caja },
    });
    await audit(ctx, {
      tiendaId: a2.tiendaId,
      accion: "actualizar",
      entidad: "asignacionesCaja",
      entidadId: args.asignacionId2,
      antes: { cajaId: a2Caja },
      despues: { cajaId: a1Caja },
    });
  },
});

// Intercambiar dos personas entre tareas secundarias (swap)
export const swapTareas = mutation({
  args: {
    asignacionId1: v.id("asignacionesCaja"),
    asignacionId2: v.id("asignacionesCaja"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (args.asignacionId1 === args.asignacionId2) return;
    const a1 = await ctx.db.get(args.asignacionId1);
    const a2 = await ctx.db.get(args.asignacionId2);
    if (!a1 || !a2) throw new Error("Asignación no encontrada");
    if (!a1.funcionSecundaria || !a2.funcionSecundaria) {
      throw new Error("Solo se pueden intercambiar asignaciones de tarea");
    }
    const a1Func = a1.funcionSecundaria;
    const a2Func = a2.funcionSecundaria;
    await ctx.db.patch(args.asignacionId1, { funcionSecundaria: a2Func, updatedAt: Date.now() });
    await ctx.db.patch(args.asignacionId2, { funcionSecundaria: a1Func, updatedAt: Date.now() });
    await audit(ctx, {
      tiendaId: a1.tiendaId,
      accion: "actualizar",
      entidad: "asignacionesCaja",
      entidadId: args.asignacionId1,
      antes: { funcionSecundaria: a1Func },
      despues: { funcionSecundaria: a2Func },
    });
    await audit(ctx, {
      tiendaId: a2.tiendaId,
      accion: "actualizar",
      entidad: "asignacionesCaja",
      entidadId: args.asignacionId2,
      antes: { funcionSecundaria: a2Func },
      despues: { funcionSecundaria: a1Func },
    });
  },
});

export const setEstado = mutation({
  args: {
    asignacionId: v.id("asignacionesCaja"),
    estado: v.union(
      v.literal("activa"),
      v.literal("refrigerio"),
      v.literal("inasistencia"),
      v.literal("finalizada"),
    ),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    // Si se marca como finalizada, eliminar el registro completamente
    if (args.estado === "finalizada") {
      await ctx.db.delete(args.asignacionId);
      return;
    }
    await ctx.db.patch(args.asignacionId, {
      estado: args.estado,
      observaciones: args.observaciones,
      updatedAt: Date.now(),
    });
  },
});

// Limpiar todo el tablero de un día
export const limpiarTablero = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
  },
  handler: async (ctx, args) => {
    const asignaciones = await ctx.db
      .query("asignacionesCaja")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
    for (const a of asignaciones) {
      await ctx.db.delete(a._id);
    }
    return { eliminadas: asignaciones.length };
  },
});

// Asignar personal SOLO a una tarea secundaria (sin caja)
export const asignarSoloTarea = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    personalId: v.id("personales"),
    funcionSecundariaId: v.id("funcionesSecundarias"),
    horaInicio: v.string(),
    horaFin: v.string(),
  },
  handler: async (ctx, args) => {
    // Buscar asignaciones existentes en esta franja
    const existing = await ctx.db
      .query("asignacionesCaja")
      .withIndex("by_personal_fecha", (q) =>
        q.eq("personalId", args.personalId).eq("fecha", args.fecha),
      )
      .filter((a: any) => a.horaInicio <= args.horaInicio && a.horaFin > args.horaInicio)
      .collect();
    // Si ya tiene una tarea (sin caja), actualizarla
    const tareaExistente = existing.find((a) => !a.cajaId && a.funcionSecundaria);
    if (tareaExistente) {
      await ctx.db.patch(tareaExistente._id, {
        funcionSecundaria: args.funcionSecundariaId,
        estado: "activa",
        updatedAt: Date.now(),
      });
      return tareaExistente._id;
    }
    // Si no tiene tarea, crear una nueva (no toca la asignación de caja si existe)
    return await ctx.db.insert("asignacionesCaja", {
      tiendaId: args.tiendaId,
      fecha: args.fecha,
      cajaId: undefined,
      personalId: args.personalId,
      horaInicio: args.horaInicio,
      horaFin: args.horaFin,
      bloque: 1,
      funcionSecundaria: args.funcionSecundariaId,
      estado: "activa",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const deleteAsignacion = mutation({
  args: { id: v.id("asignacionesCaja") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.delete(args.id);
  },
});

// ============================
// LOG ALGORITMO
// ============================
export const listLog = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("logAlgoritmoCajas")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .order("desc")
      .collect();
  },
});
