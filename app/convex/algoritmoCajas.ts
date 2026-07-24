import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser, requireUserProfile } from "./_helpers";
import { generarAsignaciones, type Caja, type Persona, type HorarioDia } from "./lib/algoritmoCajas";
import { Id } from "./_generated/dataModel";
import { audit } from "./auditoria";

// Ejecutar el algoritmo y guardar asignaciones + log
export const ejecutarAlgoritmo = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    // 1. Cargar cajas
    const cajas = await ctx.db
      .query("cajas")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();

    // 2. Cargar personales activos
    const personas = await ctx.db
      .query("personales")
      .withIndex("by_tienda_activo", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("activo", true),
      )
      .collect();

    // 3. Determinar la semana de la fecha y cargar horarios
    const fechaObj = new Date(args.fecha);
    const day = fechaObj.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const lunes = new Date(fechaObj);
    lunes.setUTCDate(lunes.getUTCDate() + diff);
    const fechaInicio = lunes.toISOString().slice(0, 10);

    const semana = await ctx.db
      .query("semanas")
      .withIndex("by_tienda_inicio", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fechaInicio", fechaInicio),
      )
      .first();

    const horariosMap = new Map<Id<"personales">, HorarioDia>();
    if (semana) {
      // dia de la semana: 1=lunes ... 7=domingo
      const diaSemana = day === 0 ? 7 : day;
      const horarios = await ctx.db
        .query("horarios")
        .withIndex("by_semana_dia", (q) => q.eq("semanaId", semana._id))
        .filter((q) => q.eq(q.field("dia"), diaSemana))
        .collect();
      for (const h of horarios) {
        if (!h.descanso && h.entrada && h.salida) {
          horariosMap.set(h.personalId, { entrada: h.entrada, salida: h.salida });
        }
      }
    }

    // 4. Ejecutar algoritmo
    const resultado = generarAsignaciones(
      cajas as Caja[],
      personas as Persona[],
      horariosMap,
      args.fecha,
    );

    // 5. Limpiar asignaciones previas del día
    const prev = await ctx.db
      .query("asignacionesCaja")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
    for (const a of prev) await ctx.db.delete(a._id);

    // 6. Limpiar log previo del día
    const prevLog = await ctx.db
      .query("logAlgoritmoCajas")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
    for (const l of prevLog) await ctx.db.delete(l._id);

    // 7. Guardar nuevas asignaciones
    const now = Date.now();
    for (const a of resultado.asignaciones) {
      await ctx.db.insert("asignacionesCaja", {
        tiendaId: args.tiendaId,
        fecha: args.fecha,
        cajaId: a.cajaId,
        personalId: a.personalId,
        horaInicio: a.horaInicio,
        horaFin: a.horaFin,
        bloque: a.bloque,
        estado: "activa",
        createdAt: now,
        updatedAt: now,
      });
    }

    // 8. Guardar log de decisiones
    for (const d of resultado.decisiones) {
      await ctx.db.insert("logAlgoritmoCajas", {
        tiendaId: args.tiendaId,
        fecha: args.fecha,
        personalId: d.personalId,
        cajaId: d.cajaId,
        decision: d.decision,
        detalle: d.detalle,
        createdAt: now,
      });
    }

    // 9. Auditoría
    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "asignacionesCaja",
      entidadId: args.fecha,
      despues: {
        count: resultado.asignaciones.length,
        huecos: resultado.huecos.length,
        errores: resultado.errores.length,
      },
    });

    return {
      asignacionesCreadas: resultado.asignaciones.length,
      huecos: resultado.huecos,
      decisiones: resultado.decisiones,
      errores: resultado.errores,
    };
  },
});

// Preview sin guardar (para mostrar antes de confirmar)
export const previewAlgoritmo = query({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const cajas = await ctx.db
      .query("cajas")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    const personas = await ctx.db
      .query("personales")
      .withIndex("by_tienda_activo", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("activo", true),
      )
      .collect();
    const fechaObj = new Date(args.fecha);
    const day = fechaObj.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const lunes = new Date(fechaObj);
    lunes.setUTCDate(lunes.getUTCDate() + diff);
    const fechaInicio = lunes.toISOString().slice(0, 10);
    const semana = await ctx.db
      .query("semanas")
      .withIndex("by_tienda_inicio", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fechaInicio", fechaInicio),
      )
      .first();
    const horariosMap = new Map<Id<"personales">, HorarioDia>();
    if (semana) {
      const diaSemana = day === 0 ? 7 : day;
      const horarios = await ctx.db
        .query("horarios")
        .withIndex("by_semana_dia", (q) => q.eq("semanaId", semana._id))
        .filter((q) => q.eq(q.field("dia"), diaSemana))
        .collect();
      for (const h of horarios) {
        if (!h.descanso && h.entrada && h.salida) {
          horariosMap.set(h.personalId, { entrada: h.entrada, salida: h.salida });
        }
      }
    }
    const resultado = generarAsignaciones(
      cajas as Caja[],
      personas as Persona[],
      horariosMap,
      args.fecha,
    );
    return resultado;
  },
});
