import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./auditoria";

// ============================
// Semanas
// ============================
export const getOrCreateSemanaActual = mutation({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    // Calcular lunes de la semana actual (asumiendo zona horaria ya manejada por el cliente)
    const now = new Date();
    // Semana inicia en lunes
    const day = now.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // si es domingo (0), retroceder 6
    const lunes = new Date(now);
    lunes.setUTCDate(lunes.getUTCDate() + diff);
    const fechaInicio = lunes.toISOString().slice(0, 10);
    const fechaFinDate = new Date(lunes);
    fechaFinDate.setUTCDate(fechaFinDate.getUTCDate() + 6);
    const fechaFin = fechaFinDate.toISOString().slice(0, 10);

    const existing = await ctx.db
      .query("semanas")
      .withIndex("by_tienda_inicio", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fechaInicio", fechaInicio),
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("semanas", {
      tiendaId: args.tiendaId,
      fechaInicio,
      fechaFin,
      estado: "borrador",
      createdAt: Date.now(),
    });
  },
});

export const getSemana = query({
  args: { id: v.id("semanas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.get(args.id);
  },
});

export const listSemanas = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("semanas")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .order("desc")
      .collect();
  },
});

export const publicarSemana = mutation({
  args: { id: v.id("semanas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Semana no encontrada");
    await ctx.db.patch(args.id, { estado: "publicada" });
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "semanas",
      entidadId: args.id,
      antes: before,
      despues: { ...before, estado: "publicada" },
    });
  },
});

export const clonarSemana = mutation({
  args: {
    sourceSemanaId: v.id("semanas"),
    targetFechaInicio: v.string(), // YYYY-MM-DD lunes
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const source = await ctx.db.get(args.sourceSemanaId);
    if (!source) throw new Error("Semana origen no encontrada");

    // Calcular fechaFin
    const inicio = new Date(args.targetFechaInicio);
    const fin = new Date(inicio);
    fin.setUTCDate(fin.getUTCDate() + 6);
    const fechaFin = fin.toISOString().slice(0, 10);

    const newSemanaId = await ctx.db.insert("semanas", {
      tiendaId: source.tiendaId,
      fechaInicio: args.targetFechaInicio,
      fechaFin,
      estado: "borrador",
      createdAt: Date.now(),
    });

    // Clonar horarios
    const sourceHorarios = await ctx.db
      .query("horarios")
      .withIndex("by_semana_personal", (q) => q.eq("semanaId", source._id))
      .collect();
    for (const h of sourceHorarios) {
      await ctx.db.insert("horarios", {
        tiendaId: source.tiendaId,
        semanaId: newSemanaId,
        personalId: h.personalId,
        dia: h.dia,
        entrada: h.entrada,
        salida: h.salida,
        descanso: h.descanso,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return newSemanaId;
  },
});

// ============================
// Horarios
// ============================
export const getHorario = query({
  args: {
    semanaId: v.id("semanas"),
    personalId: v.id("personales"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("horarios")
      .withIndex("by_semana_personal", (q) =>
        q.eq("semanaId", args.semanaId).eq("personalId", args.personalId),
      )
      .collect();
  },
});

export const getHorariosSemana = query({
  args: { semanaId: v.id("semanas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("horarios")
      .withIndex("by_semana_dia", (q) => q.eq("semanaId", args.semanaId))
      .collect();
  },
});

export const setDia = mutation({
  args: {
    semanaId: v.id("semanas"),
    personalId: v.id("personales"),
    dia: v.number(),
    entrada: v.optional(v.string()),
    salida: v.optional(v.string()),
    descanso: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const semana = await ctx.db.get(args.semanaId);
    if (!semana) throw new Error("Semana no encontrada");

    // Si no hay horas reales (entrada y salida vacías), eliminar el registro
    // para que la celda aparezca como vacía y la persona cuente como "sin horario".
    const sinHoras = !args.entrada && !args.salida;

    const existing = await ctx.db
      .query("horarios")
      .withIndex("by_semana_personal", (q) =>
        q.eq("semanaId", args.semanaId).eq("personalId", args.personalId),
      )
      .filter((q) => q.eq(q.field("dia"), args.dia))
      .first();

    if (existing) {
      if (sinHoras) {
        await ctx.db.delete(existing._id);
        return existing._id;
      }
      await ctx.db.patch(existing._id, {
        entrada: args.entrada,
        salida: args.salida,
        descanso: args.descanso,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("horarios", {
      tiendaId: semana.tiendaId,
      semanaId: args.semanaId,
      personalId: args.personalId,
      dia: args.dia,
      entrada: args.entrada,
      salida: args.salida,
      descanso: args.descanso,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Pegado masivo desde texto
export const importarMasivo = mutation({
  args: {
    semanaId: v.id("semanas"),
    lineas: v.array(
      v.object({
        nombreCompleto: v.string(),
        dias: v.array(
          v.object({
            entrada: v.optional(v.string()),
            salida: v.optional(v.string()),
            descanso: v.boolean(),
          }),
        ),
      }),
    ),
    modo: v.union(v.literal("reemplazar"), v.literal("fusionar")),
  },
  handler: async (ctx, args) => {
    const { user, profile } = await requireUserProfile(ctx);
    const semana = await ctx.db.get(args.semanaId);
    if (!semana) throw new Error("Semana no encontrada");

    // Indexar personales por nombre completo
    const allPersonales = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", semana.tiendaId))
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();

    function norm(s: string) {
      return s.toUpperCase().replace(/\s+/g, " ").trim();
    }

    const nameMap = new Map<string, typeof allPersonales[number]>();
    for (const p of allPersonales) {
      const key1 = norm(`${p.apellidos} ${p.nombres}`);
      const key2 = norm(`${p.nombres} ${p.apellidos}`);
      nameMap.set(key1, p);
      nameMap.set(key2, p);
      // también por nick
      nameMap.set(norm(p.nick), p);
    }

    let actualizados = 0;
    let creados = 0;
    const errores: { linea: number; nombre: string; error: string }[] = [];

    for (let i = 0; i < args.lineas.length; i++) {
      const linea = args.lineas[i];
      const key = norm(linea.nombreCompleto);
      const persona = nameMap.get(key);
      if (!persona) {
        errores.push({ linea: i + 1, nombre: linea.nombreCompleto, error: "No encontrado" });
        continue;
      }
      for (let dia = 1; dia <= 7; dia++) {
        const diaData = linea.dias[dia - 1];
        if (!diaData) continue;
        // En modo fusionar, saltar si el día está vacío
        if (args.modo === "fusionar" && !diaData.entrada && !diaData.salida && !diaData.descanso) {
          continue;
        }
        const existing = await ctx.db
          .query("horarios")
          .withIndex("by_semana_personal", (q) =>
            q.eq("semanaId", args.semanaId).eq("personalId", persona._id),
          )
          .filter((q) => q.eq(q.field("dia"), dia))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, {
            entrada: diaData.entrada,
            salida: diaData.salida,
            descanso: diaData.descanso,
            updatedAt: Date.now(),
          });
          actualizados++;
        } else {
          await ctx.db.insert("horarios", {
            tiendaId: semana.tiendaId,
            semanaId: args.semanaId,
            personalId: persona._id,
            dia,
            entrada: diaData.entrada,
            salida: diaData.salida,
            descanso: diaData.descanso,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          creados++;
        }
      }
    }
    await audit(ctx, {
      tiendaId: semana.tiendaId,
      accion: "actualizar",
      entidad: "horarios_masivo",
      entidadId: args.semanaId,
      despues: { modo: args.modo, actualizados, creados, errores: errores.length },
    });
    return { actualizados, creados, errores };
  },
});

// Limpiar semana
export const limpiarSemana = mutation({
  args: { semanaId: v.id("semanas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const semana = await ctx.db.get(args.semanaId);
    if (!semana) throw new Error("Semana no encontrada");
    const all = await ctx.db
      .query("horarios")
      .withIndex("by_semana_dia", (q) => q.eq("semanaId", args.semanaId))
      .collect();
    for (const h of all) await ctx.db.delete(h._id);
    await audit(ctx, {
      tiendaId: semana.tiendaId,
      accion: "eliminar",
      entidad: "horarios",
      entidadId: args.semanaId,
      despues: { count: all.length },
    });
    return all.length;
  },
});

// Limpiar TODO el horario de una persona en una semana (queda sin horario)
export const clearHorarioPersona = mutation({
  args: {
    semanaId: v.id("semanas"),
    personalId: v.id("personales"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("horarios")
      .withIndex("by_semana_personal", (q) =>
        q.eq("semanaId", args.semanaId).eq("personalId", args.personalId),
      )
      .collect();
    for (const h of all) await ctx.db.delete(h._id);
    return all.length;
  },
});
