// Algoritmo de asignación de cajas - v3 (mejorado)
// Reglas:
// - Cada cajero va a UNA caja todo el día (sin rotar)
// - Las cajas se llenan en cascada por orden de entrada
// - Cajas 1-18: regulares (1 es preferencial)
// - Cajas 19-24: rápidas (solo cajeros con soloCajaRapida, después de 9:00)
// - Cajas 25-30: autoservicio (UN solo asistente)

import { Id } from "../_generated/dataModel";

export type Caja = {
  _id: Id<"cajas">;
  codigo: number;
  tipo: "regular" | "rapida" | "autoservicio";
  preferencial: boolean;
};

export type Persona = {
  _id: Id<"personales">;
  apellidos: string;
  nombres: string;
  nick: string;
  cargo: string;
  soloCajaRapida: boolean;
  esAsistenteAutoservicio: boolean;
};

export type HorarioDia = {
  entrada: string; // "HH:MM"
  salida: string;
};

export type Bloque = {
  personalId: Id<"personales">;
  cajaId: Id<"cajas">;
  bloque: number;
  horaInicio: string;
  horaFin: string;
  esT?: boolean;
};

export type Decision = {
  personalId: Id<"personales">;
  cajaId?: Id<"cajas">;
  decision: string;
  detalle: string;
};

export type Hueco = {
  cajaId: Id<"cajas">;
  desde: string;
  hasta: string;
};

export type ResultadoAsignacion = {
  asignaciones: Bloque[];
  huecos: Hueco[];
  decisiones: Decision[];
  errores: string[];
};

const HORA_CIERRE = "22:45";
const HORA_INICIO_RAPIDAS = "08:00";

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function fromMin(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function generarAsignaciones(
  cajas: Caja[],
  personas: Persona[],
  horarios: Map<Id<"personales">, HorarioDia>,
  fecha: string,
): ResultadoAsignacion {
  const result: ResultadoAsignacion = {
    asignaciones: [],
    huecos: [],
    decisiones: [],
    errores: [],
  };

  // Ordenar cajas
  const cajasOrden = [...cajas].sort((a, b) => a.codigo - b.codigo);
  const caja1 = cajasOrden.find((c) => c.codigo === 1);
  const cajasRapidas = cajasOrden.filter((c) => c.tipo === "rapida");
  const cajasAutoservicio = cajasOrden.filter((c) => c.tipo === "autoservicio");
  const cajasRegulares = cajasOrden.filter((c) => c.tipo === "regular" && c.codigo !== 1);

  if (!caja1) {
    result.errores.push("No se encontró la Caja 1 (preferencial)");
    return result;
  }

  // Construir personas con horario y ordenar por hora de entrada
  // SOLO se asignan CAJEROS a cajas. El resto (RS, Supervisor, Ecommerce, etc.)
  // se asignan manualmente desde el tablero en vivo.
  const CARGO_ORDER: Record<string, number> = {
    "Cajer@": 0,
    "Self Checkout": 1,
    "Ecommerce": 2,
    "RS": 3,
    "Supervisor(@)": 4,
    "JefeCajas": 5,
  };

  type PersonaConHorario = Persona & { entrada: number; salida: number };
  const personasActivas: PersonaConHorario[] = personas
    .filter((p) => horarios.has(p._id))
    .map((p) => {
      const h = horarios.get(p._id)!;
      return {
        ...p,
        entrada: toMin(h.entrada),
        salida: toMin(h.salida),
      };
    });
  // Reportar y descartar horarios inválidos (salida <= entrada).
  // Sin este filtro, la ventana de handoff se invierte y mete cajeros
  // que no deberían encadenar.
  const horariosInvalidos: { p: PersonaConHorario; h: HorarioDia }[] = [];
  for (const p of personasActivas) {
    if (p.salida <= p.entrada) {
      const h = horarios.get(p._id)!;
      horariosInvalidos.push({ p, h });
    }
  }
  for (const { p, h } of horariosInvalidos) {
    result.errores.push(
      `Horario inválido para ${p.apellidos} ${p.nombres}: ${h.entrada}-${h.salida} (salida debe ser posterior a entrada). Se omite de la asignación.`,
    );
  }
  const personasActivasValidas = personasActivas
    .filter((p) => p.salida > p.entrada)
    .sort((a, b) => {
      if (a.entrada !== b.entrada) return a.entrada - b.entrada;
      const oa = CARGO_ORDER[a.cargo] ?? 99;
      const ob = CARGO_ORDER[b.cargo] ?? 99;
      return oa - ob;
    });

  const cierreMin = toMin(HORA_CIERRE);
  const inicioRapidasMin = toMin(HORA_INICIO_RAPIDAS);

  // SOLO los cajeros van a cajas regulares y rápidas
  const cajeros = personasActivasValidas.filter((p) => p.cargo === "Cajer@");
  const cajerosNormales = cajeros.filter((p) => !p.soloCajaRapida);
  const cajerosRapida = cajeros.filter((p) => p.soloCajaRapida);

  // El personal de Self Checkout va a las cajas de autoservicio (25-30).
  // Se asignan TODOS los asistentes disponibles, distribuidos en round-robin.

  // El resto (RS, Supervisor, Ecommerce) NO se asigna automáticamente.
  // Se asignan manualmente desde el tablero en vivo.
  const noAsignadosAuto = personasActivasValidas.filter(
    (p) =>
      p.cargo !== "Cajer@" &&
      !p.esAsistenteAutoservicio,
  );
  for (const p of noAsignadosAuto) {
    result.decisiones.push({
      personalId: p._id,
      decision: "No se asigna automáticamente",
      detalle: `Cargo ${p.cargo}. Asignar manualmente desde el tablero en vivo.`,
    });
  }

  const usados = new Set<Id<"personales">>();

  // ============================================
  // CAJA 1 (PREFERENCIAL) - cascada continua
  // ============================================
  // Regla: la primera cajera que entra abre la caja. Las siguientes
  // se encadenan con empalme de 15 min. Si nadie llega hasta 22:45,
  // se intenta "transferir" (T) al último bloque de alguien cuya
  // salida original sea >= 22:45.

  // Asignar la primera cajera disponible a Caja 1
  const c1: PersonaConHorario[] = [];
  for (const p of cajerosNormales) {
    if (usados.has(p._id)) continue;
    c1.push(p);
    usados.add(p._id);
    break;
  }
  // Cascada: agregar más personas si pueden relevar al cierre del bloque anterior.
  // La ventana de handoff es de 120 min antes a 15 min antes de la salida del
  // anterior. Esto permite encadenar cajeros con empalmes de hasta 2 horas
  // para que C1 quede cubierta hasta el cierre, sin consumir cajeros cuyo
  // turno se solapa de forma mucho mayor (esos deben ir a C2, C3, ...).
  // También se detiene cuando C1 ya queda cubierta hasta el cierre.
  const VENTANA_HANDOFF = 120;
  let cambios = true;
  while (cambios) {
    cambios = false;
    const ultimo = c1[c1.length - 1];
    if (ultimo.salida >= cierreMin) break;
    for (const p of cajerosNormales) {
      if (usados.has(p._id)) continue;
      // Puede relevar si su entrada está dentro de la ventana de handoff:
      // entre VENTANA_HANDOFF min antes y 15 min antes de la salida del anterior
      if (
        p.entrada >= ultimo.salida - VENTANA_HANDOFF &&
        p.entrada <= ultimo.salida - 15
      ) {
        c1.push(p);
        usados.add(p._id);
        cambios = true;
        break;
      }
    }
  }
  // Si la caja 1 no llega al cierre, intentar transferir a un cajero que
  // pueda cubrir hasta el cierre (22:45). No exigimos ventana de handoff
  // porque un "transfer" puede tener al cajero trabajando en otra caja
  // y moverse a C1 al final de su turno o un poco antes.
  if (c1.length > 0) {
    const ultimoC1 = c1[c1.length - 1];
    if (ultimoC1.salida < cierreMin) {
      for (const p of cajerosNormales) {
        if (usados.has(p._id)) continue;
        if (p.salida >= cierreMin) {
          c1.push(p);
          usados.add(p._id);
          result.decisiones.push({
            personalId: p._id,
            cajaId: caja1._id,
            decision: "Caja 1 - transferencia al cierre",
            detalle: `Cubre hasta ${fromMin(p.salida)}`,
          });
          break;
        }
      }
    }
  }

  // Convertir c1 a bloques con empalmes
  for (let i = 0; i < c1.length; i++) {
    const p = c1[i];
    let horaInicio = fromMin(p.entrada);
    let esT = false;
    if (i > 0) {
      const anterior = c1[i - 1];
      // Empalme: empieza 15 min antes del fin del anterior
      const nuevoInicio = Math.max(p.entrada, anterior.salida - 15);
      horaInicio = fromMin(nuevoInicio);
      esT = nuevoInicio > p.entrada;
    }
    result.asignaciones.push({
      personalId: p._id,
      cajaId: caja1._id,
      bloque: i + 1,
      horaInicio,
      horaFin: fromMin(p.salida),
      esT,
    });
    result.decisiones.push({
      personalId: p._id,
      cajaId: caja1._id,
      decision: i === 0 ? "Caja 1 - Apertura" : "Caja 1 - Relevo",
      detalle: `Bloque ${i + 1}: ${horaInicio} - ${fromMin(p.salida)}`,
    });
  }
  // Detectar huecos en Caja 1
  for (let i = 0; i < c1.length - 1; i++) {
    const fin = c1[i].salida;
    const inicioSiguiente = Math.max(c1[i + 1].entrada, c1[i].salida - 15);
    if (inicioSiguiente > fin) {
      result.huecos.push({
        cajaId: caja1._id,
        desde: fromMin(fin),
        hasta: fromMin(inicioSiguiente),
      });
    }
  }

  // ============================================
  // CAJA 20 (RÁPIDA) - solo se asignan 1-2 cajeros (los necesarios para
  // mantener cobertura). El resto va a C2-C18.
  // C19 está reservada para supervisores.
  // C21-C24 quedan vacías para asignación manual.
  // ============================================
  const HORA_OBJETIVO_RAPIDA = toMin("22:00");
  const caja20 = cajasRapidas.find((c) => c.codigo === 20);
  if (caja20) {
    // Buscar candidatos para la caja rápida (entrada >= 8:00, no asignados)
    const candidatosRapidas = [
      ...cajerosRapida,
      ...cajerosNormales.filter((p) => !usados.has(p._id) && p.entrada >= inicioRapidasMin),
    ].sort((a, b) => a.entrada - b.entrada);

    // Paso 1: asignar el primer cajero (el de entrada más temprana) a C20
    let primerCajero: typeof candidatosRapidas[0] | null = null;
    for (const p of candidatosRapidas) {
      if (usados.has(p._id)) continue;
      primerCajero = p;
      break;
    }

    if (primerCajero) {
      result.asignaciones.push({
        personalId: primerCajero._id,
        cajaId: caja20._id,
        bloque: 1,
        horaInicio: fromMin(primerCajero.entrada),
        horaFin: fromMin(primerCajero.salida),
      });
      result.decisiones.push({
        personalId: primerCajero._id,
        cajaId: caja20._id,
        decision: "Caja 20 (rápida) - Apertura",
        detalle: `${fromMin(primerCajero.entrada)} - ${fromMin(primerCajero.salida)}`,
      });
      usados.add(primerCajero._id);

      // Paso 2: si la cobertura no llega a las 22:00, hacer un transfer
      // con un cajero que pueda cubrir hasta el objetivo.
      if (primerCajero.salida < HORA_OBJETIVO_RAPIDA) {
        for (const p of cajerosNormales) {
          if (usados.has(p._id)) continue;
          if (p.salida >= HORA_OBJETIVO_RAPIDA) {
            const horaInicio = fromMin(Math.max(p.entrada, primerCajero.salida - 15));
            result.asignaciones.push({
              personalId: p._id,
              cajaId: caja20._id,
              bloque: 2,
              horaInicio,
              horaFin: fromMin(p.salida),
              esT: toMin(horaInicio) > p.entrada,
            });
            result.decisiones.push({
              personalId: p._id,
              cajaId: caja20._id,
              decision: "Caja 20 (rápida) - transferencia",
              detalle: `Cubre hasta ${fromMin(p.salida)}`,
            });
            usados.add(p._id);
            break;
          }
        }
      }
    }
  }

  // ============================================
  // CAJAS 2-18 (REGULARES) - cascada por entrada
  // ============================================
  // Cada cajera va a UNA caja. Las cajas se llenan en orden de código.
  // Si la cajera no cabe en una caja (su turno empieza después de un bloque
  // que ya está), se prueba la siguiente caja.

  // Para cada caja regular, asignar personas en orden
  const cajerosRestantes = cajerosNormales.filter((p) => !usados.has(p._id));
  for (const caja of cajasRegulares) {
    // Saltar si la caja es autoservicio (no debería entrar acá)
    if (caja.tipo !== "regular") continue;
    let bloqueNum = 0;
    let ultimaSalida = 0;
    for (const p of [...cajerosRestantes]) {
      if (usados.has(p._id)) continue;
      // No permitir empalme conflictivo: el bloque nuevo empieza cuando el anterior termina
      // (regla del usuario: "sin cruzar los horarios, bloques cayendo sobre la misma caja")
      if (bloqueNum === 0) {
        // Primera persona en esta caja
        result.asignaciones.push({
          personalId: p._id,
          cajaId: caja._id,
          bloque: 1,
          horaInicio: fromMin(p.entrada),
          horaFin: fromMin(p.salida),
        });
        result.decisiones.push({
          personalId: p._id,
          cajaId: caja._id,
          decision: `Caja ${caja.codigo} - Asignado`,
          detalle: `Bloque 1: ${fromMin(p.entrada)} - ${fromMin(p.salida)}`,
        });
        usados.add(p._id);
        ultimaSalida = p.salida;
        bloqueNum = 1;
      } else if (p.entrada >= ultimaSalida) {
        // Cabe después del último bloque (sin empalme)
        bloqueNum++;
        result.asignaciones.push({
          personalId: p._id,
          cajaId: caja._id,
          bloque: bloqueNum,
          horaInicio: fromMin(p.entrada),
          horaFin: fromMin(p.salida),
        });
        result.decisiones.push({
          personalId: p._id,
          cajaId: caja._id,
          decision: `Caja ${caja.codigo} - Cascada bloque ${bloqueNum}`,
          detalle: `${fromMin(p.entrada)} - ${fromMin(p.salida)}`,
        });
        usados.add(p._id);
        ultimaSalida = p.salida;
      }
      // Si no cabe, no la asignamos a esta caja (probará la siguiente)
    }
  }

  // Los cajeros que no cupieron en ninguna caja (regular ni rápida)
  const sinCaja = cajerosNormales.filter((p) => !usados.has(p._id));
  for (const p of sinCaja) {
    result.decisiones.push({
      personalId: p._id,
      decision: "Sin caja asignada",
      detalle: `Entrada ${fromMin(p.entrada)} - Salida ${fromMin(p.salida)}. No cupo en ninguna caja.`,
    });
  }

  // ============================================
  // CAJAS 25-30 (AUTOSERVICIO) - TODOS los asistentes de self checkout
  // Se distribuyen en round-robin entre las cajas de autoservicio.
  // El frontend las agrupa todas bajo el bloque virtual "Autoservicio".
  // ============================================
  const asistentesAuto = personasActivasValidas.filter(
    (p) => p.esAsistenteAutoservicio,
  );
  const cajasAutoOrden = [...cajasAutoservicio].sort((a, b) => a.codigo - b.codigo);
  if (asistentesAuto.length === 0) {
    result.errores.push("No hay asistente de autoservicio definido para este día");
  } else if (cajasAutoOrden.length === 0) {
    result.errores.push("No hay cajas de autoservicio configuradas");
  } else {
    for (let i = 0; i < asistentesAuto.length; i++) {
      const asistente = asistentesAuto[i];
      if (usados.has(asistente._id)) {
        result.decisiones.push({
          personalId: asistente._id,
          decision: "Asistente autoservicio omitido",
          detalle: "Ya estaba asignado en otra caja",
        });
        continue;
      }
      // Distribuir en round-robin entre las cajas de autoservicio.
      // Si hay más asistentes que cajas, se reutilizan las cajas con bloques adicionales.
      const cajaAuto = cajasAutoOrden[i % cajasAutoOrden.length];
      const bloqueNum = Math.floor(i / cajasAutoOrden.length) + 1;
      if (cajaAuto) {
        result.asignaciones.push({
          personalId: asistente._id,
          cajaId: cajaAuto._id,
          bloque: bloqueNum,
          horaInicio: fromMin(asistente.entrada),
          horaFin: fromMin(asistente.salida),
        });
        result.decisiones.push({
          personalId: asistente._id,
          cajaId: cajaAuto._id,
          decision: "Asistente de autoservicio",
          detalle: `Caja ${cajaAuto.codigo} (autoservicio): ${fromMin(asistente.entrada)} - ${fromMin(asistente.salida)}`,
        });
        usados.add(asistente._id);
      }
    }
  }

  // Huecos en cada caja
  const cajasConAsignaciones = new Set(result.asignaciones.map((a) => a.cajaId));
  for (const cajaId of cajasConAsignaciones) {
    const asigs = result.asignaciones
      .filter((a) => a.cajaId === cajaId)
      .sort((a, b) => toMin(a.horaInicio) - toMin(b.horaInicio));
    for (let i = 0; i < asigs.length - 1; i++) {
      const fin = toMin(asigs[i].horaFin);
      const inicioSiguiente = toMin(asigs[i + 1].horaInicio);
      if (inicioSiguiente > fin) {
        const cajaCodigo = cajas.find((c) => c._id === cajaId)?.codigo ?? "?";
        result.huecos.push({
          cajaId,
          desde: fromMin(fin),
          hasta: fromMin(inicioSiguiente),
        });
        result.decisiones.push({
          personalId: asigs[i].personalId,
          decision: `Caja ${cajaCodigo} - Hueco`,
          detalle: `${fromMin(fin)} → ${fromMin(inicioSiguiente)}`,
        });
      }
    }
  }

  return result;
}
