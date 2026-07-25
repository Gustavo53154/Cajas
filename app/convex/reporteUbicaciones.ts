import { v } from "convex/values";
import { query, action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireUser } from "./_helpers";
import ExcelJS from "exceljs";
import { PLANTILLA_BASE64 } from "./plantillaBase64";

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

// Posiciones de celda en la plantilla (mismas que ExcelUbicacion.py)
function getFilaBaseCaja(cajaNum: number): number {
  if (cajaNum === 1) return 4;
  if (cajaNum >= 2 && cajaNum <= 18) return 4 + (cajaNum - 1) * 2 + 1;
  if (cajaNum === 20) return 42;
  if (cajaNum === 21) return 44;
  if (cajaNum === 22) return 46;
  if (cajaNum === 23) return 48;
  if (cajaNum === 24) return 50;
  if (cajaNum === 25) return 53;
  return 0;
}

interface PosicionesCaja {
  nombres: string[];
  horas: string[];
}

function getPosicionesCaja(cajaNum: number): PosicionesCaja | null {
  const filaBase = getFilaBaseCaja(cajaNum);
  if (filaBase === 0) return null;

  const isEspecial = cajaNum === 1 || cajaNum === 25;
  const numFilas = isEspecial ? 3 : 2;

  const nombres: string[] = [];
  const horas: string[] = [];

  for (let i = 0; i < numFilas; i++) {
    nombres.push(`B${filaBase + i}`);
    horas.push(`C${filaBase + i}`);
  }
  for (let i = 0; i < numFilas; i++) {
    nombres.push(`F${filaBase + i}`);
    horas.push(`G${filaBase + i}`);
  }

  return { nombres, horas };
}

// Genera un Excel con la distribución de cajeros en cajas por día.
// Si se pasa `fecha`, exporta solo ese día. Si no, exporta toda la semana.
// Decodificar la plantilla base64 a ArrayBuffer
function getPlantillaBytes(): Uint8Array {
  const plantillaBinary = atob(PLANTILLA_BASE64);
  const plantillaBytes = new Uint8Array(plantillaBinary.length);
  for (let i = 0; i < plantillaBinary.length; i++) {
    plantillaBytes[i] = plantillaBinary.charCodeAt(i);
  }
  return plantillaBytes;
}

// Genera un Excel con el formato de la plantilla (mismas posiciones que ExcelUbicacion.py).
// Si se pasa `fecha`, exporta solo ese día. Si no, exporta toda la semana (una hoja por día).
export const generarExcelUbicaciones = action({
  args: {
    tiendaId: v.id("tiendas"),
    semanaId: v.id("semanas"),
    fecha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);

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

    // Decodificar la plantilla
    const plantillaBytes = getPlantillaBytes();

    // Determinar qué días exportar
    const diasAExportar: { fechaStr: string; nombreDia: string }[] = [];
    if (args.fecha) {
      const fechaObj = new Date(args.fecha + "T00:00:00");
      const dow = fechaObj.getDay();
      const diaSemana = dow === 0 ? 7 : dow;
      const nombreDia = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"][diaSemana - 1];
      diasAExportar.push({ fechaStr: args.fecha, nombreDia });
    } else {
      for (let dia = 1; dia <= 7; dia++) {
        const fecha = new Date(semana.fechaInicio);
        fecha.setUTCDate(fecha.getUTCDate() + (dia - 1));
        const fechaStr = fecha.toISOString().slice(0, 10);
        const nombreDia = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"][dia - 1];
        diasAExportar.push({ fechaStr, nombreDia });
      }
    }

    // Cargar la plantilla UNA vez (en memoria, no se modifica).
    // Para cada día, crear un workbook nuevo desde la plantilla.
    // Esto evita problemas de XML malformado al renombrar hojas.
    const wbFuente = new ExcelJS.Workbook();
    await wbFuente.xlsx.load(Buffer.from(plantillaBytes) as any);
    const wsFuente = wbFuente.getWorksheet(1);
    if (!wsFuente) throw new Error("La plantilla no tiene hojas");

    // Crear un workbook nuevo vacío
    const wb = new ExcelJS.Workbook();
    wb.creator = "DreamTeam Cajas";
    wb.created = new Date();

    for (let i = 0; i < diasAExportar.length; i++) {
      const { nombreDia } = diasAExportar[i];
      // Agregar una nueva hoja con el nombre del día
      const wsNueva = wb.addWorksheet(nombreDia);
      // Copiar la estructura completa de la plantilla
      copiarHoja(wsFuente, wsNueva);
    }

    // Llenar los datos en cada hoja
    for (const { fechaStr, nombreDia } of diasAExportar) {
      const ws = wb.getWorksheet(nombreDia);
      if (!ws) continue;

      // Actualizar la fecha en A2 (merge A2:H2)
      ws.getCell("A2").value = `FECHA: ${fechaStr}`;

      // Obtener asignaciones desde el preview
      const preview = await ctx.runQuery(api.algoritmoCajas.previewAlgoritmo, {
        tiendaId: args.tiendaId,
        fecha: fechaStr,
      });
      const asignaciones = preview.asignaciones;
      const cajasMap = new Map(cajas.map((c) => [c._id, c]));

      // Agrupar por caja
      const porCaja: Record<number, typeof asignaciones> = {};
      for (const a of asignaciones) {
        const caja = cajasMap.get(a.cajaId);
        if (!caja) continue;
        if (!porCaja[caja.codigo]) porCaja[caja.codigo] = [];
        porCaja[caja.codigo].push(a);
      }

      // Llenar celdas según posiciones de la plantilla
      for (const [cajaCodigoStr, asigs] of Object.entries(porCaja)) {
        const cajaCodigo = Number(cajaCodigoStr);
        const posiciones = getPosicionesCaja(cajaCodigo);
        if (!posiciones) continue;

        asigs.sort((a, b) => a.bloque - b.bloque);

        for (let idx = 0; idx < Math.min(asigs.length, posiciones.nombres.length); idx++) {
          const a = asigs[idx];
          const persona = personaMap.get(a.personalId);
          if (!persona) continue;

          const nombreCompleto = `${persona.apellidos} ${persona.nombres}`;
          const horas = `${a.horaInicio}-${a.horaFin}`;

          ws.getCell(posiciones.nombres[idx]).value = nombreCompleto;
          ws.getCell(posiciones.horas[idx]).value = horas;
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer as ArrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },
});

// ============================
// EXPORTACIÓN CON PLANTILLA (formato del script Python)
// ============================
// Nota: ahora es un alias de generarExcelUbicaciones (mismo formato de plantilla).
// Se mantiene por compatibilidad con el frontend.

// Copia estructura (celdas, valores, estilos, merges, columnas, filas) de una hoja a otra
function copiarHoja(origen: ExcelJS.Worksheet, destino: ExcelJS.Worksheet) {
  // Copiar valores y estilos de cada celda
  origen.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      const newCell = destino.getCell(cell.address);
      newCell.value = cell.value;
      newCell.style = cell.style;
      newCell.numFmt = cell.numFmt;
      if (cell.font) newCell.font = cell.font;
      if (cell.alignment) newCell.alignment = cell.alignment;
      if (cell.fill) newCell.fill = cell.fill;
      if (cell.border) newCell.border = cell.border;
    });
    // Copiar altura de fila
    if (row.height) destino.getRow(rowNumber).height = row.height;
  });

  // Copiar merges
  for (const merge of (origen.model as any).merges || []) {
    destino.mergeCells(merge);
  }

  // Copiar anchos de columna
  if (origen.columns) {
    for (let i = 0; i < origen.columns.length; i++) {
      const col = origen.columns[i];
      if (col && col.width) {
        destino.getColumn(i + 1).width = col.width;
      }
    }
  }
}

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
