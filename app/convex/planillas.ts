import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./_helpers";
import { COLORES_CARGO, slotToTime, timeToSlot } from "./lib/slotTimes";
import { Id } from "./_generated/dataModel";

// Generar la planilla de entradas/salidas para un día
export const getPlanillaDia = query({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    // Calcular semana
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
    if (!semana) return null;

    const diaSemana = day === 0 ? 7 : day;
    const horarios = await ctx.db
      .query("horarios")
      .withIndex("by_semana_dia", (q) => q.eq("semanaId", semana._id))
      .filter((q) => q.eq(q.field("dia"), diaSemana))
      .collect();

    const personales = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();

    const personaMap = new Map<any, any>(personales.map((p: any) => [p._id, p]));

    type SlotEntry = { personalId: Id<"personales">; nombre: string; cargo: string; color: string; tipo: "entrada" | "salida" };
    const entradas: SlotEntry[][] = Array.from({ length: 73 }, () => []);
    const salidas: SlotEntry[][] = Array.from({ length: 73 }, () => []);

    const horariosValidos = horarios.filter(
      (h) => !h.descanso && !!h.entrada && !!h.salida && personaMap.has(h.personalId),
    );

    for (const h of horariosValidos) {
      const persona = personaMap.get(h.personalId)!;
      const slotE = timeToSlot(h.entrada);
      const slotS = timeToSlot(h.salida);
      const color = COLORES_CARGO[persona.cargo] ?? "999999";
      const label = persona.nick || persona.nombres.split(" ")[0];
      const ap = persona.apellidos.split(" ")[0];
      const display = `${ap} ${label}`;
      if (slotE >= 0 && slotE < 73) {
        entradas[slotE].push({
          personalId: persona._id,
          nombre: display,
          cargo: persona.cargo,
          color,
          tipo: "entrada",
        });
      }
      if (slotS >= 0 && slotS < 73) {
        salidas[slotS].push({
          personalId: persona._id,
          nombre: display,
          cargo: persona.cargo,
          color,
          tipo: "salida",
        });
      }
    }

    // Contar presentes por slot
    const conteoPresentes: number[] = [];
    for (let slot = 0; slot < 73; slot++) {
      // Presentes = entradas[i] con salida > slot y entrada <= slot
      let count = 0;
      for (const h of horariosValidos) {
        if (timeToSlot(h.entrada) <= slot && timeToSlot(h.salida) > slot) count++;
      }
      conteoPresentes.push(count);
    }

    return {
      entradas,
      salidas,
      conteoPresentes,
      intervalos: Array.from({ length: 73 }, (_, i) => slotToTime(i)),
    };
  },
});
