// Cobertura: devuelve los horarios agrupados por día y cargo
// para mostrar el mapa de cobertura del personal a lo largo del día
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./_helpers";

export const getCoberturaSemana = query({
  args: {
    tiendaId: v.id("tiendas"),
    semanaId: v.id("semanas"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const semana = await ctx.db.get(args.semanaId);
    if (!semana) return null;

    const personales = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();

    const horarios = await ctx.db
      .query("horarios")
      .withIndex("by_semana_dia", (q) => q.eq("semanaId", args.semanaId))
      .collect();

    // Agrupar: { [dia]: { [cargo]: { [personalId]: { entrada, salida, descanso } } } }
    type Horario = { entrada: string; salida: string; descanso: boolean };
    type PorDia = { [cargo: string]: { [personalId: string]: Horario } };
    const porDiaCargo: Record<number, PorDia> = {};
    for (let d = 1; d <= 7; d++) porDiaCargo[d] = {};

    for (const h of horarios) {
      if (h.descanso) continue;
      const persona = personales.find((p) => p._id === h.personalId);
      if (!persona) continue;
      if (!h.entrada || !h.salida) continue;
      if (!porDiaCargo[h.dia][persona.cargo]) porDiaCargo[h.dia][persona.cargo] = {};
      porDiaCargo[h.dia][persona.cargo][persona._id] = {
        entrada: h.entrada,
        salida: h.salida,
        descanso: h.descanso,
      };
    }

    // Para cada (día, cargo) devolver la lista de personas
    type PersonaConHorario = {
      personalId: string;
      apellidos: string;
      nombres: string;
      nick: string;
      entrada: string;
      salida: string;
    };
    const resultado: Record<number, Record<string, PersonaConHorario[]>> = {};
    for (let d = 1; d <= 7; d++) {
      resultado[d] = {};
      for (const persona of personales) {
        if (!persona.activo) continue;
        const h = porDiaCargo[d][persona.cargo]?.[persona._id];
        if (!h) continue;
        resultado[d][persona.cargo] = resultado[d][persona.cargo] || [];
        resultado[d][persona.cargo].push({
          personalId: persona._id,
          apellidos: persona.apellidos,
          nombres: persona.nombres,
          nick: persona.nick,
          entrada: h.entrada,
          salida: h.salida,
        });
      }
      // Ordenar personas por entrada
      for (const cargo in resultado[d]) {
        resultado[d][cargo].sort((a, b) => a.entrada.localeCompare(b.entrada));
      }
    }

    return {
      semana,
      resultado,
    };
  },
});
