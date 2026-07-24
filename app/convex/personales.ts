import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./auditoria";

const cargoEnum = v.union(
  v.literal("Cajer@"),
  v.literal("Self Checkout"),
  v.literal("RS"),
  v.literal("Ecommerce"),
  v.literal("Supervisor(@)"),
  v.literal("JefeCajas"),
  v.literal("SubGerente"),
  v.literal("Gerente"),
);

export const list = query({
  args: {
    tiendaId: v.id("tiendas"),
    cargo: v.optional(cargoEnum),
    soloActivos: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    let q = ctx.db
      .query("personales")
      .withIndex("by_tienda", (q2) => q2.eq("tiendaId", args.tiendaId));
    const all = await q.collect();
    let filtered = all.sort((a, b) => a.orden - b.orden);
    if (args.cargo) filtered = filtered.filter((p) => p.cargo === args.cargo);
    if (args.soloActivos ?? true)
      filtered = filtered.filter((p) => p.activo);
    return filtered;
  },
});

export const get = query({
  args: { id: v.id("personales") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    apellidos: v.string(),
    nombres: v.string(),
    nick: v.string(),
    cargo: cargoEnum,
    codigoEmpleado: v.optional(v.string()),
    codigoOperadorCaja: v.optional(v.string()),
    supervisorId: v.optional(v.id("personales")),
    soloCajaRapida: v.optional(v.boolean()),
    esAsistenteAutoservicio: v.optional(v.boolean()),
    autoServicioPreferencial: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserProfile(ctx);
    // Calcular orden siguiente
    const existing = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    const maxOrden = existing.reduce((m, p) => Math.max(m, p.orden), 0);
    const now = Date.now();
    const id = await ctx.db.insert("personales", {
      tiendaId: args.tiendaId,
      apellidos: args.apellidos.toUpperCase(),
      nombres: args.nombres.toUpperCase(),
      nick: args.nick,
      cargo: args.cargo,
      codigoEmpleado: args.codigoEmpleado,
      codigoOperadorCaja: args.codigoOperadorCaja,
      supervisorId: args.supervisorId,
      soloCajaRapida: args.soloCajaRapida ?? false,
      esAsistenteAutoservicio: args.esAsistenteAutoservicio ?? false,
      autoServicioPreferencial: args.autoServicioPreferencial,
      activo: true,
      orden: maxOrden + 1,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "personales",
      entidadId: id,
      despues: { apellidos: args.apellidos, nombres: args.nombres, cargo: args.cargo },
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("personales"),
    apellidos: v.optional(v.string()),
    nombres: v.optional(v.string()),
    nick: v.optional(v.string()),
    cargo: v.optional(cargoEnum),
    codigoEmpleado: v.optional(v.string()),
    codigoOperadorCaja: v.optional(v.string()),
    supervisorId: v.optional(v.id("personales")),
    soloCajaRapida: v.optional(v.boolean()),
    esAsistenteAutoservicio: v.optional(v.boolean()),
    autoServicioPreferencial: v.optional(v.boolean()),
    activo: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    await requireUser(ctx);
    const before = await ctx.db.get(id);
    if (!before) throw new Error("Personal no encontrado");
    const updates: Record<string, any> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) {
        if (k === "apellidos" || k === "nombres") updates[k] = String(v).toUpperCase();
        else updates[k] = v;
      }
    }
    await ctx.db.patch(id, updates);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "personales",
      entidadId: id,
      antes: before,
      despues: { ...before, ...updates },
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("personales") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Personal no encontrado");
    // Soft delete
    await ctx.db.patch(args.id, { activo: false, updatedAt: Date.now() });
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "eliminar",
      entidad: "personales",
      entidadId: args.id,
      antes: before,
    });
    return args.id;
  },
});

export const reorder = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    orderedIds: v.array(v.id("personales")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    for (let i = 0; i < args.orderedIds.length; i++) {
      await ctx.db.patch(args.orderedIds[i], { orden: i + 1 });
    }
  },
});

export const toggleSoloCajaRapida = mutation({
  args: { id: v.id("personales") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("No encontrado");
    await ctx.db.patch(args.id, {
      soloCajaRapida: !before.soloCajaRapida,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "personales",
      entidadId: args.id,
      antes: { soloCajaRapida: before.soloCajaRapida },
      despues: { soloCajaRapida: !before.soloCajaRapida },
    });
    return !before.soloCajaRapida;
  },
});

// Búsqueda por nombre (para pegado masivo de horarios)
export const searchByName = query({
  args: {
    tiendaId: v.id("tiendas"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();
    const q = args.query.toUpperCase().trim();
    if (!q) return all.slice(0, 50);
    return all
      .filter(
        (p) =>
          p.apellidos.includes(q) ||
          p.nombres.includes(q) ||
          p.nick.toUpperCase().includes(q),
      )
      .slice(0, 50);
  },
});

// Similitud Jaccard entre dos strings (basada en tokens)
function similitud(a: string, b: string): number {
  const a1 = a.toLowerCase().replace(/[^a-záéíóúñü\s]/g, "").trim();
  const b1 = b.toLowerCase().replace(/[^a-záéíóúñü\s]/g, "").trim();
  if (!a1 || !b1) return 0;
  if (a1 === b1) return 1;
  const tokensA = new Set(a1.split(/\s+/).filter((t) => t.length > 1));
  const tokensB = new Set(b1.split(/\s+/).filter((t) => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let inter = 0;
  for (const t of tokensA) if (tokensB.has(t)) inter++;
  const union = new Set([...tokensA, ...tokensB]).size;
  return inter / union;
}

// Pegado masivo TIPO 1: código empleado + nombre + apellidos
// Formato aceptado (por línea):
//   12345, JUAN, PEREZ LOPEZ
//   12345 | JUAN | PEREZ LOPEZ
//   12345, JUAN PEREZ LOPEZ  (sin coma: el primer token es código, el resto nombre completo)
// Si el código de empleado ya existe, se actualizan los datos.
export const pegarEmpleados = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    lineas: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existentes = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();
    const mapPorCodigo = new Map<string, any>();
    for (const p of existentes) {
      if (p.codigoEmpleado) mapPorCodigo.set(p.codigoEmpleado, p);
    }

    const creados: string[] = [];
    const actualizados: string[] = [];
    const errores: { linea: number; texto: string; error: string }[] = [];

    for (let i = 0; i < args.lineas.length; i++) {
      const linea = args.lineas[i].trim();
      if (!linea) continue;

      // Detectar separador: si tiene |, usar |; si tiene 3 comas, usar ,; si no, tratar como código + nombre completo
      let codigo = "";
      let nombre = "";
      let apellidos = "";

      if (linea.includes("|")) {
        const partes = linea.split("|").map((s) => s.trim());
        if (partes.length < 2) {
          errores.push({ linea: i + 1, texto: linea, error: "Faltan columnas" });
          continue;
        }
        codigo = partes[0];
        if (partes.length >= 3) {
          nombre = partes[1];
          apellidos = partes.slice(2).join(" ");
        } else {
          // "código | nombre completo"
          const nombreCompleto = partes[1];
          const tokens = nombreCompleto.split(/\s+/);
          if (tokens.length >= 3) {
            nombre = tokens[0];
            apellidos = tokens.slice(1).join(" ");
          } else {
            nombre = nombreCompleto;
          }
        }
      } else {
        // CSV con al menos 2 comas
        const partes = linea.split(",").map((s) => s.trim());
        if (partes.length >= 3) {
          codigo = partes[0];
          nombre = partes[1];
          apellidos = partes.slice(2).join(" ");
        } else if (partes.length === 2) {
          codigo = partes[0];
          const nombreCompleto = partes[1];
          const tokens = nombreCompleto.split(/\s+/);
          if (tokens.length >= 3) {
            nombre = tokens[0];
            apellidos = tokens.slice(1).join(" ");
          } else {
            nombre = nombreCompleto;
          }
        } else {
          errores.push({ linea: i + 1, texto: linea, error: "Faltan datos" });
          continue;
        }
      }

      if (!codigo) {
        errores.push({ linea: i + 1, texto: linea, error: "Sin código" });
        continue;
      }
      if (!nombre && !apellidos) {
        errores.push({ linea: i + 1, texto: linea, error: "Sin nombre" });
        continue;
      }

      const existing = mapPorCodigo.get(codigo);
      const now = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, {
          nombres: nombre || existing.nombres,
          apellidos: apellidos || existing.apellidos,
          nick: (nombre || existing.nombres).split(" ")[0],
        });
        actualizados.push(codigo);
      } else {
        // Necesita un cargo por defecto
        await ctx.db.insert("personales", {
          tiendaId: args.tiendaId,
          apellidos: apellidos || "(sin apellido)",
          nombres: nombre || "(sin nombre)",
          nick: (nombre || "S/N").split(" ")[0],
          cargo: "Cajer@",
          codigoEmpleado: codigo,
          soloCajaRapida: false,
          esAsistenteAutoservicio: false,
          activo: true,
          orden: 9999,
          createdAt: now,
          updatedAt: now,
        });
        creados.push(codigo);
        mapPorCodigo.set(codigo, { codigoEmpleado: codigo });
      }
    }
    return { creados, actualizados, errores };
  },
});

// Pegado masivo TIPO 2: código de operador de caja + nombre completo
// Formato aceptado (por línea):
//   C01, JUAN PEREZ LOPEZ
//   C01 | MARCELA YUPANQUI
// Se busca el personal por similitud de nombre (>= 95% Jaccard sobre tokens).
// Si encuentra match, actualiza su codigoOperadorCaja.
export const pegarOperadores = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    lineas: v.array(v.string()),
    umbralSimilitud: v.optional(v.number()), // 0..1, default 0.85 (≈ 95%)
  },
  handler: async (ctx, args) => {
    const personales = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();

    const umbral = args.umbralSimilitud ?? 0.85;
    const asignados: { codigoCaja: string; personalId: string; nombre: string; similitud: number }[] = [];
    const noEncontrados: { linea: number; texto: string; codigoCaja: string; mejorMatch?: { nombre: string; similitud: number } }[] = [];
    const actualizados: string[] = [];

    for (let i = 0; i < args.lineas.length; i++) {
      const linea = args.lineas[i].trim();
      if (!linea) continue;

      let codigoCaja = "";
      let nombreCompleto = "";

      if (linea.includes("|")) {
        const partes = linea.split("|").map((s) => s.trim());
        if (partes.length < 2) {
          noEncontrados.push({ linea: i + 1, texto: linea, codigoCaja: "" });
          continue;
        }
        codigoCaja = partes[0];
        nombreCompleto = partes.slice(1).join(" ");
      } else {
        const partes = linea.split(",").map((s) => s.trim());
        if (partes.length < 2) {
          noEncontrados.push({ linea: i + 1, texto: linea, codigoCaja: "" });
          continue;
        }
        codigoCaja = partes[0];
        nombreCompleto = partes.slice(1).join(" ");
      }

      if (!codigoCaja || !nombreCompleto) {
        noEncontrados.push({ linea: i + 1, texto: linea, codigoCaja });
        continue;
      }

      // Buscar mejor match por similitud Jaccard
      let best: { p: any; sim: number } | null = null;
      for (const p of personales) {
        const nombreCompletoP = `${p.nombres} ${p.apellidos}`.trim();
        const sim = similitud(nombreCompleto, nombreCompletoP);
        if (!best || sim > best.sim) best = { p, sim };
      }

      if (best && best.sim >= umbral) {
        await ctx.db.patch(best.p._id, {
          codigoOperadorCaja: codigoCaja,
          updatedAt: Date.now(),
        });
        asignados.push({
          codigoCaja,
          personalId: best.p._id,
          nombre: `${best.p.nombres} ${best.p.apellidos}`,
          similitud: best.sim,
        });
        actualizados.push(codigoCaja);
      } else {
        noEncontrados.push({
          linea: i + 1,
          texto: linea,
          codigoCaja,
          mejorMatch: best ? { nombre: `${best.p.nombres} ${best.p.apellidos}`, similitud: best.sim } : undefined,
        });
      }
    }
    return { asignados, noEncontrados, actualizados, umbral };
  },
});
