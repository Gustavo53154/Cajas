// Cron jobs de Convex
// Ver https://docs.convex.dev/scheduling/cron-jobs

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";


// Notificación semanal para actualizar meta de indicadores SIP
// Se ejecuta cada lunes a las 7:00 AM hora Lima (UTC-5)
export const notificarMetaSemanal = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Obtener todas las tiendas
    const tiendas = await ctx.db.query("tiendas").collect();
    for (const tienda of tiendas) {
      // Obtener usuarios de la tienda
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

const crons = cronJobs();

// Lunes 12:00 PM UTC = 7:00 AM hora Lima (UTC-5)
crons.weekly(
  "notificar meta semanal SIP",
  { dayOfWeek: "monday", hourUTC: 12, minuteUTC: 0 },
  internal.crons.notificarMetaSemanal,
  {}
);

// Verificación diaria: si no hay horario para la semana actual, notificar
crons.daily(
  "recordatorio tareas diarias",
  { hourUTC: 13, minuteUTC: 0 }, // 8 AM Lima
  internal.crons.recordatorioTareas,
  {}
);

export const recordatorioTareas = internalMutation({
  args: {},
  handler: async (ctx) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const tareas = await ctx.db.query("tareasInstancia").collect();
    const tareasPendientes = tareas.filter(
      (t) => t.fecha === hoy && t.estado !== "completada",
    );
    // Por cada tarea pendiente, notificar a los asignados
    for (const tarea of tareasPendientes) {
      for (const personalId of tarea.asignadosIds) {
        const userProfile = await ctx.db
          .query("personales")
          .withIndex("by_tienda_cargo", (q) =>
            q.eq("tiendaId", tarea.tiendaId).eq("cargo", "Cajer@"),
          )
          .filter((q) => q.eq(q.field("_id"), personalId))
          .first();
        // Solo notificar si tiene userProfile (es supervisor/empleado con cuenta)
        if (!userProfile) continue;
        // En el MVP no notificamos a cajeros, solo a supervisores
      }
    }
    return { revisadas: tareasPendientes.length };
  },
});

export default crons;
