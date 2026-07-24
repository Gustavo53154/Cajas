import { v } from "convex/values";
import { query, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./_helpers";
import ExcelJS from "exceljs";

// ============================
// QUERIES AUXILIARES
// ============================

export const getSemana = internalQuery({
  args: { id: v.id("semanas") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ============================
// GENERACIÓN DE REPORTES
// ============================

// Genera un Excel con la distribución de cajeros en cajas por día
export const generarExcelUbicaciones = action({
  args: {
    tiendaId: v.id("tiendas"),
    semanaId: v.id("semanas"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    // Usar runQuery para acceder a la DB desde una action
    const semana = await ctx.runQuery(internal.reporteUbicaciones.getSemana, {
      id: args.semanaId,
    });
    if (!semana) throw new Error("Semana no encontrada");

    const cajas = await ctx.runQuery(internal.reporteUbicaciones.getCajasByTienda, {
      tiendaId: args.tiendaId,
    });

    const personales = await ctx.runQuery(internal.reporteUbicaciones.getPersonalesActivos, {
      tiendaId: args.tiendaId,
    });
    const personaMap = new Map(personales.map((p) => [p._id, p]));

    // Crear workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = "DreamTeam Cajas";
    wb.created = new Date();

    // Crear una hoja por día (7 días)
    for (let dia = 1; dia <= 7; dia++) {
      const fecha = new Date(semana.fechaInicio);
      fecha.setUTCDate(fecha.getUTCDate() + (dia - 1));
      const fechaStr = fecha.toISOString().slice(0, 10);
      const nombreDia = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"][dia - 1];

      const ws = wb.addWorksheet(`${nombreDia} ${fechaStr.slice(5)}`);

      // Cabecera
      ws.mergeCells("A1:H1");
      const titleCell = ws.getCell("A1");
      titleCell.value = `UBICACIONES DE CAJEROS - ${nombreDia} ${fechaStr}`;
      titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "003366" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 28;

      // Cabeceras de columna
      const headers = ["Caja", "Tipo", "Bloque", "Cajero", "Hora Inicio", "Hora Fin", "Función", "Obs"];
      const headerRow = ws.getRow(2);
      headerRow.values = headers;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "4472C4" } };
        cell.alignment = { horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Obtener asignaciones del día
      const asignaciones = await ctx.runQuery(internal.reporteUbicaciones.getAsignacionesDelDia, {
        tiendaId: args.tiendaId,
        fecha: fechaStr,
      });
      const cajasMap = new Map(cajas.map((c) => [c._id, c]));

      // Filas
      let rowIdx = 3;
      for (const a of asignaciones) {
        const caja = cajasMap.get(a.cajaId);
        const persona = personaMap.get(a.personalId);
        if (!caja || !persona) continue;

        const funcion = a.funcionSecundaria
          ? await ctx.runQuery(internal.reporteUbicaciones.getFuncion, { id: a.funcionSecundaria })
          : null;

        const row = ws.getRow(rowIdx);
        row.values = [
          caja.codigo + (caja.preferencial ? " ⭐" : ""),
          caja.tipo,
          a.bloque,
          `${persona.apellidos} ${persona.nombres}`,
          a.horaInicio,
          a.horaFin,
          funcion?.nombre ?? "",
          a.observaciones ?? "",
        ];

        // Color por tipo
        const colorMap: Record<string, string> = {
          regular: "FFE6E6",
          rapida: "E6F3FF",
          autoservicio: "E6FFE6",
        };
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: colorMap[caja.tipo] ?? "FFFFFF" },
          };
          cell.border = {
            top: { style: "thin", color: { argb: "CCCCCC" } },
            left: { style: "thin", color: { argb: "CCCCCC" } },
            bottom: { style: "thin", color: { argb: "CCCCCC" } },
            right: { style: "thin", color: { argb: "CCCCCC" } },
          };
        });

        rowIdx++;
      }

      if (rowIdx === 3) {
        const emptyRow = ws.getRow(3);
        emptyRow.values = ["(sin asignaciones)", "", "", "", "", "", "", ""];
        emptyRow.font = { italic: true, color: { argb: "999999" } };
      }

      // Ajustar anchos
      ws.getColumn(1).width = 10;
      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 8;
      ws.getColumn(4).width = 32;
      ws.getColumn(5).width = 12;
      ws.getColumn(6).width = 12;
      ws.getColumn(7).width = 20;
      ws.getColumn(8).width = 30;
    }

    // Generar buffer
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer).toString("base64");
  },
});

// Query auxiliar para cajas
export const getCajasByTienda = internalQuery({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cajas")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
  },
});

// Query auxiliar para personales activos
export const getPersonalesActivos = internalQuery({
  args: { tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();
  },
});

// Query auxiliar para asignaciones de un día
export const getAsignacionesDelDia = internalQuery({
  args: { tiendaId: v.id("tiendas"), fecha: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("asignacionesCaja")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

// Query auxiliar para función
export const getFuncion = internalQuery({
  args: { id: v.id("funcionesSecundarias") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const generarTextoUbicaciones = query({
  args: {
    tiendaId: v.id("tiendas"),
    semanaId: v.id("semanas"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const semana = await ctx.db.get(args.semanaId);
    if (!semana) throw new Error("Semana no encontrada");

    const cajas = await ctx.db
      .query("cajas")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    cajas.sort((a, b) => a.codigo - b.codigo);

    const personales = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .filter((q) => q.eq(q.field("activo"), true))
      .collect();
    const personaMap = new Map(personales.map((p) => [p._id, p]));

    const lineas: string[] = [];
    lineas.push(`UBICACIONES - Semana ${semana.fechaInicio} a ${semana.fechaFin}`);
    lineas.push("=".repeat(60));

    for (let dia = 1; dia <= 7; dia++) {
      const fecha = new Date(semana.fechaInicio);
      fecha.setUTCDate(fecha.getUTCDate() + (dia - 1));
      const fechaStr = fecha.toISOString().slice(0, 10);
      const nombreDia = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"][dia - 1];

      const asignaciones = await ctx.db
        .query("asignacionesCaja")
        .withIndex("by_tienda_fecha", (q) =>
          q.eq("tiendaId", args.tiendaId).eq("fecha", fechaStr),
        )
        .collect();
      asignaciones.sort((a, b) => {
        const ca = cajas.find((c) => c._id === a.cajaId)?.codigo ?? 999;
        const cb = cajas.find((c) => c._id === b.cajaId)?.codigo ?? 999;
        if (ca !== cb) return ca - cb;
        return a.bloque - b.bloque;
      });

      lineas.push("");
      lineas.push(`${nombreDia} ${fechaStr}`);
      lineas.push("-".repeat(60));

      if (asignaciones.length === 0) {
        lineas.push("  (sin asignaciones)");
        continue;
      }

      for (const a of asignaciones) {
        const caja = cajas.find((c) => c._id === a.cajaId);
        const persona = personaMap.get(a.personalId);
        if (!caja || !persona) continue;
        const pref = caja.preferencial ? " ⭐" : "";
        lineas.push(
          `  Caja ${caja.codigo}${pref} (${caja.tipo}) - ${persona.apellidos} ${persona.nombres} - ${a.horaInicio}-${a.horaFin}`
        );
      }
    }

    return lineas.join("\n");
  },
});
