import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./logs";
import { Id } from "./_generated/dataModel";

const diaSemanaMap: Record<number, "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom"> = {
  1: "lun",
  2: "mar",
  3: "mie",
  4: "jue",
  5: "vie",
  6: "sab",
  0: "dom",
};

function dayOfWeek(fecha: string): "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom" {
  // fecha: YYYY-MM-DD -> parse como local para evitar off-by-one de UTC
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return diaSemanaMap[dt.getDay()]!;
}

function fechaToDate(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isFutureOrToday(fecha: string, today: string): boolean {
  return fecha >= today;
}

// ============================
// TAREAS RECURRENTES (plantillas)
// ============================

export const listRecurrentes = query({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("tareasRecurrentes")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
  },
});

export const createRecurrente = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    horaSugerida: v.optional(v.string()),
    patron: v.union(
      v.literal("diaria"),
      v.literal("laborables"),
      v.literal("finde"),
      v.literal("personalizada")
    ),
    diasSemana: v.optional(
      v.array(
        v.union(
          v.literal("lun"),
          v.literal("mar"),
          v.literal("mie"),
          v.literal("jue"),
          v.literal("vie"),
          v.literal("sab"),
          v.literal("dom")
        )
      )
    ),
    modoAsignacion: v.union(
      v.literal("manual"),
      v.literal("rotativa"),
      v.literal("compartida")
    ),
    poolIds: v.optional(v.array(v.id("personales"))),
    asignadosFijosIds: v.optional(v.array(v.id("personales"))),
    rotativoSentido: v.optional(
      v.union(v.literal("secuencial"), v.literal("aleatorio"))
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserProfile(ctx);

    if (args.patron === "personalizada" && (!args.diasSemana || args.diasSemana.length === 0)) {
      throw new Error("Selecciona al menos un día de la semana.");
    }
    if (args.modoAsignacion === "rotativa" || args.modoAsignacion === "compartida") {
      if (!args.poolIds || args.poolIds.length === 0) {
        throw new Error("Selecciona al menos una persona para el pool.");
      }
    }
    if (args.modoAsignacion === "manual" && (!args.asignadosFijosIds || args.asignadosFijosIds.length === 0)) {
      throw new Error("Selecciona al menos una persona asignada.");
    }

    const id = await ctx.db.insert("tareasRecurrentes", {
      tiendaId: args.tiendaId,
      titulo: args.titulo,
      descripcion: args.descripcion,
      horaSugerida: args.horaSugerida,
      activa: true,
      patron: args.patron,
      diasSemana: args.diasSemana,
      modoAsignacion: args.modoAsignacion,
      poolIds: args.poolIds,
      asignadosFijosIds: args.asignadosFijosIds,
      rotativoIndice: 0,
      rotativoSentido: args.rotativoSentido ?? "secuencial",
    });

    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "tareasRecurrentes",
      entidadId: id,
      despues: { titulo: args.titulo, patron: args.patron },
    });

    return id;
  },
});

export const updateRecurrente = mutation({
  args: {
    id: v.id("tareasRecurrentes"),
    titulo: v.optional(v.string()),
    descripcion: v.optional(v.string()),
    horaSugerida: v.optional(v.string()),
    activa: v.optional(v.boolean()),
    patron: v.optional(
      v.union(
        v.literal("diaria"),
        v.literal("laborables"),
        v.literal("finde"),
        v.literal("personalizada")
      )
    ),
    diasSemana: v.optional(
      v.array(
        v.union(
          v.literal("lun"),
          v.literal("mar"),
          v.literal("mie"),
          v.literal("jue"),
          v.literal("vie"),
          v.literal("sab"),
          v.literal("dom")
        )
      )
    ),
    modoAsignacion: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("rotativa"),
        v.literal("compartida")
      )
    ),
    poolIds: v.optional(v.array(v.id("personales"))),
    asignadosFijosIds: v.optional(v.array(v.id("personales"))),
    rotativoSentido: v.optional(
      v.union(v.literal("secuencial"), v.literal("aleatorio"))
    ),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { id, ...rest } = args;
    const before = await ctx.db.get(id);
    if (!before) throw new Error("No encontrada");
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) return;
    await ctx.db.patch(id, updates);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "tareasRecurrentes",
      entidadId: id,
      antes: before,
      despues: { ...before, ...updates },
    });
  },
});

export const deleteRecurrente = mutation({
  args: { id: v.id("tareasRecurrentes") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) return;
    const instancias = await ctx.db
      .query("tareasInstancia")
      .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", before.tiendaId))
      .filter((q) => q.eq(q.field("recurrenteId"), args.id))
      .collect();
    for (const inst of instancias) {
      await ctx.db.delete(inst._id);
    }
    await ctx.db.delete(args.id);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "eliminar",
      entidad: "tareasRecurrentes",
      entidadId: args.id,
      antes: before,
    });
  },
});

// Materializar instancias para un rango de fechas (idempotente)
export const materializarInstancias = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    from: v.string(), // YYYY-MM-DD inclusive
    to: v.string(),   // YYYY-MM-DD inclusive
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    if (args.to < args.from) return { creadas: 0 };

    const recurrentes = await ctx.db
      .query("tareasRecurrentes")
      .withIndex("by_tienda_activa", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("activa", true)
      )
      .collect();

    // Pre-cargar todas las instancias del rango
    const existentes = await ctx.db
      .query("tareasInstancia")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId)
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("fecha"), args.from),
          q.lte(q.field("fecha"), args.to)
        )
      )
      .collect();
    const existentesPorRecurrente = new Map<string, Set<string>>();
    for (const e of existentes) {
      if (!e.recurrenteId) continue;
      if (!existentesPorRecurrente.has(e.recurrenteId)) {
        existentesPorRecurrente.set(e.recurrenteId, new Set());
      }
      existentesPorRecurrente.get(e.recurrenteId)!.add(e.fecha);
    }

    let creadas = 0;
    const cursor = fechaToDate(args.from);
    const fin = fechaToDate(args.to);
    const fmtLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    while (cursor <= fin) {
      const fecha = fmtLocal(cursor);
      const dow = dayOfWeek(fecha);
      cursor.setDate(cursor.getDate() + 1);

      for (const r of recurrentes) {
        if (r.skippedDates && r.skippedDates.length > 0) {
          if (r.skippedDates.includes(fecha)) continue;
        }
        // ¿Aplica el patrón este día?
        let aplica = false;
        if (r.patron === "diaria") aplica = true;
        else if (r.patron === "laborables") aplica = dow !== "sab" && dow !== "dom";
        else if (r.patron === "finde") aplica = dow === "sab" || dow === "dom";
        else if (r.patron === "personalizada")
          aplica = r.diasSemana?.includes(dow) ?? false;
        if (!aplica) continue;

        // Idempotencia por (recurrenteId, fecha)
        const set = existentesPorRecurrente.get(r._id);
        if (set?.has(fecha)) continue;

        // Resolver responsable / colaboradores según modo
        let responsableId: Id<"personales"> | undefined;
        let colaboradoresIds: Id<"personales">[] = [];
        let asignadosIds: Id<"personales">[] = [];

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
          tiendaId: args.tiendaId,
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
        creadas++;
        if (!existentesPorRecurrente.has(r._id)) {
          existentesPorRecurrente.set(r._id, new Set());
        }
        existentesPorRecurrente.get(r._id)!.add(fecha);
      }
    }
    return { creadas };
  },
});

// ============================
// TAREAS INSTANCIA
// ============================

export const listInstancias = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("tareasInstancia")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha)
      )
      .collect();
  },
});

export const listInstanciasAgrupadasPorResponsable = query({
  args: { tiendaId: v.id("tiendas"), fecha: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const inst = await ctx.db
      .query("tareasInstancia")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha)
      )
      .collect();
    const map = new Map<string, typeof inst>();
    for (const t of inst) {
      const key = t.responsableId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([responsableId, tareas]) => ({
      responsableId,
      tareas,
    }));
  },
});

export const listInstanciasPorFecha = query({
  args: {
    tiendaId: v.id("tiendas"),
    from: v.string(),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("tareasInstancia")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId)
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("fecha"), args.from),
          q.lte(q.field("fecha"), args.to)
        )
      )
      .collect();
  },
});

export const createInstancia = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    plazo: v.optional(v.string()),
    asignadosIds: v.array(v.id("personales")),
    responsableId: v.optional(v.id("personales")),
    colaboradoresIds: v.optional(v.array(v.id("personales"))),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUserProfile(ctx);
    if (args.asignadosIds.length === 0) {
      throw new Error("Selecciona al menos un asignado.");
    }
    const responsableId = args.responsableId ?? args.asignadosIds[0];
    const colaboradoresIds = args.colaboradoresIds ?? args.asignadosIds.slice(1);
    const id = await ctx.db.insert("tareasInstancia", {
      tiendaId: args.tiendaId,
      fecha: args.fecha,
      titulo: args.titulo,
      descripcion: args.descripcion,
      plazo: args.plazo,
      asignadosIds: args.asignadosIds,
      completadosIds: [],
      responsableId,
      colaboradoresIds,
      estado: "pendiente",
      createdBy: user?._id,
      createdAt: Date.now(),
    });
    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "tareasInstancia",
      entidadId: id,
      despues: { titulo: args.titulo, fecha: args.fecha },
    });
    return id;
  },
});

export const toggleCompletada = mutation({
  args: {
    tareaId: v.id("tareasInstancia"),
    personalId: v.id("personales"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const tarea = await ctx.db.get(args.tareaId);
    if (!tarea) throw new Error("Tarea no encontrada");
    const ya = tarea.completadosIds.includes(args.personalId);
    const nuevos = ya
      ? tarea.completadosIds.filter((id) => id !== args.personalId)
      : [...tarea.completadosIds, args.personalId];
    let estado: "pendiente" | "en_curso" | "completada" = "pendiente";
    if (nuevos.length === tarea.asignadosIds.length && tarea.asignadosIds.length > 0) {
      estado = "completada";
    } else if (nuevos.length > 0) {
      estado = "en_curso";
    }
    await ctx.db.patch(args.tareaId, {
      completadosIds: nuevos,
      estado,
    });
    await audit(ctx, {
      tiendaId: tarea.tiendaId,
      accion: "actualizar",
      entidad: "tareasInstancia",
      entidadId: args.tareaId,
      antes: { estado: tarea.estado, completadosIds: tarea.completadosIds },
      despues: { estado, completadosIds: nuevos },
    });
  },
});

export const reassignInstancia = mutation({
  args: {
    id: v.id("tareasInstancia"),
    responsableId: v.optional(v.id("personales")),
    colaboradoresIds: v.optional(v.array(v.id("personales"))),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("No encontrada");
    const updates: Record<string, any> = {
      responsableId: args.responsableId,
    };
    if (args.colaboradoresIds !== undefined) {
      updates.colaboradoresIds = args.colaboradoresIds;
    }
    // Mantener asignadosIds coherente
    const asignadosSet = new Set<Id<"personales">>(before.asignadosIds);
    if (args.responsableId) asignadosSet.add(args.responsableId);
    for (const c of args.colaboradoresIds ?? []) asignadosSet.add(c);
    updates.asignadosIds = Array.from(asignadosSet);
    await ctx.db.patch(args.id, updates);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "tareasInstancia",
      entidadId: args.id,
      antes: { responsableId: before.responsableId },
      despues: { responsableId: args.responsableId },
    });
  },
});

export const rolloverAtrasadas = mutation({
  args: { tiendaId: v.id("tiendas"), fecha: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ayer = new Date(fechaToDate(args.fecha));
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().slice(0, 10);
    const atrasadas = await ctx.db
      .query("tareasInstancia")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", ayerStr)
      )
      .filter((q) =>
        q.or(
          q.eq(q.field("estado"), "pendiente"),
          q.eq(q.field("estado"), "en_curso")
        )
      )
      .collect();
    let clonadas = 0;
    for (const t of atrasadas) {
      // Evitar duplicar si ya hay clon para hoy
      const yaHay = await ctx.db
        .query("tareasInstancia")
        .withIndex("by_tienda_fecha", (q) =>
          q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha)
        )
        .filter((q2) => q2.eq(q2.field("parentInstanciaId"), t._id))
        .first();
      if (yaHay) continue;
      await ctx.db.insert("tareasInstancia", {
        tiendaId: t.tiendaId,
        fecha: args.fecha,
        titulo: t.titulo,
        descripcion: t.descripcion,
        plazo: t.plazo,
        recurrenteId: undefined,
        asignadosIds: t.asignadosIds,
        completadosIds: [],
        responsableId: t.responsableId,
        colaboradoresIds: t.colaboradoresIds,
        parentInstanciaId: t._id,
        estado: "pendiente",
        createdBy: t.createdBy,
        createdAt: Date.now(),
      });
      clonadas++;
    }
    return { clonadas };
  },
});

export const updateAsignados = mutation({
  args: {
    tareaId: v.id("tareasInstancia"),
    asignadosIds: v.array(v.id("personales")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const tarea = await ctx.db.get(args.tareaId);
    if (!tarea) throw new Error("No encontrada");
    await ctx.db.patch(args.tareaId, { asignadosIds: args.asignadosIds });
  },
});

export const deleteInstancia = mutation({
  args: { id: v.id("tareasInstancia") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) return;
    if (before.recurrenteId) {
      const rec = await ctx.db.get(before.recurrenteId);
      if (rec) {
        const skipped = new Set(rec.skippedDates ?? []);
        skipped.add(before.fecha);
        await ctx.db.patch(rec._id, { skippedDates: Array.from(skipped) });
      }
    }
    await ctx.db.delete(args.id);
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "eliminar",
      entidad: "tareasInstancia",
      entidadId: args.id,
      antes: before,
    });
  },
});

export const moverInstancia = mutation({
  args: {
    id: v.id("tareasInstancia"),
    nuevaFecha: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Tarea no encontrada");
    if (before.fecha === args.nuevaFecha) return;
    await ctx.db.patch(args.id, { fecha: args.nuevaFecha });
    await audit(ctx, {
      tiendaId: before.tiendaId,
      accion: "actualizar",
      entidad: "tareasInstancia",
      entidadId: args.id,
      antes: { fecha: before.fecha },
      despues: { fecha: args.nuevaFecha },
    });
  },
});

export const rolloverInstancia = mutation({
  args: { id: v.id("tareasInstancia") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const t = await ctx.db.get(args.id);
    if (!t) throw new Error("Tarea no encontrada");
    const f = new Date(t.fecha + "T00:00:00");
    f.setDate(f.getDate() + 1);
    const nuevaFecha = f.toISOString().slice(0, 10);
    await ctx.db.patch(args.id, {
      fecha: nuevaFecha,
      estado: "pendiente",
      completadosIds: [],
    });
    await audit(ctx, {
      tiendaId: t.tiendaId,
      accion: "actualizar",
      entidad: "tareasInstancia",
      entidadId: args.id,
      antes: { fecha: t.fecha, estado: t.estado },
      despues: { fecha: nuevaFecha, estado: "pendiente" },
    });
  },
});

// Mantener compat: la página de tareas actual usa generarInstanciasDelDia
export const generarInstanciasDelDia = mutation({
  args: { tiendaId: v.id("tiendas"), fecha: v.string() },
  handler: async (ctx, args) => {
    const recurrentes = await ctx.db
      .query("tareasRecurrentes")
      .withIndex("by_tienda_activa", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("activa", true)
      )
      .collect();
    if (recurrentes.length === 0) return 0;

    const existentes = await ctx.db
      .query("tareasInstancia")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha)
      )
      .collect();
    const yaSet = new Set(
      existentes.filter((e) => e.recurrenteId).map((e) => e.recurrenteId!)
    );

    const cursor = fechaToDate(args.fecha);
    const dow = dayOfWeek(args.fecha);
    let creadas = 0;
    for (const r of recurrentes) {
      let aplica = false;
      if (r.patron === "diaria") aplica = true;
      else if (r.patron === "laborables") aplica = dow !== "sab" && dow !== "dom";
      else if (r.patron === "finde") aplica = dow === "sab" || dow === "dom";
      else if (r.patron === "personalizada")
        aplica = r.diasSemana?.includes(dow) ?? false;
      if (!aplica) continue;
      if (r.skippedDates?.includes(args.fecha)) continue;
      if (yaSet.has(r._id)) continue;

      let responsableId: Id<"personales"> | undefined;
      let colaboradoresIds: Id<"personales">[] = [];
      let asignadosIds: Id<"personales">[] = [];

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
        tiendaId: args.tiendaId,
        fecha: args.fecha,
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
      creadas++;
    }
    void cursor; // silenciar unused
    return creadas;
  },
});
