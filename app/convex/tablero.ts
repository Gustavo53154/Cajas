import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./_helpers";
import { Id } from "./_generated/dataModel";

// Tablero en vivo
// - Cajas 1-18: regulares (1 es preferencial)
// - Cajas 19-24: rápidas
// - Cajas 25-30: autoservicio (se tratan como UNA sola caja lógica, solo un personal)
export const getTablero = query({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    hora: v.string(), // "HH:MM"
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
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
    if (!semana) {
      return {
        disponibles: [],
        enCaja: [],
        enTareas: [],
        descansos: [],
        sinCobertura: [],
      };
    }

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
    const cajas = await ctx.db
      .query("cajas")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    // Orden de prioridad de cargos
    const CARGO_ORDER: Record<string, number> = {
      "Cajer@": 0,
      "Self Checkout": 1,
      "Ecommerce": 2,
      "RS": 3,
      "Supervisor(@)": 4,
      "JefeCajas": 5,
    };
    personales.sort((a: any, b: any) => {
      const oa = CARGO_ORDER[a.cargo] ?? 99;
      const ob = CARGO_ORDER[b.cargo] ?? 99;
      return oa - ob;
    });
    const cajaMap = new Map<any, any>(cajas.map((c: any) => [c._id, c]));
    const funciones = await ctx.db
      .query("funcionesSecundarias")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    const funcionMap = new Map<any, any>(funciones.map((f: any) => [f._id, f]));

    const asignaciones = await ctx.db
      .query("asignacionesCaja")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();

    const [hStr, mStr] = args.hora.split(":");
    const horaMin = parseInt(hStr) * 60 + parseInt(mStr);
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };

    type PersonaTablero = {
      personalId: Id<"personales">;
      nombre: string;
      cargo: string;
      nick: string;
      entrada?: string;
      salida?: string;
      soloCajaRapida: boolean;
      esAsistenteAutoservicio: boolean;
      asignacionId?: Id<"asignacionesCaja">;
      cajaId?: Id<"cajas">;
      cajaCodigo?: number;
      cajaTipo?: string;
      esAutoservicio?: boolean; // agrupado 25-30
      funcionSecundaria?: string;
      funcionSecundariaId?: Id<"funcionesSecundarias">;
      estado?: string;
    };

    const disponibles: PersonaTablero[] = [];
    const enCaja: PersonaTablero[] = [];
    const enTareas: PersonaTablero[] = [];
    const descansos: PersonaTablero[] = [];
    const sinCobertura: PersonaTablero[] = [];

    // Agrupar cajas 25-30 como "Autoservicio" (un solo bloque)
    const autoservicioBoxIds = new Set(
      cajas.filter((c: any) => c.tipo === "autoservicio").map((c: any) => c._id),
    );

    for (const h of horarios) {
      const persona = personaMap.get(h.personalId);
      if (!persona) continue;
      const label = `${persona.apellidos.split(" ")[0]} ${persona.nick || persona.nombres.split(" ")[0]}`;
      const base: PersonaTablero = {
        personalId: persona._id,
        nombre: label,
        cargo: persona.cargo,
        nick: persona.nick,
        entrada: h.entrada ?? undefined,
        salida: h.salida ?? undefined,
        soloCajaRapida: persona.soloCajaRapida,
        esAsistenteAutoservicio: persona.esAsistenteAutoservicio,
      };
      if (h.descanso || !h.entrada || !h.salida) {
        descansos.push({ ...base, estado: "DESCANSO" });
        continue;
      }
      const eMin = toMin(h.entrada);
      const sMin = toMin(h.salida);
      if (eMin <= horaMin && sMin > horaMin) {
        // Procesar TODAS las asignaciones que coincidan (caja y/o tarea por separado)
        const asigs = asignaciones.filter(
          (a) => a.personalId === persona._id && a.horaInicio <= args.hora && a.horaFin > args.hora,
        );
        if (asigs.length > 0) {
          for (const asig of asigs) {
            const caja = asig.cajaId ? cajaMap.get(asig.cajaId) : null;
            const funcion = asig.funcionSecundaria ? funcionMap.get(asig.funcionSecundaria) : null;
            const esAutoservicio = caja ? autoservicioBoxIds.has(caja._id) : false;
            const enriched: PersonaTablero = {
              ...base,
              asignacionId: asig._id,
              cajaId: asig.cajaId,
              cajaCodigo: caja?.codigo,
              cajaTipo: caja?.tipo,
              esAutoservicio: esAutoservicio || undefined,
              funcionSecundaria: funcion?.nombre,
              funcionSecundariaId: asig.funcionSecundaria,
              estado: asig.estado,
            };
            if (caja) {
              enCaja.push(enriched);
            } else if (funcion) {
              enTareas.push(enriched);
            }
          }
        } else {
          disponibles.push(base);
        }
      } else if (eMin > horaMin) {
        sinCobertura.push(base);
      }
    }

    // Ordenar disponibles: primero por tipo de personal (cargo), luego por hora de entrada
    disponibles.sort((a, b) => {
      const oa = CARGO_ORDER[a.cargo] ?? 99;
      const ob = CARGO_ORDER[b.cargo] ?? 99;
      if (oa !== ob) return oa - ob;
      const ea = a.entrada ? toMin(a.entrada) : 9999;
      const eb = b.entrada ? toMin(b.entrada) : 9999;
      return ea - eb;
    });
    // También ordenar enCaja por caja
    enCaja.sort((a, b) => {
      const ca = a.cajaCodigo ?? 999;
      const cb = b.cajaCodigo ?? 999;
      if (ca !== cb) return ca - cb;
      // Dentro de la misma caja, por entrada
      const ea = a.entrada ? toMin(a.entrada) : 9999;
      const eb = b.entrada ? toMin(b.entrada) : 9999;
      return ea - eb;
    });

    return { disponibles, enCaja, enTareas, descansos, sinCobertura };
  },
});
