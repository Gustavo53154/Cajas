// Cron jobs de Convex
// Ver https://docs.convex.dev/scheduling/cron-jobs

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// Notificación semanal para actualizar meta de indicadores SIP
export const notificarMetaSemanal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tiendas = await ctx.db.query("tiendas").collect();
    for (const tienda of tiendas) {
      const profiles = await ctx.db
        .query("userProfiles")
        .withIndex("by_tienda", (q) => q.eq("tiendaId", tienda._id))
        .collect();
      for (const profile of profiles) {
        await ctx.db.insert("notificaciones", {
          tiendaId: tienda._id,
          usuarioId: profile.userId,
          tipo: "meta_semanal",
          titulo: "📊 Actualizar meta semanal de indicadores SIP",
          mensaje: "Es lunes. Ingresa las nuevas metas de débito y total para esta semana.",
          link: "/indicadores",
          leida: false,
          createdAt: Date.now(),
        });
      }
    }
    return { notificados: tiendas.length };
  },
});

// 00:05 Lima: materializar instancias de tareas recurrentes para los próximos 7 días
export const materializarTareasDiarias = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tiendas = await ctx.db.query("tiendas").collect();
    const today = new Date();
    const fmtLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const todayStr = fmtLocal(today);
    const fin = new Date(today);
    fin.setDate(fin.getDate() + 7);
    const finStr = fmtLocal(fin);

    let totalCreadas = 0;
    for (const t of tiendas) {
      // materializarInstancias está exportado, pero los crons deben usar
      // internalMutation; lo replicamos en línea para evitar imports circulares.
      const recurrentes = await ctx.db
        .query("tareasRecurrentes")
        .withIndex("by_tienda_activa", (q) =>
          q.eq("tiendaId", t._id).eq("activa", true)
        )
        .collect();
      if (recurrentes.length === 0) continue;

      const existentes = await ctx.db
        .query("tareasInstancia")
        .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", t._id))
        .filter((q) =>
          q.and(
            q.gte(q.field("fecha"), todayStr),
            q.lte(q.field("fecha"), finStr)
          )
        )
        .collect();
      const set = new Set<string>();
      for (const e of existentes) {
        if (e.recurrenteId) set.add(`${e.recurrenteId}|${e.fecha}`);
      }

      const cursor = new Date(today);
      while (cursor <= fin) {
        const fecha = fmtLocal(cursor);
        const dowNum = cursor.getDay();
        const dow = (["dom", "lun", "mar", "mie", "jue", "vie", "sab"][dowNum]) as
          | "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom";

        for (const r of recurrentes) {
          let aplica = false;
          if (r.patron === "diaria") aplica = true;
          else if (r.patron === "laborables") aplica = dow !== "sab" && dow !== "dom";
          else if (r.patron === "finde") aplica = dow === "sab" || dow === "dom";
          else if (r.patron === "personalizada")
            aplica = r.diasSemana?.includes(dow) ?? false;
          if (!aplica) continue;
          if (r.skippedDates?.includes(fecha)) continue;
          if (set.has(`${r._id}|${fecha}`)) continue;

          let responsableId: Id<"personales"> | undefined;
          let colaboradoresIds: any[] = [];
          let asignadosIds: any[] = [];

          if (r.modoAsignacion === "manual") {
            asignadosIds = r.asignadosFijosIds ?? [];
            if (asignadosIds.length === 0) continue;
            responsableId = asignadosIds[0];
            colaboradoresIds = asignadosIds.slice(1);
          } else {
            // rotativa o compartida: se crea sin responsable; el usuario lo elige del pool
            const pool = r.poolIds ?? [];
            if (pool.length === 0) continue;
            asignadosIds = pool;
          }

          await ctx.db.insert("tareasInstancia", {
            tiendaId: t._id,
            fecha,
            titulo: r.titulo,
            descripcion: r.descripcion,
            plazo: r.horaSugerida,
            recurrenteId: r._id,
            asignadosIds,
            completadosIds: [],
            responsableId,
            colaboradoresIds,
            estado: "pendiente",
            createdBy: undefined,
            createdAt: Date.now(),
          });
          set.add(`${r._id}|${fecha}`);
          totalCreadas++;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return { totalCreadas };
  },
});

// 23:55 Lima: marcar como vencidas las pendientes y hacer rollover al día siguiente
export const cerrarDiaYRoloverTareas = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tiendas = await ctx.db.query("tiendas").collect();
    const hoy = new Date();
    const hoyStr = hoy.toISOString().slice(0, 10);
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().slice(0, 10);

    let vencidas = 0;
    let rollover = 0;
    for (const t of tiendas) {
      // Marcar como vencidas las que quedaron pendientes o en_curso hoy
      const instHoy = await ctx.db
        .query("tareasInstancia")
        .withIndex("by_tienda_fecha", (q) =>
          q.eq("tiendaId", t._id).eq("fecha", ayerStr)
        )
        .collect();
      for (const inst of instHoy) {
        if (inst.estado === "completada") continue;
        if (inst.estado === "vencida") continue;
        await ctx.db.patch(inst._id, { estado: "vencida" });
        vencidas++;
        // Rollover: clonar a hoy si está pendiente o en_curso
        const yaHay = await ctx.db
          .query("tareasInstancia")
          .withIndex("by_tienda_fecha", (q) =>
            q.eq("tiendaId", t._id).eq("fecha", hoyStr)
          )
          .filter((q2) => q2.eq(q2.field("parentInstanciaId"), inst._id))
          .first();
        if (!yaHay) {
          await ctx.db.insert("tareasInstancia", {
            tiendaId: t._id,
            fecha: hoyStr,
            titulo: inst.titulo,
            descripcion: inst.descripcion,
            plazo: inst.plazo,
            recurrenteId: undefined,
            asignadosIds: inst.asignadosIds,
            completadosIds: [],
            responsableId: inst.responsableId,
            colaboradoresIds: inst.colaboradoresIds,
            parentInstanciaId: inst._id,
            estado: "pendiente",
            createdBy: inst.createdBy,
            createdAt: Date.now(),
          });
          rollover++;
        }
      }
    }
    return { vencidas, rollover };
  },
});

// Recordatorio de tareas pendientes para los supervisores (reemplaza el no-op anterior)
export const recordatorioTareas = internalMutation({
  args: {},
  handler: async (ctx) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const tiendas = await ctx.db.query("tiendas").collect();
    let notificados = 0;
    for (const t of tiendas) {
      const tareas = await ctx.db
        .query("tareasInstancia")
        .withIndex("by_tienda_fecha", (q) =>
          q.eq("tiendaId", t._id).eq("fecha", hoy)
        )
        .filter((q) => q.neq(q.field("estado"), "completada"))
        .collect();
      if (tareas.length === 0) continue;
      // Una sola notificación por tienda dirigida a todos los userProfiles
      const profiles = await ctx.db
        .query("userProfiles")
        .withIndex("by_tienda", (q) => q.eq("tiendaId", t._id))
        .collect();
      for (const p of profiles) {
        await ctx.db.insert("notificaciones", {
          tiendaId: t._id,
          usuarioId: p.userId,
          tipo: "tareas_pendientes",
          titulo: `📋 ${tareas.length} tarea(s) pendiente(s) hoy`,
          mensaje: tareas.map((x) => `• ${x.titulo}`).slice(0, 5).join("\n"),
          link: "/tareas",
          leida: false,
          createdAt: Date.now(),
        });
        notificados++;
      }
    }
    return { notificados };
  },
});

const crons = cronJobs();

// Lunes 12:00 PM UTC = 7:00 AM Lima
crons.weekly(
  "notificar meta semanal SIP",
  { dayOfWeek: "monday", hourUTC: 12, minuteUTC: 0 },
  internal.crons.notificarMetaSemanal,
  {}
);

// 00:05 Lima (05:05 UTC)
crons.daily(
  "materializar tareas recurrentes",
  { hourUTC: 5, minuteUTC: 5 },
  internal.crons.materializarTareasDiarias,
  {}
);

// 23:55 Lima (04:55 UTC del día siguiente)
crons.daily(
  "cerrar dia y rollover de tareas",
  { hourUTC: 4, minuteUTC: 55 },
  internal.crons.cerrarDiaYRoloverTareas,
  {}
);

// 08:00 Lima (13:00 UTC)
crons.daily(
  "recordatorio tareas pendientes",
  { hourUTC: 13, minuteUTC: 0 },
  internal.crons.recordatorioTareas,
  {}
);

export default crons;
