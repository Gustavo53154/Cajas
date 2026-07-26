import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, requireUserProfile } from "./_helpers";
import { audit } from "./logs";

// ============================
// METAS SEMANALES
// ============================
export const setMeta = mutation({
  args: {
    semanaId: v.id("semanas"),
    debitoPct: v.number(),
    totalPct: v.number(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const semana = await ctx.db.get(args.semanaId);
    if (!semana) throw new Error("Semana no encontrada");
    const existing = await ctx.db
      .query("metasSemanales")
      .withIndex("by_semana", (q) => q.eq("semanaId", args.semanaId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        debitoPct: args.debitoPct,
        totalPct: args.totalPct,
      });
      return existing._id;
    }
    return await ctx.db.insert("metasSemanales", {
      tiendaId: semana.tiendaId,
      semanaId: args.semanaId,
      debitoPct: args.debitoPct,
      totalPct: args.totalPct,
    });
  },
});

export const getMeta = query({
  args: { semanaId: v.id("semanas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("metasSemanales")
      .withIndex("by_semana", (q) => q.eq("semanaId", args.semanaId))
      .first();
  },
});

// ============================
// PARTICIPACIONES SIP
// ============================
export const setParticipacion = mutation({
  args: {
    fecha: v.string(),
    personalId: v.id("personales"),
    debitoPct: v.number(),
    totalPct: v.number(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireUserProfile(ctx);
    const existing = await ctx.db
      .query("participacionesSIP")
      .withIndex("by_personal_fecha", (q) =>
        q.eq("personalId", args.personalId).eq("fecha", args.fecha),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        debitoPct: args.debitoPct,
        totalPct: args.totalPct,
      });
      return existing._id;
    }
    return await ctx.db.insert("participacionesSIP", {
      tiendaId: profile.tiendaId,
      fecha: args.fecha,
      personalId: args.personalId,
      debitoPct: args.debitoPct,
      totalPct: args.totalPct,
      createdAt: Date.now(),
    });
  },
});

export const getParticipaciones = query({
  args: {
    fecha: v.string(),
    tiendaId: v.id("tiendas"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("participacionesSIP")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

export const getParticipacionesRango = query({
  args: {
    fechaInicio: v.string(),
    fechaFin: v.string(),
    tiendaId: v.id("tiendas"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("participacionesSIP")
      .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    return all.filter(
      (p) => p.fecha >= args.fechaInicio && p.fecha <= args.fechaFin,
    );
  },
});

export const getPromediosSIP = query({
  args: {
    tiendaId: v.id("tiendas"),
    desde: v.optional(v.string()),
    hasta: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("participacionesSIP")
      .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    const filtradas = all.filter((p) => {
      if (args.desde && p.fecha < args.desde) return false;
      if (args.hasta && p.fecha > args.hasta) return false;
      return true;
    });
    const porCajero = new Map<string, { debito: number[]; total: number[] }>();
    for (const p of filtradas) {
      if (!porCajero.has(p.personalId))
        porCajero.set(p.personalId, { debito: [], total: [] });
      porCajero.get(p.personalId)!.debito.push(p.debitoPct);
      porCajero.get(p.personalId)!.total.push(p.totalPct);
    }
    const promedios = Array.from(porCajero.entries()).map(([id, vals]) => {
      const avg = (arr: number[]) =>
        arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
      return {
        personalId: id,
        debitoProm: avg(vals.debito),
        totalProm: avg(vals.total),
        creditoProm: Math.max(0, avg(vals.total) - avg(vals.debito)),
        dias: vals.debito.length,
      };
    });
    return promedios;
  },
});

export const importarInformeSIP = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    fecha: v.string(),
    lineas: v.array(
      v.object({
        codigo: v.string(),
        debitoPct: v.number(),
        creditoPct: v.number(),
        totalPct: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const personales = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    const porNick = new Map<string, typeof personales[number]>();
    const porCodEmp = new Map<string, typeof personales[number]>();
    const porCodOp = new Map<string, typeof personales[number]>();
    for (const p of personales) {
      if (p.nick) porNick.set(p.nick.toUpperCase(), p);
      if (p.codigoEmpleado) porCodEmp.set(p.codigoEmpleado.toUpperCase(), p);
      if (p.codigoOperadorCaja) porCodOp.set(p.codigoOperadorCaja.toUpperCase(), p);
    }

    const resultados: { codigo: string; matched: boolean; personalId?: string; nombre?: string }[] = [];
    for (const lin of args.lineas) {
      const cod = lin.codigo.trim().toUpperCase();
      const match = porNick.get(cod) || porCodEmp.get(cod) || porCodOp.get(cod);
      if (!match) {
        resultados.push({ codigo: lin.codigo, matched: false });
        continue;
      }
      resultados.push({
        codigo: lin.codigo,
        matched: true,
        personalId: match._id,
        nombre: `${match.apellidos} ${match.nombres}`,
      });
      const existing = await ctx.db
        .query("participacionesSIP")
        .withIndex("by_personal_fecha", (q) =>
          q.eq("personalId", match._id).eq("fecha", args.fecha)
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          debitoPct: lin.debitoPct,
          totalPct: lin.totalPct,
        });
      } else {
        await ctx.db.insert("participacionesSIP", {
          tiendaId: args.tiendaId,
          fecha: args.fecha,
          personalId: match._id,
          debitoPct: lin.debitoPct,
          totalPct: lin.totalPct,
          createdAt: Date.now(),
        });
      }
    }
    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "participacionesSIP",
      entidadId: args.fecha,
      despues: { lineas: args.lineas.length, fecha: args.fecha },
    });
    return resultados;
  },
});

// ============================
// VELOCIDAD
// ============================
export const setVelocidad = mutation({
  args: {
    fecha: v.string(),
    personalId: v.id("personales"),
    valor: v.number(),
    meta: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireUserProfile(ctx);
    const existing = await ctx.db
      .query("velocidades")
      .withIndex("by_personal_fecha", (q) =>
        q.eq("personalId", args.personalId).eq("fecha", args.fecha),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        valor: args.valor,
        meta: args.meta,
      });
      return existing._id;
    }
    return await ctx.db.insert("velocidades", {
      tiendaId: profile.tiendaId,
      fecha: args.fecha,
      personalId: args.personalId,
      valor: args.valor,
      meta: args.meta,
    });
  },
});

export const getVelocidades = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("velocidades")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

// ============================
// TINKAS
// ============================
export const setTinka = mutation({
  args: {
    fecha: v.string(),
    personalId: v.id("personales"),
    cantidad: v.number(),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireUserProfile(ctx);
    const cant = Math.max(0, Math.floor(args.cantidad));
    const existing = await ctx.db
      .query("tinkas")
      .withIndex("by_personal_fecha", (q) =>
        q.eq("personalId", args.personalId).eq("fecha", args.fecha),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { cantidad: cant });
      return existing._id;
    }
    return await ctx.db.insert("tinkas", {
      tiendaId: profile.tiendaId,
      fecha: args.fecha,
      personalId: args.personalId,
      cantidad: cant,
    });
  },
});

export const getTinkas = query({
  args: { fecha: v.string(), tiendaId: v.id("tiendas") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("tinkas")
      .withIndex("by_tienda_fecha", (q) =>
        q.eq("tiendaId", args.tiendaId).eq("fecha", args.fecha),
      )
      .collect();
  },
});

export const getTinkasRango = query({
  args: {
    fechaInicio: v.string(),
    fechaFin: v.string(),
    tiendaId: v.id("tiendas"),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db
      .query("tinkas")
      .withIndex("by_tienda_fecha", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    return all.filter(
      (t) => t.fecha >= args.fechaInicio && t.fecha <= args.fechaFin,
    );
  },
});

// ============================
// IMPORTAR TINKAS DESDE IMAGEN (OCR)
// ============================

// Limpia el nombre OCR (quita artefactos de líneas de tabla leídos como "|", "-", ":", etc.)
function limpiarNombreOcr(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-zñÑüÜ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensUtiles(s: string): string[] {
  return s
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function prefijoCompatible(ocrTok: string, personalTok: string): boolean {
  const a = ocrTok.toUpperCase();
  const b = personalTok.toUpperCase();
  if (a.length < 3 || b.length < 3) return false;
  if (b.startsWith(a)) return true;
  if (a.startsWith(b)) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 3;
}

// Matching robusto: al menos 1 apellido prefijo-compatible + 1 letra de un nombre
function matchRobustoPorApellidosYNombre(
  ocrNombre: string,
  apePersonal: string,
  nomPersonal: string,
): { match: boolean; score: number; apeMatchRatio: number; nomMatch: boolean } {
  const ocrTokens = tokensUtiles(ocrNombre);
  if (ocrTokens.length < 2) {
    return { match: false, score: 0, apeMatchRatio: 0, nomMatch: false };
  }

  const apeTokens = apePersonal.toUpperCase().split(/\s+/).filter((t) => t.length >= 2);
  const nomTokens = nomPersonal.toUpperCase().split(/\s+/).filter((t) => t.length >= 2);

  // Contar matches de apellidos (prefijo-compatible)
  let apeMatchCount = 0;
  for (const ape of apeTokens) {
    for (const tok of ocrTokens) {
      if (prefijoCompatible(tok, ape)) {
        apeMatchCount++;
        break;
      }
    }
  }
  const apeMatchRatio = apeTokens.length > 0 ? apeMatchCount / apeTokens.length : 0;

  // Verificar que al menos 1 NOMBRE tenga coincidencia FUERTE
  // (no solo la primera letra, sino prefijo de >= 3 chars o exacto)
  let nomMatch = false;
  let nomExactMatch = false;
  for (const nom of nomTokens) {
    if (nom.length === 0) continue;
    for (const tok of ocrTokens) {
      // Coincidencia EXACTA del nombre completo
      if (tok === nom) {
        nomMatch = true;
        nomExactMatch = true;
        break;
      }
      // Prefijo de >= 3 chars del nombre está en el OCR
      if (nom.length >= 3) {
        for (let len = Math.min(nom.length, 6); len >= 3; len--) {
          if (tok.startsWith(nom.slice(0, len))) {
            nomMatch = true;
            break;
          }
        }
      }
    }
    if (nomMatch) break;
  }

  // REQUISITO ESTRICTO: para que sea match, debe haber:
  // - Al menos 1 match de nombre (exacto o prefijo >= 3)
  // - Y al menos 1 match de apellido (prefijo-compatible)
  // Esto evita matches como "ALLIZON ANDREA GUERR" → "GUERRERO GONZALES AKEMI"
  // donde solo un prefijo de apellido + primera letra de nombre coincidian.
  const match = nomMatch && apeMatchCount >= 1;

  const score = apeMatchRatio * 0.7 + (nomMatch ? 0.3 : 0);
  return { match, score, apeMatchRatio, nomMatch };
}

// Encuentra la longitud de la subcadena común más larga entre dos strings.
function longestCommonSubstring(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  let best = 0;
  let cur = 0;
  for (let i = 0; i < m; i++) {
    cur = 0;
    for (let j = 0; j < n; j++) {
      if (a[i] === b[j]) {
        cur++;
        if (cur > best) best = cur;
      } else {
        cur = 0;
      }
    }
  }
  return best;
}

// Similitud Jaccard entre dos strings (basada en tokens)
function similitudNombres(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zñü\s]/g, "")
      .trim();
  const a1 = norm(a);
  const b1 = norm(b);
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

const SELF_CHECKOUT_RE = /^self[\s\-_]*checkout/i;

export const importarTinkasDesdeImagen = mutation({
  args: {
    tiendaId: v.id("tiendas"),
    filas: v.array(
      v.object({
        nombreOriginal: v.string(),
        personalIdSugerido: v.optional(v.id("personales")),
        // Mapa: fecha (YYYY-MM-DD) -> cantidad
        dias: v.array(
          v.object({
            fecha: v.string(),
            cantidad: v.number(),
          })
        ),
        total: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const personales = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();

    const porId = new Map(personales.map((p) => [p._id, p]));

    // Pre-indexar SELF CHECKOUT XX por número
    const selfPorNumero = new Map<number, (typeof personales)[number]>();
    for (const p of personales) {
      if (p.cargo === "Self Checkout") {
        const m = p.nick.match(/(\d+)/) || p.apellidos.match(/(\d+)/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n)) selfPorNumero.set(n, p);
        }
      }
    }

    const UMBRAL_MATCH = 0.6;

    const resultados: {
      nombreOriginal: string;
      matched: boolean;
      personalId?: string;
      nombreCompleto?: string;
      cargo?: string;
      diasGuardados: number;
      fuente: "sugerido" | "exacto" | "fuzzy" | "self-checkout" | "sin-match";
      similitud?: number;
    }[] = [];

    let totalGuardados = 0;

    for (const fila of args.filas) {
      const nombreNorm = fila.nombreOriginal.trim().toUpperCase();
      if (!nombreNorm) continue;

      let matched: (typeof personales)[number] | null = null;
      let fuente: "sugerido" | "exacto" | "fuzzy" | "self-checkout" | "sin-match" = "sin-match";
      let similitud = 0;

      // 1) Si el cliente ya sugiere un personalId, úsalo directamente
      if (fila.personalIdSugerido && porId.has(fila.personalIdSugerido)) {
        matched = porId.get(fila.personalIdSugerido)!;
        fuente = "sugerido";
      }

      // 2) Si la fila es SELF CHECKOUT XX, buscar por cargo + número
      if (!matched && SELF_CHECKOUT_RE.test(fila.nombreOriginal)) {
        const m = fila.nombreOriginal.match(/(\d+)/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && selfPorNumero.has(num)) {
            matched = selfPorNumero.get(num)!;
            fuente = "self-checkout";
          }
        }
      }

      // 3) Match exacto: comparar contra "${apellidos} ${nombres}" o "${nombres} ${apellidos}"
      if (!matched) {
        for (const p of personales) {
          if (!p.activo) continue;
          const apeNom = `${p.apellidos} ${p.nombres}`.trim().toUpperCase();
          const nomApe = `${p.nombres} ${p.apellidos}`.trim().toUpperCase();
          if (apeNom === nombreNorm || nomApe === nombreNorm) {
            matched = p;
            fuente = "exacto";
            break;
          }
        }
      }

      // 4) Match robusto por apellidos (prefijo-compatible) + 1 letra del nombre
      if (!matched) {
        const ocrLimpio = limpiarNombreOcr(fila.nombreOriginal);
        if (ocrLimpio && ocrLimpio.length >= 4) {
          let bestR: { p: (typeof personales)[number]; sim: number; apeRatio: number } | null = null;
          for (const p of personales) {
            if (!p.activo) continue;
            if (SELF_CHECKOUT_RE.test(`${p.apellidos} ${p.nombres}`)) continue;
            // SOLO matchear apellidos contra apellidos, NO intercambiar
            const mr = matchRobustoPorApellidosYNombre(ocrLimpio, p.apellidos, p.nombres);
            if (mr.match && (!bestR || mr.score > bestR.sim)) {
              bestR = { p, sim: mr.score, apeRatio: mr.apeMatchRatio };
            }
            // Fallback: matching por subcadena con tolerancia a caracteres perdidos
            if (!mr.match) {
              const ocrConcat = ocrLimpio.toUpperCase().replace(/\s+/g, "");
              if (ocrConcat.length >= 6) {
                const tokensApe = p.apellidos
                  .toUpperCase()
                  .split(/\s+/)
                  .filter((t) => t.length >= 3);
                const tokensNom = p.nombres
                  .toUpperCase()
                  .split(/\s+/)
                  .filter((t) => t.length >= 3);
                const allTokens = [...tokensApe, ...tokensNom];

                let tokenHits = 0;
                let exactWordHits = 0;
                let totalLcsChars = 0;
                for (const t of allTokens) {
                  let hit = false;
                  let hitLen = 0;
                  let isExact = false;
                  // 0) Coincidencia EXACTA del token (>= 3 chars) en el OCR
                  if (t.length >= 3 && ocrConcat.includes(t)) {
                    hit = true;
                    isExact = true;
                    hitLen = t.length;
                  }
                  // 1) Prefijo del token (>= 4 chars) aparece en el OCR
                  if (!hit) {
                    for (let len = Math.min(t.length, 8); len >= 4; len--) {
                      const pref = t.slice(0, len);
                      if (ocrConcat.includes(pref)) {
                        hit = true;
                        hitLen = len;
                        break;
                      }
                    }
                  }
                  // 2) Si no, sufijo del token (>= 4 chars) aparece en el OCR
                  if (!hit) {
                    for (let len = Math.min(t.length, 8); len >= 4; len--) {
                      const suf = t.slice(-len);
                      if (ocrConcat.includes(suf)) {
                        hit = true;
                        hitLen = len;
                        break;
                      }
                    }
                  }
                  // 3) Si no, LCS >= 5 (subcadena larga)
                  if (!hit) {
                    const lcs = longestCommonSubstring(ocrConcat, t);
                    if (lcs >= 5) {
                      hit = true;
                      hitLen = lcs;
                    }
                  }
                  if (hit) {
                    tokenHits++;
                    if (isExact) exactWordHits++;
                    totalLcsChars += hitLen;
                  }
                }

                const apeConcat = p.apellidos.toUpperCase().replace(/\s+/g, "");
                const nomConcat = p.nombres.toUpperCase().replace(/\s+/g, "");
                const variantes = [`${nomConcat}${apeConcat}`, `${apeConcat}${nomConcat}`];
                const concatHit = variantes.some(
                  (v) => ocrConcat.includes(v) || v.includes(ocrConcat),
                );

                // Matching estructural: OCR = [nombre1] [nombre2] [apellido]
                let structuralScore = 0;
                if (nomConcat.length >= 3 && apeConcat.length >= 3) {
                  for (const nomLen of [4, 5, 6, 7, 8]) {
                    for (const apeLen of [4, 5, 6, 7, 8]) {
                      if (nomLen + apeLen > ocrConcat.length) continue;
                      const namePart = ocrConcat.slice(0, nomLen);
                      const apePart = ocrConcat.slice(ocrConcat.length - apeLen);
                      const lcsName = longestCommonSubstring(namePart, nomConcat);
                      const lcsApe = longestCommonSubstring(apePart, apeConcat);
                      const prefNameMatch = nomConcat.startsWith(namePart) ||
                        namePart.startsWith(nomConcat.slice(0, Math.min(4, nomConcat.length)));
                      const prefApeMatch = apeConcat.startsWith(apePart) ||
                        apePart.startsWith(apeConcat.slice(0, Math.min(4, apeConcat.length)));
                      const nameOk = lcsName >= 3 || prefNameMatch;
                      const apeOk = lcsApe >= 3 || prefApeMatch;
                      if (nameOk && apeOk) {
                        const score = 0.55 + Math.min(0.3, (lcsName + lcsApe) * 0.01);
                        if (score > structuralScore) structuralScore = score;
                      }
                    }
                  }
                }

                // VALIDACIÓN CRÍTICA: al menos 1 token de NOMBRE debe coincidir.
                // Esto evita matches absurdos como "DIEGO" → "ENRIQUE HUMBERTO".
                const hayMatchNombre = tokensNom.some((tn) => {
                  for (let len = Math.min(tn.length, 6); len >= 3; len--) {
                    if (ocrConcat.includes(tn.slice(0, len))) return true;
                  }
                  return longestCommonSubstring(ocrConcat, tn) >= 3;
                });
                if (!hayMatchNombre) continue;

                // REQUISITO MÍNIMO: al menos 1 palabra EXACTA + 1 match adicional
                const suficientesMatches =
                  (exactWordHits >= 1 && tokenHits >= 2) ||
                  (concatHit) ||
                  (structuralScore > 0 && exactWordHits >= 1);
                if (suficientesMatches) {
                  const baseScore = 0.65 + Math.min(0.2, totalLcsChars * 0.005);
                  const finalScore = Math.max(baseScore, structuralScore);
                  if (!bestR || finalScore > bestR.sim) {
                    bestR = { p, sim: finalScore, apeRatio: tokenHits / Math.max(1, allTokens.length) };
                  }
                }
              }
            }
          }
          if (bestR) {
            matched = bestR.p;
            similitud = bestR.sim;
            fuente = "fuzzy";
          }
        }
      }

      // 5) Match fuzzy por similitud Jaccard como último recurso
      if (!matched) {
        let best: { p: (typeof personales)[number]; sim: number } | null = null;
        for (const p of personales) {
          if (!p.activo) continue;
          if (SELF_CHECKOUT_RE.test(`${p.apellidos} ${p.nombres}`)) continue;
          const apeNom = `${p.apellidos} ${p.nombres}`;
          const nomApe = `${p.nombres} ${p.apellidos}`;
          const s1 = similitudNombres(fila.nombreOriginal, apeNom);
          const s2 = similitudNombres(fila.nombreOriginal, nomApe);
          const sim = Math.max(s1, s2);
          if (!best || sim > best.sim) best = { p, sim };
        }
        if (best && best.sim >= UMBRAL_MATCH) {
          matched = best.p;
          similitud = best.sim;
          fuente = "fuzzy";
        }
      }

      let diasGuardados = 0;
      if (matched) {
        for (const d of fila.dias) {
          const cant = Math.max(0, Math.floor(d.cantidad));
          if (cant === 0) continue;
          const existing = await ctx.db
            .query("tinkas")
            .withIndex("by_personal_fecha", (q) =>
              q.eq("personalId", matched!._id).eq("fecha", d.fecha),
            )
            .first();
          if (existing) {
            await ctx.db.patch(existing._id, { cantidad: cant });
          } else {
            await ctx.db.insert("tinkas", {
              tiendaId: args.tiendaId,
              fecha: d.fecha,
              personalId: matched._id,
              cantidad: cant,
            });
          }
          diasGuardados++;
        }
        totalGuardados += diasGuardados;
      }

      resultados.push({
        nombreOriginal: fila.nombreOriginal,
        matched: !!matched,
        personalId: matched?._id,
        nombreCompleto: matched
          ? `${matched.nombres} ${matched.apellidos}`.trim()
          : undefined,
        cargo: matched?.cargo,
        diasGuardados,
        fuente,
        similitud: fuente === "fuzzy" ? similitud : undefined,
      });
    }

    await audit(ctx, {
      tiendaId: args.tiendaId,
      accion: "crear",
      entidad: "tinkas",
      entidadId: "import-imagen",
      despues: {
        filas: args.filas.length,
        totalGuardados,
        resultados: resultados.length,
      },
    });

    return { resultados, totalGuardados };
  },
});

// Sugerencias de matching (sin guardar) para vista previa
export const sugerirMatchTinka = query({
  args: {
    tiendaId: v.id("tiendas"),
    nombres: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const personales = await ctx.db
      .query("personales")
      .withIndex("by_tienda", (q) => q.eq("tiendaId", args.tiendaId))
      .collect();
    const selfPorNumero = new Map<number, (typeof personales)[number]>();
    for (const p of personales) {
      if (p.cargo === "Self Checkout") {
        const m = p.nick.match(/(\d+)/) || p.apellidos.match(/(\d+)/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n)) selfPorNumero.set(n, p);
        }
      }
    }
    const UMBRAL = 0.6;
    return args.nombres.map((nombreOriginal) => {
      const nombreNorm = nombreOriginal.trim().toUpperCase();
      // Exacto
      for (const p of personales) {
        if (!p.activo) continue;
        const apeNom = `${p.apellidos} ${p.nombres}`.trim().toUpperCase();
        const nomApe = `${p.nombres} ${p.apellidos}`.trim().toUpperCase();
        if (apeNom === nombreNorm || nomApe === nombreNorm) {
          return {
            nombreOriginal,
            matched: true,
            personalId: p._id,
            nombreCompleto: `${p.nombres} ${p.apellidos}`.trim(),
            cargo: p.cargo,
            fuente: "exacto" as const,
            similitud: 1,
          };
        }
      }
      // Self checkout
      if (SELF_CHECKOUT_RE.test(nombreOriginal)) {
        const m = nombreOriginal.match(/(\d+)/);
        if (m) {
          const num = parseInt(m[1], 10);
          const p = selfPorNumero.get(num);
          if (p) {
            return {
              nombreOriginal,
              matched: true,
              personalId: p._id,
              nombreCompleto: `${p.nombres} ${p.apellidos}`.trim(),
              cargo: p.cargo,
              fuente: "self-checkout" as const,
              similitud: 1,
            };
          }
        }
      }
      // Matching robusto: apellidos (prefijo) + 1 letra del nombre
      // SOLO apellidos contra apellidos, NO intercambiar
      const ocrLimpio = limpiarNombreOcr(nombreOriginal);
      if (ocrLimpio && ocrLimpio.length >= 4) {
        let bestR: { p: (typeof personales)[number]; sim: number } | null = null;
        for (const p of personales) {
          if (!p.activo) continue;
          if (SELF_CHECKOUT_RE.test(`${p.apellidos} ${p.nombres}`)) continue;
          const mr = matchRobustoPorApellidosYNombre(ocrLimpio, p.apellidos, p.nombres);
          if (mr.match && (!bestR || mr.score > bestR.sim)) {
            bestR = { p, sim: mr.score };
          }
          // Fallback: matching por subcadena con tolerancia a caracteres perdidos
          if (!mr.match) {
            const ocrConcat = ocrLimpio.toUpperCase().replace(/\s+/g, "");
            if (ocrConcat.length >= 6) {
              const tokensApe = p.apellidos
                .toUpperCase()
                .split(/\s+/)
                .filter((t) => t.length >= 3);
              const tokensNom = p.nombres
                .toUpperCase()
                .split(/\s+/)
                .filter((t) => t.length >= 3);
              const allTokens = [...tokensApe, ...tokensNom];

              let tokenHits = 0;
              let exactWordHits = 0;
              let totalLcsChars = 0;
              for (const t of allTokens) {
                let hit = false;
                let hitLen = 0;
                for (let len = Math.min(t.length, 8); len >= 4; len--) {
                  const pref = t.slice(0, len);
                  if (ocrConcat.includes(pref)) {
                    hit = true;
                    hitLen = len;
                    break;
                  }
                }
                if (!hit) {
                  for (let len = Math.min(t.length, 8); len >= 4; len--) {
                    const suf = t.slice(-len);
                    if (ocrConcat.includes(suf)) {
                      hit = true;
                      hitLen = len;
                      break;
                    }
                  }
                }
                if (!hit) {
                  const lcs = longestCommonSubstring(ocrConcat, t);
                  if (lcs >= 5) {
                    hit = true;
                    hitLen = lcs;
                  }
                }
                if (hit) {
                  tokenHits++;
                  totalLcsChars += hitLen;
                }
              }

              const apeConcat = p.apellidos.toUpperCase().replace(/\s+/g, "");
              const nomConcat = p.nombres.toUpperCase().replace(/\s+/g, "");
              const variantes = [`${nomConcat}${apeConcat}`, `${apeConcat}${nomConcat}`];
              const concatHit = variantes.some(
                (v) => ocrConcat.includes(v) || v.includes(ocrConcat),
              );

              // Matching estructural: OCR = [nombre1] [nombre2] [apellido]
              let structuralScore = 0;
              if (nomConcat.length >= 3 && apeConcat.length >= 3) {
                for (const nomLen of [4, 5, 6, 7, 8]) {
                  for (const apeLen of [4, 5, 6, 7, 8]) {
                    if (nomLen + apeLen > ocrConcat.length) continue;
                    const namePart = ocrConcat.slice(0, nomLen);
                    const apePart = ocrConcat.slice(ocrConcat.length - apeLen);
                    const lcsName = longestCommonSubstring(namePart, nomConcat);
                    const lcsApe = longestCommonSubstring(apePart, apeConcat);
                    const prefNameMatch = nomConcat.startsWith(namePart) ||
                      namePart.startsWith(nomConcat.slice(0, Math.min(4, nomConcat.length)));
                    const prefApeMatch = apeConcat.startsWith(apePart) ||
                      apePart.startsWith(apeConcat.slice(0, Math.min(4, apeConcat.length)));
                    const nameOk = lcsName >= 3 || prefNameMatch;
                    const apeOk = lcsApe >= 3 || prefApeMatch;
                    if (nameOk && apeOk) {
                      const score = 0.55 + Math.min(0.3, (lcsName + lcsApe) * 0.01);
                      if (score > structuralScore) structuralScore = score;
                    }
                  }
                }
              }

              // VALIDACIÓN CRÍTICA: al menos 1 token de NOMBRE debe coincidir.
              const hayMatchNombre = tokensNom.some((tn) => {
                for (let len = Math.min(tn.length, 6); len >= 3; len--) {
                  if (ocrConcat.includes(tn.slice(0, len))) return true;
                }
                return longestCommonSubstring(ocrConcat, tn) >= 3;
              });
              if (!hayMatchNombre) continue;

              // REQUISITO MÍNIMO: al menos 1 palabra EXACTA + 1 match adicional
              const suficientesMatches =
                (exactWordHits >= 1 && tokenHits >= 2) ||
                (concatHit) ||
                (structuralScore > 0 && exactWordHits >= 1);
              if (suficientesMatches) {
                const baseScore = 0.65 + Math.min(0.2, totalLcsChars * 0.005);
                const finalScore = Math.max(baseScore, structuralScore);
                if (!bestR || finalScore > bestR.sim) {
                  bestR = { p, sim: finalScore };
                }
              }
            }
          }
        }
        if (bestR) {
          return {
            nombreOriginal,
            matched: true,
            personalId: bestR.p._id,
            nombreCompleto: `${bestR.p.nombres} ${bestR.p.apellidos}`.trim(),
            cargo: bestR.p.cargo,
            fuente: "fuzzy" as const,
            similitud: bestR.sim,
          };
        }
      }

      // Fuzzy Jaccard como último recurso
      let best: { p: (typeof personales)[number]; sim: number } | null = null;
      for (const p of personales) {
        if (!p.activo) continue;
        if (SELF_CHECKOUT_RE.test(`${p.apellidos} ${p.nombres}`)) continue;
        const apeNom = `${p.apellidos} ${p.nombres}`;
        const nomApe = `${p.nombres} ${p.apellidos}`;
        const s1 = similitudNombres(nombreOriginal, apeNom);
        const s2 = similitudNombres(nombreOriginal, nomApe);
        const sim = Math.max(s1, s2);
        if (!best || sim > best.sim) best = { p, sim };
      }
      if (best && best.sim >= UMBRAL) {
        return {
          nombreOriginal,
          matched: true,
          personalId: best.p._id,
          nombreCompleto: `${best.p.nombres} ${best.p.apellidos}`.trim(),
          cargo: best.p.cargo,
          fuente: "fuzzy" as const,
          similitud: best.sim,
        };
      }
      return {
        nombreOriginal,
        matched: false,
        personalId: undefined,
        nombreCompleto: undefined,
        cargo: undefined,
        fuente: "sin-match" as const,
        similitud: best?.sim ?? 0,
      };
    });
  },
});
