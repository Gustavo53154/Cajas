"use client";
import { useState, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  Ticket, Upload, Loader2, CheckCircle2, XCircle,
  Save, ArrowLeft, Trash2, Image as ImageIcon,
  TrendingUp, BarChart3, History, Edit2, Search
} from "lucide-react";
import { toISODate, getWeekStart } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from "recharts";

type FilaParseada = {
  filaId: string;
  nombreOriginal: string;
  nombreEditable: string;
  personalId: string | null;
  sugerenciaPersonalId: string | null;
  sugerenciaNombre?: string;
  sugerenciaSimilitud?: number;
  sugerenciaFuente?: "exacto" | "fuzzy" | "self-checkout" | "sin-match" | "sugerido";
  dias: { fecha: string; label: string; cantidad: number }[];
  total: number;
  acumulado?: number;
  fuente?: "exacto" | "fuzzy" | "self-checkout" | "sin-match" | "sugerido";
  guardada?: boolean;
  diasGuardados?: number;
};

type ColumnaDetectada = {
  index: number;
  left: number;
  right: number;
  headerText: string;
  tipo: "rango" | "dia" | "total" | "nombre" | "desconocido";
  fecha?: string;
  label?: string;
};

const DIAS_SEMANA_CORTOS: Record<string, string> = {
  lun: "Lun", mar: "Mar", mie: "Mié", jue: "Jue", vie: "Vie", sab: "Sáb", dom: "Dom",
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function addDaysToISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function getDayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

const DIAS_SEMANA_DOW: Record<string, number> = {
  dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6,
};

// Auto-detecta la fecha del primer día a partir de su header (ej. "jue-16")
// y la fecha actual como referencia del mes/año.
function autoDetectarFecha(diaSemana: string, diaMes: number, refMes?: Date): string {
  const target = DIAS_SEMANA_DOW[diaSemana.toLowerCase()];
  if (target === undefined) return "";
  const base = refMes ?? new Date();
  // Buscar el mes más cercano (el actual, ±1) donde el día N sea ese día de semana
  const candidates: Date[] = [];
  for (let delta = 0; delta <= 2; delta++) {
    for (const sign of [0, -1, 1]) {
      if (sign === 0 && delta > 0) continue;
      const d = new Date(base.getFullYear(), base.getMonth() + sign * delta, 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const day = Math.min(diaMes, lastDay);
      const candidate = new Date(d.getFullYear(), d.getMonth(), day);
      candidates.push(candidate);
      if (delta === 0 && sign === 0) break;
    }
    if (candidates.length > 0 && delta === 0) break;
  }
  // Ordenar por cercanía a la fecha base
  candidates.sort((a, b) => Math.abs(a.getTime() - base.getTime()) - Math.abs(b.getTime() - base.getTime()));
  for (const c of candidates) {
    if (c.getDay() === target) {
      return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
    }
  }
  return "";
}

// Pre-procesa la imagen antes del OCR para mejorar la precisión:
// escala de grises, aumento de contraste, escalado 2x, binarización adaptativa.
async function preprocesarImagen(file: File | Blob): Promise<Blob> {
  // Pre-procesamiento mínimo: solo escalado 2x.
  // Cualquier transformación adicional (binarización, estiramiento de contraste)
  // estaba causando más daño que beneficio en imágenes de este estilo.
  const bitmap = await createImageBitmap(file);
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? file), "image/png");
  });
}

export default function TinkasImagenPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ticket className="h-6 w-6" />
            Tinkas · Imagen
          </h1>
          <p className="text-sm text-muted-foreground">
            Sube una captura del informe diario y analiza las tinkas por persona
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/tinkas">
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="subir">
        <TabsList>
          <TabsTrigger value="subir">
            <Upload className="h-4 w-4 mr-1" /> Subir imagen
          </TabsTrigger>
          <TabsTrigger value="analisis">
            <BarChart3 className="h-4 w-4 mr-1" /> Análisis
          </TabsTrigger>
        </TabsList>
        <TabsContent value="subir">
          <SubirImagenTab />
        </TabsContent>
        <TabsContent value="analisis">
          <AnalisisTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================
// TAB 1: Subir imagen
// ============================
function SubirImagenTab() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );
  const importar = useMutation(api.indicadores.importarTinkasDesdeImagen);
  const ensureSelfCheckout = useMutation(api.personales.ensureSelfCheckout);

  const [fechaReferencia, setFechaReferencia] = useState(toISODate(new Date()));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "loading" | "processing" | "done" | "error">("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState("");
  const [columnas, setColumnas] = useState<ColumnaDetectada[]>([]);
  const [filas, setFilas] = useState<FilaParseada[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<{
    lineas: number;
    headerLineIdx: number;
    headerTexto: string;
    headerWords: { text: string; x0: number; x1: number }[];
    grupos: { text: string; x0: number; x1: number }[];
    colsDetectadas: { tipo: string; headerText: string; left: number; right: number }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setImageFile(f);
    setResultadoImport(null);
    if (f) {
      const url = URL.createObjectURL(f);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
    setFilas([]);
    setColumnas([]);
    setOcrStatus("idle");
  };

  const procesarImagen = async () => {
    if (!imageFile) return;
    setOcrStatus("loading");
    setOcrProgress(0);
    setOcrStatusText("Inicializando OCR…");
    setFilas([]);
    setColumnas([]);
    setResultadoImport(null);

    try {
      const Tesseract = await import("tesseract.js");
      setOcrStatus("processing");
      // Pre-procesar la imagen para mejorar la precisión del OCR:
      // escala de grises + aumento de contraste + escala 2x + binarización adaptativa
      const imagenProcesada = await preprocesarImagen(imageFile);
      const result = await Tesseract.recognize(imagenProcesada, "spa", {
        logger: (m: any) => {
          if (m.status) setOcrStatusText(m.status);
          if (typeof m.progress === "number") setOcrProgress(Math.round(m.progress * 100));
        },
      });
      const data: any = result.data;
      const lineas: any[] = data.lines ?? [];
      if (lineas.length === 0) {
        toast.error("No se detectaron líneas en la imagen. Intenta con otra imagen más clara.");
        setOcrStatus("error");
        return;
      }

      const { columnas: colsDetectadas, filasDetectadas, debug } = extraerFilas(lineas, fechaReferencia);
      setDebugInfo(debug);

      // Forzar estructura estándar:
      // col 0 = nombre, col 1 = rango (Del 01 al 15), intermedias = dia, última = total
      // El usuario indicó que la estructura es siempre la misma.
      const colsOrdenadas = [...colsDetectadas].sort((a, b) => a.left - b.left);
      const forzadas = colsOrdenadas.map((c, i) => {
        const isFirst = i === 0;
        const isSecond = i === 1;
        const isLast = i === colsOrdenadas.length - 1;
        if (isFirst) {
          return { ...c, tipo: "nombre" as const, headerText: c.headerText || "NOMBRE" };
        }
        if (isSecond) {
          return {
            ...c,
            tipo: "rango" as const,
            headerText: "Del 01 al 15",
          };
        }
        if (isLast) {
          return { ...c, tipo: "total" as const, headerText: "TOTAL" };
        }
        return { ...c, tipo: "dia" as const };
      });

      // Auto-detectar fecha del primer día a partir de su header
      const primeraColDia = forzadas.find((c) => c.tipo === "dia");
      let fechaFinal = fechaReferencia;
      if (primeraColDia?.label) {
        const m = primeraColDia.label.match(/^([a-záéíóúñü]+)-(\d{1,2})$/i);
        if (m) {
          const diaSemanaKey = norm(m[1]).replace(/[^a-z]/g, "").slice(0, 3);
          const diaMes = parseInt(m[2], 10);
          if (DIAS_SEMANA_DOW[diaSemanaKey] !== undefined) {
            const fechaAuto = autoDetectarFecha(diaSemanaKey, diaMes);
            if (fechaAuto && fechaAuto !== fechaReferencia) {
              fechaFinal = fechaAuto;
              setFechaReferencia(fechaAuto);
            }
          }
        }
      }

      // Recalcular fechas de las columnas de día con la fecha final,
      // deteniéndose al llegar al fin de mes o al cambiar de mes.
      // Cada columna de día tiene un label tipo "jue-16". El día del mes
      // es la fuente de verdad: si el día del mes baja (mes cambió) o
      // supera el último día del mes, esa columna se descarta.
      const diasCols = forzadas.filter((c) => c.tipo === "dia");
      const baseDate = new Date(fechaFinal + "T00:00:00");
      const baseYear = baseDate.getFullYear();
      const baseMonth = baseDate.getMonth();
      const lastDayOfMonth = new Date(baseYear, baseMonth + 1, 0).getDate();

      let lastDay = 0;
      let diasValidos = 0;
      for (const c of diasCols) {
        const m = c.label?.match(/-(\d{1,2})$/);
        if (!m) continue;
        const diaNum = parseInt(m[1], 10);
        // Si el día es menor al anterior, significa cambio de mes → stop
        if (diaNum < lastDay) {
          c.fecha = undefined; // marcar para excluir
          continue;
        }
        // Si el día supera el último día del mes → stop
        if (diaNum > lastDayOfMonth) {
          c.fecha = undefined;
          continue;
        }
        c.fecha = `${baseYear}-${String(baseMonth + 1).padStart(2, "0")}-${String(diaNum).padStart(2, "0")}`;
        lastDay = diaNum;
        diasValidos++;
      }
      // Etiquetar la columna de rango
      const rangoCol = forzadas.find((c) => c.tipo === "rango");
      if (rangoCol) {
        rangoCol.fecha = undefined;
        rangoCol.label = "Acum";
      }
      // Si el OCR leyó "jue-26" en vez de "jue-16" y quedó fuera de rango,
      // reintentamos con el día anterior más cercano que sea jueves
      // (heurística: si el primer día detectado tiene día > 15 pero debería
      // estar en el rango 16-31, probamos retroceder de a 1 hasta dar
      // con un día que sea jueves)
      if (diasValidos === 0 && diasCols.length > 0 && primeraColDia?.label) {
        const mm = primeraColDia.label.match(/^([a-záéíóúñü]+)-(\d{1,2})$/i);
        if (mm) {
          const dsKey = norm(mm[1]).replace(/[^a-z]/g, "").slice(0, 3);
          const dsTarget = DIAS_SEMANA_DOW[dsKey];
          const diaOriginal = parseInt(mm[2], 10);
          if (dsTarget !== undefined) {
            for (let delta = 0; delta <= 7; delta++) {
              for (const sign of [1, -1]) {
                if (sign === -1 && delta === 0) continue;
                const candidate = diaOriginal + sign * delta;
                if (candidate < 16 || candidate > lastDayOfMonth) continue;
                const probe = new Date(baseYear, baseMonth, candidate);
                if (probe.getDay() === dsTarget) {
                  fechaFinal = `${baseYear}-${String(baseMonth + 1).padStart(2, "0")}-${String(candidate).padStart(2, "0")}`;
                  setFechaReferencia(fechaFinal);
                  let last = 0;
                  let ok = 0;
                  for (const c of diasCols) {
                    const m2 = c.label?.match(/-(\d{1,2})$/);
                    if (!m2) continue;
                    const dn = parseInt(m2[1], 10);
                    if (dn < last || dn > lastDayOfMonth) {
                      c.fecha = undefined;
                      continue;
                    }
                    c.fecha = `${baseYear}-${String(baseMonth + 1).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
                    last = dn;
                    ok++;
                  }
                  if (ok > diasValidos) {
                    diasValidos = ok;
                    toast.info(`Fecha auto-corregida: ${fechaFinal} (heurística día de semana)`);
                  }
                  break;
                }
              }
              if (diasValidos > 0) break;
            }
          }
        }
      }

      const diasDetectados = forzadas.filter((c) => c.tipo === "dia").length;
      if (diasDetectados === 0) {
        toast.error(
          "No se detectaron columnas de días. Revisa el panel de debug para ver qué leyó el OCR."
        );
        setOcrStatus("done");
        setColumnas(forzadas);
        setFilas(filasDetectadas);
        return;
      }
      setColumnas(forzadas);
      setFilas(filasDetectadas);
      setOcrStatus("done");
      toast.success(
        `${filasDetectadas.length} filas detectadas · ${diasDetectados} días · ${forzadas.find((c) => c.tipo === "rango") ? "acumulado OK" : ""} · ${forzadas.find((c) => c.tipo === "total") ? "total OK" : ""}`,
      );
    } catch (err: any) {
      console.error(err);
      toast.error("Error al procesar la imagen: " + (err?.message ?? "desconocido"));
      setOcrStatus("error");
    }
  };

  // Re-evaluar matches cuando cambian filas o personales
  const matchesPorNombre = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; cargo: string; sim: number; fuente: string }>();
    if (!personales) return map;
    for (const p of personales) {
      if (!p.activo) continue;
      const apeNom = `${p.apellidos} ${p.nombres}`.trim();
      const nomApe = `${p.nombres} ${p.apellidos}`.trim();
      map.set(apeNom.toUpperCase(), {
        id: p._id, nombre: apeNom, cargo: p.cargo, sim: 1, fuente: "exacto",
      });
      map.set(nomApe.toUpperCase(), {
        id: p._id, nombre: nomApe, cargo: p.cargo, sim: 1, fuente: "exacto",
      });
    }
    return map;
  }, [personales]);

  const calcularSugerencia = useCallback((nombreOriginal: string): {
    personalId: string | null; nombre?: string; cargo?: string; fuente: string; sim: number;
  } => {
    const norm = nombreOriginal.trim().toUpperCase();
    if (!norm) return { personalId: null, fuente: "sin-match", sim: 0 };
    if (matchesPorNombre.has(norm)) {
      const m = matchesPorNombre.get(norm)!;
      return { personalId: m.id, nombre: m.nombre, cargo: m.cargo, fuente: "exacto", sim: 1 };
    }
    if (/^self[\s\-_]*checkout/i.test(nombreOriginal)) {
      const numMatch = nombreOriginal.match(/(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        const numStr = String(num).padStart(2, "0");
        for (const p of personales ?? []) {
          if (p.cargo !== "Self Checkout") continue;
          // Match más flexible: busca el número en nick, apellidos o nombres
          const matchesNum =
            p.nick.includes(numStr) ||
            p.nick.includes(String(num)) ||
            p.apellidos.includes(numStr) ||
            p.apellidos.includes(String(num)) ||
            p.nombres.includes(numStr) ||
            p.nombres.includes(String(num)) ||
            `${p.apellidos} ${p.nombres}`.toUpperCase().includes(numStr) ||
            `${p.nombres} ${p.apellidos}`.toUpperCase().includes(numStr);
          if (matchesNum) {
            return {
              personalId: p._id,
              nombre: `${p.nombres} ${p.apellidos}`.trim(),
              cargo: p.cargo,
              fuente: "self-checkout",
              sim: 1,
            };
          }
        }
      }
    }
    // Limpiar el nombre OCR (quitar artefactos de líneas de tabla)
    const ocrLimpio = limpiarNombreOcr(nombreOriginal);
    if (!ocrLimpio || ocrLimpio.length < 4) {
      return { personalId: null, fuente: "sin-match", sim: 0 };
    }

    // Matching robusto: apellidos (con prefijo) + 1 letra del nombre
    let bestRobusto: { id: string; nombre: string; cargo: string; sim: number; apeRatio: number } | null = null;
    let bestJaccard: { id: string; nombre: string; cargo: string; sim: number } | null = null;
    for (const p of personales ?? []) {
      if (!p.activo) continue;
      if (p.cargo === "Self Checkout") continue;
      const apeNom = `${p.apellidos} ${p.nombres}`;
      const nomApe = `${p.nombres} ${p.apellidos}`;

      // 1) Matching robusto por apellidos y nombre
      //    SOLO matchear apellidos contra apellidos, NO intercambiar
      //    (esto evita falsos positivos como "ENRIQUE" → "MIGUEL ENRIQUE")
      const mr = matchPorApellidosYNombre(ocrLimpio, p.apellidos, p.nombres);
      if (mr.match && (!bestRobusto || mr.score > bestRobusto.sim)) {
        bestRobusto = { id: p._id, nombre: nomApe, cargo: p.cargo, sim: mr.score, apeRatio: mr.apeMatchRatio };
      }

      // 1b) Matching por subcadena (fallback para cuando el OCR lee sin espacios
      //     o pierde letras). Usa la subcadena común más larga entre el OCR
      //     y cada token del personal, para tolerar truncamiento/caracteres perdidos.
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

          // Para cada token, verificar si es un prefijo o sufijo del OCR
          // (no solo una subcadena cualquiera, para evitar falsos positivos
          // como "MEND" dentro de "ALMENDRE" matcheando con "MENDIE")
          let tokenHits = 0;
          let totalLcsChars = 0;
          for (const t of allTokens) {
            let hit = false;
            let hitLen = 0;
            // 1) Prefijo del token (>= 4 chars) aparece en el OCR
            for (let len = Math.min(t.length, 8); len >= 4; len--) {
              const pref = t.slice(0, len);
              if (ocrConcat.includes(pref)) {
                hit = true;
                hitLen = len;
                break;
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
            // 3) Si no, LCS >= 5 (subcadena larga, probablemente significativa)
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

          // Matching ESTRUCTURAL: el OCR siempre va [nombre1] [nombre2] [apellido].
          // Probamos: primera parte del OCR vs nombres, última parte vs apellidos.
          let structuralScore = 0;
          const nomConcatForStr = p.nombres.toUpperCase().replace(/\s+/g, "");
          const apeConcatForStr = p.apellidos.toUpperCase().replace(/\s+/g, "");
          if (nomConcatForStr.length >= 3 && apeConcatForStr.length >= 3) {
            // Probar varios tamaños de "parte del nombre" y "parte del apellido"
            for (const nomLen of [4, 5, 6, 7, 8]) {
              for (const apeLen of [4, 5, 6, 7, 8]) {
                if (nomLen + apeLen > ocrConcat.length) continue;
                const namePart = ocrConcat.slice(0, nomLen);
                const apePart = ocrConcat.slice(ocrConcat.length - apeLen);
                // El namePart debe ser prefijo (o cercano) de nomConcat
                const lcsName = longestCommonSubstring(namePart, nomConcatForStr);
                const lcsApe = longestCommonSubstring(apePart, apeConcatForStr);
                // También verificar prefijo
                const prefNameMatch = nomConcatForStr.startsWith(namePart) ||
                  namePart.startsWith(nomConcatForStr.slice(0, Math.min(4, nomConcatForStr.length)));
                const prefApeMatch = apeConcatForStr.startsWith(apePart) ||
                  apePart.startsWith(apeConcatForStr.slice(0, Math.min(4, apeConcatForStr.length)));
                // Score: requiere que el namePart matchee bien Y el apePart también
                const nameOk = lcsName >= 3 || prefNameMatch;
                const apeOk = lcsApe >= 3 || prefApeMatch;
                if (nameOk && apeOk) {
                  const score = 0.55 + Math.min(0.3, (lcsName + lcsApe) * 0.01);
                  if (score > structuralScore) structuralScore = score;
                }
              }
            }
          }

          // También verificar concatenaciones (para nombres largos concatenados)
          const apeConcat = p.apellidos.toUpperCase().replace(/\s+/g, "");
          const nomConcat = p.nombres.toUpperCase().replace(/\s+/g, "");
          const variantes = [
            `${nomConcat}${apeConcat}`,
            `${apeConcat}${nomConcat}`,
          ];
          const concatHit = variantes.some(
            (v) => ocrConcat.includes(v) || v.includes(ocrConcat),
          );

          // Match si: al menos 2 tokens coinciden, O una concatenación coincide,
          // O el matching estructural encontró coincidencia
          if (tokenHits >= 2 || concatHit || structuralScore > 0) {
            const baseScore = 0.65 + Math.min(0.2, totalLcsChars * 0.005);
            const finalScore = Math.max(baseScore, structuralScore);
            if (!bestRobusto || finalScore > bestRobusto.sim) {
              bestRobusto = { id: p._id, nombre: nomApe, cargo: p.cargo, sim: finalScore, apeRatio: tokenHits / Math.max(1, allTokens.length) };
            }
          }
        }
      }

      // 2) Jaccard clásico como complemento
      const sim1 = similitud(ocrLimpio, apeNom);
      const sim2 = similitud(ocrLimpio, nomApe);
      const sim = Math.max(sim1, sim2);
      if (!bestJaccard || sim > bestJaccard.sim) {
        bestJaccard = { id: p._id, nombre: nomApe, cargo: p.cargo, sim };
      }
    }

    if (bestRobusto) {
      return {
        personalId: bestRobusto.id,
        nombre: bestRobusto.nombre,
        cargo: bestRobusto.cargo,
        fuente: "fuzzy",
        sim: bestRobusto.sim,
      };
    }
    if (bestJaccard && bestJaccard.sim >= 0.5) {
      return {
        personalId: bestJaccard.id,
        nombre: bestJaccard.nombre,
        cargo: bestJaccard.cargo,
        fuente: "fuzzy",
        sim: bestJaccard.sim,
      };
    }
    return { personalId: null, fuente: "sin-match", sim: bestJaccard?.sim ?? 0 };
  }, [matchesPorNombre, personales]);

  // Re-sugerir cada vez que cambian los nombres editados
  const filasConSugerencia = useMemo(() => {
    return filas.map((f) => {
      if (f.personalId) return f; // ya está forzado por el usuario
      const sug = calcularSugerencia(f.nombreEditable);
      return {
        ...f,
        sugerenciaPersonalId: sug.personalId,
        sugerenciaNombre: sug.nombre,
        sugerenciaSimilitud: sug.sim,
        sugerenciaFuente: sug.fuente as any,
      };
    });
  }, [filas, calcularSugerencia]);

  const actualizarFila = (filaId: string, patch: Partial<FilaParseada>) => {
    setFilas((prev) => prev.map((f) => (f.filaId === filaId ? { ...f, ...patch } : f)));
  };

  const eliminarFila = (filaId: string) => {
    setFilas((prev) => prev.filter((f) => f.filaId !== filaId));
  };

  const handleGuardar = async () => {
    if (!tienda) return;
    if (filasConSugerencia.length === 0) {
      toast.error("No hay filas para guardar");
      return;
    }
    setGuardando(true);
    try {
      // Auto-crear personal Self Checkout para filas SELF CHECKOUT XX sin match
      const selfCheckoutFaltantes = new Set<number>();
      for (const f of filasConSugerencia) {
        const m = f.nombreEditable.match(/^self[\s\-_]*checkout\s*(\d+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          const matched = f.personalId ?? f.sugerenciaPersonalId;
          if (!matched) {
            selfCheckoutFaltantes.add(num);
          }
        }
      }
      for (const num of selfCheckoutFaltantes) {
        try {
          await ensureSelfCheckout({ tiendaId: tienda._id, numero: num });
        } catch (e) {
          console.warn("No se pudo crear Self Checkout", num, e);
        }
      }

      const payload = filasConSugerencia.map((f) => ({
        nombreOriginal: f.nombreEditable,
        personalIdSugerido: (f.personalId ?? f.sugerenciaPersonalId ?? undefined) as
          | Id<"personales">
          | undefined,
        dias: f.dias
          .filter((d) => d.cantidad > 0)
          .map((d) => ({ fecha: d.fecha, cantidad: d.cantidad })),
        total: f.total,
      }));
      const res = await importar({ tiendaId: tienda._id, filas: payload as any });
      const matched = res.resultados.filter((r: any) => r.matched).length;
      const unmatched = res.resultados.length - matched;
      setResultadoImport({ resultados: res.resultados, totalGuardados: res.totalGuardados });
      if (unmatched > 0) {
        toast.warning(`${matched} filas con match · ${unmatched} sin match · ${res.totalGuardados} registros guardados`);
      } else {
        toast.success(`${matched} filas guardadas · ${res.totalGuardados} registros`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  const columnasDia = columnas.filter((c) => c.tipo === "dia");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> 1. Cargar imagen del informe
          </CardTitle>
          <CardDescription>
            Captura del informe diario de tinkas. La imagen debe incluir el encabezado con los días
            (jue-16, vie-17, etc.) y la columna TOTAL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <Label className="text-xs">Fecha (auto-detectada, editable)</Label>
              <Input
                type="date"
                value={fechaReferencia}
                onChange={(e) => setFechaReferencia(e.target.value)}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Se detecta del header de la primera columna (ej. &quot;jue-16&quot; → 16 del mes actual).
                Puedes ajustarla manualmente si la auto-detección falla.
              </p>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Imagen</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onSelectFile}
                className="h-9"
              />
            </div>
          </div>
          {imagePreview && (
            <div className="border rounded-lg p-2 bg-muted/30 flex flex-col md:flex-row gap-4">
              <img
                src={imagePreview}
                alt="preview"
                className="max-h-48 rounded border bg-white object-contain"
              />
              <div className="flex-1 flex flex-col gap-2 justify-center">
                {ocrStatus === "idle" && (
                  <Button onClick={procesarImagen} disabled={!imageFile}>
                    <Loader2 className="h-4 w-4 mr-2" /> Procesar con OCR
                  </Button>
                )}
                {ocrStatus === "loading" && (
                  <div className="text-sm text-muted-foreground">Cargando motor OCR…</div>
                )}
                {ocrStatus === "processing" && (
                  <div className="space-y-1">
                    <div className="text-sm flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {ocrStatusText} · {ocrProgress}%
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${ocrProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {ocrStatus === "done" && (
                  <Badge variant="secondary" className="self-start">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> OCR completado
                  </Badge>
                )}
                {ocrStatus === "error" && (
                  <Badge variant="destructive" className="self-start">
                    <XCircle className="h-3 w-3 mr-1" /> Error
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {filasConSugerencia.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Edit2 className="h-4 w-4" /> 2. Revisar y guardar
            </CardTitle>
            <CardDescription>
              {filasConSugerencia.length} filas detectadas · {columnasDia.length} columnas de día.
              Edita cualquier celda si el OCR no fue exacto. Luego presiona Guardar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto border rounded-lg max-h-[600px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="min-w-[220px]">Nombre detectado</TableHead>
                    <TableHead className="min-w-[200px]">Persona</TableHead>
                    <TableHead className="w-20 text-center bg-amber-50 dark:bg-amber-950/30">
                      Acum<br />
                      <span className="text-[10px] text-muted-foreground font-normal">Del 01 al 15</span>
                    </TableHead>
                    {columnasDia.map((c) => (
                      <TableHead key={c.index} className="w-20 text-center">
                        {c.label}
                        <div className="text-[10px] text-muted-foreground font-normal">
                          {c.fecha}
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-16 text-center bg-emerald-50 dark:bg-emerald-950/30">
                      Total<br />
                      <span className="text-[10px] text-muted-foreground font-normal">de imagen</span>
                    </TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filasConSugerencia.map((f, idx) => {
                    const sugBadge = f.personalId
                      ? { variant: "default" as const, label: "Manual", cls: "" }
                      : f.sugerenciaFuente === "exacto"
                      ? { variant: "default" as const, label: "Exacto", cls: "bg-emerald-500" }
                      : f.sugerenciaFuente === "fuzzy"
                      ? { variant: "secondary" as const, label: `Fuzzy ${Math.round((f.sugerenciaSimilitud ?? 0) * 100)}%`, cls: "" }
                      : f.sugerenciaFuente === "self-checkout"
                      ? { variant: "secondary" as const, label: "Self Checkout", cls: "" }
                      : { variant: "destructive" as const, label: "Sin match", cls: "" };
                    return (
                      <TableRow key={f.filaId}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <Input
                            value={f.nombreEditable}
                            onChange={(e) => actualizarFila(f.filaId, { nombreEditable: e.target.value, personalId: null })}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <SearchableSelect
                              className="flex-1 min-w-0"
                              value={f.personalId ?? f.sugerenciaPersonalId ?? null}
                              onChange={(v) =>
                                actualizarFila(f.filaId, { personalId: v })
                              }
                              placeholder="Buscar persona..."
                              options={[
                                { value: "__none__", label: "— Sin asignar —" },
                                ...(personales ?? [])
                                  .filter((p: any) => p.activo)
                                  .map((p: any) => ({
                                    value: p._id,
                                    label: `${p.apellidos} ${p.nombres}`,
                                    sublabel: p.nick,
                                    badge: p.cargo,
                                  })),
                              ]}
                            />
                            <Badge variant={sugBadge.variant} className={`shrink-0 ${sugBadge.cls}`}>
                              {sugBadge.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="p-1 bg-amber-50/50 dark:bg-amber-950/20">
                          <Input
                            type="number"
                            min={0}
                            value={f.acumulado ?? 0}
                            onChange={(e) => {
                              const nueva = Math.max(0, parseInt(e.target.value) || 0);
                              setFilas((prev) =>
                                prev.map((ff) => (ff.filaId === f.filaId ? { ...ff, acumulado: nueva } : ff))
                              );
                            }}
                            className="h-8 text-xs text-center w-16 bg-transparent"
                            title="Acumulado Del 01 al 15 (leído de la imagen, editable)"
                          />
                        </TableCell>
                        {columnasDia.map((c) => {
                          const d = f.dias.find((x) => x.fecha === c.fecha);
                          return (
                            <TableCell key={c.index} className="p-1">
                              <Input
                                type="number"
                                min={0}
                                value={d?.cantidad ?? 0}
                                onChange={(e) => {
                                  const nuevaCant = Math.max(0, parseInt(e.target.value) || 0);
                                  setFilas((prev) =>
                                    prev.map((ff) =>
                                      ff.filaId === f.filaId
                                        ? {
                                            ...ff,
                                            dias: ff.dias.map((dd) =>
                                              dd.fecha === c.fecha ? { ...dd, cantidad: nuevaCant } : dd
                                            ),
                                          }
                                        : ff
                                    )
                                  );
                                }}
                                className="h-8 text-xs text-center w-16"
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-semibold tabular-nums bg-emerald-50/50 dark:bg-emerald-950/20">
                          <Input
                            type="number"
                            min={0}
                            value={f.total}
                            onChange={(e) => {
                              const nueva = Math.max(0, parseInt(e.target.value) || 0);
                              setFilas((prev) =>
                                prev.map((ff) => (ff.filaId === f.filaId ? { ...ff, total: nueva } : ff))
                              );
                            }}
                            className="h-8 text-xs text-center w-16 font-semibold bg-transparent"
                            title="TOTAL leído de la imagen (última columna), editable"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => eliminarFila(f.filaId)}
                          >
                            <Trash2 className="h-3 w-3 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button
                onClick={handleGuardar}
                disabled={guardando || filasConSugerencia.length === 0}
              >
                {guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar {filasConSugerencia.length} filas
              </Button>
              <div className="text-xs text-muted-foreground">
                {filasConSugerencia.filter((f) => f.personalId ?? f.sugerenciaPersonalId).length} con match ·{" "}
                {filasConSugerencia.filter((f) => !(f.personalId ?? f.sugerenciaPersonalId)).length} sin match
              </div>
            </div>

            {resultadoImport && (
              <div className="mt-4 border rounded-lg p-3 bg-muted/30 space-y-2">
                <div className="text-sm font-semibold">Resultado de importación</div>
                <div className="text-xs">
                  <Badge variant="secondary">
                    {resultadoImport.totalGuardados} registros guardados
                  </Badge>{" "}
                  <Badge>
                    {resultadoImport.resultados.filter((r: any) => r.matched).length} filas con match
                  </Badge>{" "}
                  {resultadoImport.resultados.filter((r: any) => !r.matched).length > 0 && (
                    <Badge variant="destructive">
                      {resultadoImport.resultados.filter((r: any) => !r.matched).length} sin match
                    </Badge>
                  )}
                </div>
                {resultadoImport.resultados.filter((r: any) => !r.matched).length > 0 && (
                  <div className="text-xs text-amber-700 space-y-0.5 max-h-40 overflow-y-auto">
                    {resultadoImport.resultados
                      .filter((r: any) => !r.matched)
                      .map((r: any, i: number) => (
                        <div key={i}>
                          ⚠ &quot;{r.nombreOriginal}&quot; — crea este personal o asigna manualmente
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tip</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>
            • El OCR intenta identificar filas/columnas automáticamente. Si la imagen no se lee bien,
            edita los nombres y valores directamente antes de guardar.
          </p>
          <p>
            • Los nombres se emparejan con tu personal por{" "}
            <b>apellidos + nombres</b>. Las filas que digan &quot;SELF CHECKOUT XX&quot; se asignan al
            personal con cargo Self Checkout y ese número.
          </p>
          <p>
            • Solo se guardan los días (las columnas jue-16, vie-17, etc.). La columna &quot;Del 01 al 15&quot;
            y la columna &quot;TOTAL&quot; se ignoran.
          </p>
        </CardContent>
      </Card>

      {debugInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="h-4 w-4" /> Debug OCR
            </CardTitle>
            <CardDescription className="text-xs">
              Información de lo que leyó el OCR. Útil para diagnosticar problemas de detección.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-3">
            <div>
              <div className="font-semibold mb-1">Líneas detectadas: {debugInfo.lineas}</div>
              <div className="font-semibold mb-1">Fila de header (idx {debugInfo.headerLineIdx}):</div>
              <div className="font-mono bg-muted/50 p-2 rounded break-all">
                {debugInfo.headerTexto || "(no se detectó header)"}
              </div>
            </div>
            <div>
              <div className="font-semibold mb-1">Palabras del header ({debugInfo.headerWords.length}):</div>
              <div className="font-mono bg-muted/50 p-2 rounded max-h-32 overflow-y-auto">
                {debugInfo.headerWords.map((w, i) => (
                  <div key={i}>
                    [{i}] &quot;{w.text}&quot; @ x={Math.round(w.x0)}-{Math.round(w.x1)}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-semibold mb-1">Celdas agrupadas ({debugInfo.grupos.length}):</div>
              <div className="font-mono bg-muted/50 p-2 rounded max-h-32 overflow-y-auto">
                {debugInfo.grupos.map((g, i) => (
                  <div key={i}>
                    [{i}] &quot;{g.text}&quot; @ x={Math.round(g.x0)}-{Math.round(g.x1)}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-semibold mb-1">Columnas detectadas ({debugInfo.colsDetectadas.length}):</div>
              <div className="font-mono bg-muted/50 p-2 rounded max-h-32 overflow-y-auto">
                {debugInfo.colsDetectadas.map((c, i) => (
                  <div key={i}>
                    [{i}] tipo=<b>{c.tipo}</b> texto=&quot;{c.headerText}&quot; x={Math.round(c.left)}-{Math.round(c.right)}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================
// Parser de filas/columnas
// ============================
function extraerFilas(
  lineas: any[],
  fechaReferencia: string,
): {
  columnas: ColumnaDetectada[];
  filasDetectadas: FilaParseada[];
  debug: {
    lineas: number;
    headerLineIdx: number;
    headerTexto: string;
    headerWords: { text: string; x0: number; x1: number }[];
    grupos: { text: string; x0: number; x1: number }[];
    colsDetectadas: { tipo: string; headerText: string; left: number; right: number }[];
  };
} {
  // Ordenar por top (Y)
  const lineasOrdenadas = [...lineas]
    .filter((l) => l.text && l.text.trim().length > 0)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);

  if (lineasOrdenadas.length === 0) {
    return {
      columnas: [],
      filasDetectadas: [],
      debug: { lineas: 0, headerLineIdx: -1, headerTexto: "", headerWords: [], grupos: [], colsDetectadas: [] },
    };
  }

  // Detectar fila de encabezado: contiene "TOTAL" o "jue" "vie" etc. o "Del 01"
  let headerLineIdx = -1;
  for (let i = 0; i < Math.min(lineasOrdenadas.length, 8); i++) {
    const t = norm(lineasOrdenadas[i].text);
    if (
      t.includes("total") ||
      /\b(dom|lun|mar|mie|jue|vie|sab)\b/.test(t) ||
      /del\s*\d+/.test(t) ||
      /^\d{1,2}$/.test(t.trim())
    ) {
      headerLineIdx = i;
      break;
    }
  }
  if (headerLineIdx === -1) {
    // fallback: la fila con "TOTAL"
    for (let i = 0; i < lineasOrdenadas.length; i++) {
      if (norm(lineasOrdenadas[i].text).includes("total")) {
        headerLineIdx = i;
        break;
      }
    }
  }
  if (headerLineIdx === -1) {
    return {
      columnas: [],
      filasDetectadas: [],
      debug: {
        lineas: lineasOrdenadas.length,
        headerLineIdx: -1,
        headerTexto: "",
        headerWords: [],
        grupos: [],
        colsDetectadas: [],
      },
    };
  }

  const headerLine = lineasOrdenadas[headerLineIdx];
  const headerWords: any[] = (headerLine.words ?? [])
    .filter((w: any) => w.text && w.text.trim().length > 0)
    .sort((a: any, b: any) => a.bbox.x0 - b.bbox.x0);

  // Detectar columnas: agrupar palabras del header en celdas
  const palabrasHeader: { text: string; x0: number; x1: number; cx: number }[] = headerWords.map(
    (w: any) => ({
      text: w.text,
      x0: w.bbox.x0,
      x1: w.bbox.x1,
      cx: (w.bbox.x0 + w.bbox.x1) / 2,
    })
  );

  // Agrupar palabras contiguas (gap pequeño = misma celda)
  const gruposHeader: { text: string; x0: number; x1: number }[] = [];
  for (const w of palabrasHeader) {
    const last = gruposHeader[gruposHeader.length - 1];
    if (last && w.x0 - last.x1 < 25) {
      last.text += " " + w.text;
      last.x1 = w.x1;
    } else {
      gruposHeader.push({ text: w.text, x0: w.x0, x1: w.x1 });
    }
  }

  // Detectar cada columna
  const colsTemp: { index: number; left: number; right: number; headerText: string; tipo: ColumnaDetectada["tipo"]; fecha?: string; label?: string }[] = [];
  let i = 0;
  while (i < gruposHeader.length) {
    const g = gruposHeader[i];
    const t = norm(g.text);
    // Patrón día (con separador): "jue-16", "jue 16", "jue.16", "jue/16", etc.
    const dayMatch = t.match(/^(dom|lun|mar|mie|jue|vie|sab)\W*(\d{1,2})$/);
    if (dayMatch) {
      const diaSemana = dayMatch[1];
      const numDia = parseInt(dayMatch[2], 10);
      colsTemp.push({
        index: colsTemp.length,
        left: g.x0 - 8,
        right: g.x1 + 8,
        headerText: g.text,
        tipo: "dia",
        label: `${DIAS_SEMANA_CORTOS[diaSemana]}-${numDia}`,
      });
      i += 1;
      continue;
    }
    // Patrón día sin separador: "jue16", "lun20"
    const dayNoSepMatch = t.match(/^(dom|lun|mar|mie|jue|vie|sab)(\d{1,2})$/);
    if (dayNoSepMatch) {
      const diaSemana = dayNoSepMatch[1];
      const numDia = parseInt(dayNoSepMatch[2], 10);
      colsTemp.push({
        index: colsTemp.length,
        left: g.x0 - 8,
        right: g.x1 + 8,
        headerText: g.text,
        tipo: "dia",
        label: `${DIAS_SEMANA_CORTOS[diaSemana]}-${numDia}`,
      });
      i += 1;
      continue;
    }
    // Día con posible error OCR al final (e.g., "juev-16", "jue-1é")
    const dayFuzzyMatch = t.match(/^(dom|lun|mar|mie|jue|vie|sab)[a-z]?[\W_]*(\d{1,2})[a-z]?$/);
    if (dayFuzzyMatch) {
      const diaSemana = dayFuzzyMatch[1];
      const numDia = parseInt(dayFuzzyMatch[2], 10);
      if (numDia >= 1 && numDia <= 31) {
        colsTemp.push({
          index: colsTemp.length,
          left: g.x0 - 8,
          right: g.x1 + 8,
          headerText: g.text,
          tipo: "dia",
          label: `${DIAS_SEMANA_CORTOS[diaSemana]}-${numDia}`,
        });
        i += 1;
        continue;
      }
    }
    // Día separado: "jue" "16" (palabras no agrupadas)
    if (/^(dom|lun|mar|mie|jue|vie|sab)$/.test(t) && i + 1 < gruposHeader.length) {
      const next = gruposHeader[i + 1];
      const nextT = next.text.trim();
      if (/^\d{1,2}$/.test(nextT)) {
        const diaSemana = t;
        const numDia = parseInt(nextT, 10);
        colsTemp.push({
          index: colsTemp.length,
          left: g.x0 - 8,
          right: next.x1 + 8,
          headerText: `${g.text}-${nextT}`,
          tipo: "dia",
          label: `${DIAS_SEMANA_CORTOS[diaSemana]}-${numDia}`,
        });
        i += 2;
        continue;
      }
    }
    // Patrón "Del XX al YY" en una sola celda
    const rangoMatch = t.match(/^del\s+(\d{1,2})\s+al\s+(\d{1,2})$/);
    if (rangoMatch) {
      colsTemp.push({
        index: colsTemp.length,
        left: g.x0 - 8,
        right: g.x1 + 8,
        headerText: g.text,
        tipo: "rango",
      });
      i += 1;
      continue;
    }
    // "Del" solo: consumir hasta 3 palabras siguientes para formar "Del XX al YY"
    if (/^del$/.test(t) && i + 3 < gruposHeader.length) {
      const p1 = norm(gruposHeader[i + 1].text);
      const p2 = norm(gruposHeader[i + 2].text);
      const p3 = norm(gruposHeader[i + 3].text);
      if (/^\d{1,2}$/.test(p1) && /^al$/.test(p2) && /^\d{1,2}$/.test(p3)) {
        colsTemp.push({
          index: colsTemp.length,
          left: g.x0 - 8,
          right: gruposHeader[i + 3].x1 + 8,
          headerText: `${g.text} ${p1} ${p2} ${p3}`,
          tipo: "rango",
        });
        i += 4;
        continue;
      }
      // También aceptar "Del 01-15" o "Del 1 al 30" en celdas separadas
      if (/^\d{1,2}$/.test(p1) && /^\d{1,2}$/.test(p2)) {
        colsTemp.push({
          index: colsTemp.length,
          left: g.x0 - 8,
          right: gruposHeader[i + 2].x1 + 8,
          headerText: `${g.text} ${p1} ${p2}`,
          tipo: "rango",
        });
        i += 3;
        continue;
      }
    }
    if (/^total$/.test(t)) {
      colsTemp.push({
        index: colsTemp.length,
        left: g.x0 - 8,
        right: g.x1 + 8,
        headerText: g.text,
        tipo: "total",
      });
      i += 1;
      continue;
    }
    // Por defecto: celda desconocida
    colsTemp.push({
      index: colsTemp.length,
      left: g.x0 - 8,
      right: g.x1 + 8,
      headerText: g.text,
      tipo: "desconocido",
    });
    i += 1;
  }

  // Identificar columna de nombre:
  // 1) Si hay celdas desconocidas, la más a la izquierda es el nombre
  // 2) Si todas están clasificadas, fallback: la columna más a la izquierda
  //    que esté antes de la primera columna de día
  let idxNombre = colsTemp.findIndex((c) => c.tipo === "desconocido");
  if (idxNombre < 0) {
    const firstDia = colsTemp.findIndex((c) => c.tipo === "dia");
    if (firstDia > 0) {
      idxNombre = 0;
    }
  }
  if (idxNombre >= 0) {
    colsTemp[idxNombre].tipo = "nombre";
  }

  // Calcular fechas reales: la primera columna de tipo "dia" corresponde a fechaReferencia
  let colsDias = colsTemp.filter((c) => c.tipo === "dia");

  // Refinar/descubrir columnas desde los datos reales.
  // Esto es más robusto que depender solo del header porque usa las posiciones
  // reales de los valores numéricos en las filas de datos.
  {
    const headerBottom = headerLine.bbox.y1;
    const dataLinesForDetect = lineasOrdenadas.filter((l) => l.bbox.y0 > headerBottom + 2);
    // Tomar hasta 10 filas con valores numéricos
    const filasMuestra = dataLinesForDetect
      .filter((l) => (l.words ?? []).filter((w: any) => /^\d{1,4}$/.test(w.text.trim())).length >= 3)
      .slice(0, 10);

    if (filasMuestra.length >= 1) {
      // Recolectar TODAS las posiciones X de valores numéricos de las filas
      const numericPositions: { x: number; filaIdx: number }[] = [];
      filasMuestra.forEach((l, fi) => {
        for (const w of l.words ?? []) {
          if (/^\d{1,4}$/.test(w.text.trim())) {
            numericPositions.push({ x: (w.bbox.x0 + w.bbox.x1) / 2, filaIdx: fi });
          }
        }
      });

      if (numericPositions.length > 0) {
        // Ordenar y agrupar por cercanía
        numericPositions.sort((a, b) => a.x - b.x);
        const clusters: { cx: number; count: number; minX: number; maxX: number }[] = [];
        for (const np of numericPositions) {
          const last = clusters[clusters.length - 1];
          if (last && np.x - last.cx < 25) {
            last.cx = (last.cx * last.count + np.x) / (last.count + 1);
            last.count += 1;
            last.minX = Math.min(last.minX, np.x);
            last.maxX = Math.max(last.maxX, np.x);
          } else {
            clusters.push({ cx: np.x, count: 1, minX: np.x, maxX: np.x });
          }
        }

        // Calcular cuántas columnas numéricas detectó el header (excluyendo "nombre")
        const headerNumericCols = colsTemp.filter(
          (c) => c.tipo === "rango" || c.tipo === "dia" || c.tipo === "total",
        ).length;
        const dataColCount = clusters.length;

        // Si el header detectó columnas de día válidas, usar el header como
        // fuente de verdad para el NÚMERO de columnas. Los datos solo se
        // usan para refinar las posiciones X de las columnas existentes.
        const headerTieneDias = colsDias.length > 0;

        // Usar descubrimiento de datos SOLO si el header no detectó días
        // o si los datos tienen al menos 2 columnas menos que el header
        // (en ese caso el header está inflado).
        const usarDescubrimiento =
          !headerTieneDias ||
          (dataColCount >= 2 && headerNumericCols > dataColCount + 1);

        if (usarDescubrimiento && clusters.length >= 2) {
          // Guardar el orden de tipos detectado por el header
          const tiposHeader: string[] = colsTemp
            .filter((c) => c.tipo !== "desconocido" && c.tipo !== "nombre")
            .map((c) => c.tipo);

          // Reconstruir columnas desde los clusters
          colsTemp.length = 0;
          // Calcular anchos reales entre clusters
          const widths: number[] = [];
          for (let k = 0; k < clusters.length; k++) {
            if (k === 0) {
              widths.push(80);
            } else {
              const gap = clusters[k].cx - clusters[k - 1].cx;
              widths.push(gap);
            }
          }
          for (let k = 0; k < clusters.length; k++) {
            const cl = clusters[k];
            const isFirst = k === 0;
            const isLast = k === clusters.length - 1;
            const halfWidth = widths[k] / 2;
            // Determinar tipo: usar el orden del header si está disponible,
            // si no, asumir rango/dia/total
            let tipo: ColumnaDetectada["tipo"];
            if (tiposHeader.length === clusters.length) {
              tipo = tiposHeader[k] as ColumnaDetectada["tipo"];
            } else if (isFirst) {
              tipo = "rango";
            } else if (isLast) {
              tipo = "total";
            } else {
              tipo = "dia";
            }
            const col: ColumnaDetectada = {
              index: k + 1,
              left: cl.cx - halfWidth,
              right: cl.cx + halfWidth,
              headerText: tipo === "rango" ? "Del 01 al 15" : tipo === "total" ? "TOTAL" : `día ${k}`,
              tipo,
            };
            colsTemp.push(col);
          }
          // Insertar columna "nombre" antes de todo
          colsTemp.unshift({
            index: 0,
            left: 0,
            right: clusters[0].cx - 30,
            headerText: "NOMBRE",
            tipo: "nombre",
          });
          colsTemp.forEach((c, idx) => (c.index = idx));
        } else if (dataColCount >= 2) {
          // El header ya tiene días. Solo ajustar las posiciones usando los
          // clusters de datos como REFERENCIA (no como fuente de verdad).
          // Si un cluster está muy lejos de la posición esperada del header,
          // IGNORARLO (probablemente es ruido del OCR).
          const clustersSorted = [...clusters].sort((a, b) => a.cx - b.cx);
          const colsNumericas = colsTemp
            .filter((c) => c.tipo !== "desconocido" && c.tipo !== "nombre")
            .sort((a, b) => a.left - b.left);
          for (let k = 0; k < colsNumericas.length && k < clustersSorted.length; k++) {
            const cl = clustersSorted[k];
            const headerCenter = (colsNumericas[k].left + colsNumericas[k].right) / 2;
            const dist = Math.abs(cl.cx - headerCenter);
            // Si el cluster está a más de 200px del centro del header, ignorarlo
            // (probablemente es ruido o un valor de otra columna)
            if (dist > 200) continue;
            // Solo ajustar si está razonablemente cerca
            if (dist < 100) {
              const halfWidth = (colsNumericas[k].right - colsNumericas[k].left) / 2;
              colsNumericas[k].left = cl.cx - halfWidth;
              colsNumericas[k].right = cl.cx + halfWidth;
            }
          }
        }
      }
    }
  }

  // Recalcular colsDias después del posible fallback
  colsDias = colsTemp.filter((c) => c.tipo === "dia");
  colsDias.forEach((c, idx) => {
    c.fecha = addDaysToISO(fechaReferencia, idx);
  });

  // Si la primera columna de día tiene un day-of-week en el label, validar
  // (esto no cambia el cálculo, solo es informativo)

  // Determinar boundaries (left/right) usando centroides
  // Cada columna de día ocupa [left, right]. Para la primera columna, left puede ser 0.
  // Ordenar por X
  colsTemp.sort((a, b) => a.left - b.left);
  // Reindexar
  colsTemp.forEach((c, idx) => (c.index = idx));

  // Recalcular boundaries asumiendo que el espacio entre centros se reparte
  for (let k = 0; k < colsTemp.length; k++) {
    const c = colsTemp[k];
    if (k > 0) c.left = Math.max(c.left, (colsTemp[k - 1].right + c.left) / 2);
    if (k < colsTemp.length - 1) {
      const next = colsTemp[k + 1];
      c.right = Math.min(c.right, (c.right + next.left) / 2);
    }
  }

  // Procesar filas de datos: las que están debajo del header
  const headerBottom = headerLine.bbox.y1;
  let dataLines = lineasOrdenadas.filter((l) => l.bbox.y0 > headerBottom + 2);

  // Detectar la fila TOTAL: la primera que tenga "total"/"totales"/"subtotal"
  // como primera palabra (puede traer valores numéricos concatenados)
  const idxTotal = dataLines.findIndex((l) => {
    const tt = norm(l.text);
    const primera = tt.split(/\s+/)[0];
    return primera === "total" || primera === "totales" || primera === "subtotal";
  });
  if (idxTotal >= 0) {
    dataLines = dataLines.slice(0, idxTotal);
  } else {
    // Fallback: descartar la última fila si su primera palabra es un número grande
    // (típico cuando el OCR separa "TOTAL" y sus valores en líneas distintas)
    if (dataLines.length > 0) {
      const ultima = dataLines[dataLines.length - 1];
      const primera = norm(ultima.text).split(/\s+/)[0];
      if (/^\d{2,4}$/.test(primera)) {
        dataLines = dataLines.slice(0, -1);
      }
    }
  }

  // Agrupar líneas muy cercanas (multi-línea para un mismo registro) si comparten centro X
  // Para simplificar, asumimos 1 línea = 1 fila.
  const filasDetectadas: FilaParseada[] = [];
  let contador = 0;
  for (const line of dataLines) {
    const t = norm(line.text);
    if (!t) continue;
    // Filtrar línea de TOTAL por si acaso (defensa adicional)
    const primeraPalabra = t.split(/\s+/)[0];
    if (primeraPalabra === "total" || primeraPalabra === "totales" || primeraPalabra === "subtotal") {
      continue;
    }
    // Filtrar filas que sean solo números (artefactos del TOTAL separado)
    const tokens = t.split(/\s+/);
    const todosNumeros = tokens.every((tk) => /^\d{1,4}$/.test(tk));
    if (todosNumeros && tokens.length >= 3) {
      continue;
    }

    const words: any[] = (line.words ?? [])
      .filter((w: any) => w.text && w.text.trim().length > 0)
      .sort((a: any, b: any) => a.bbox.x0 - b.bbox.x0);

    if (words.length === 0) continue;

    // Asignar palabras a columnas según X
    const celdas: Record<number, string[]> = {};
    for (const w of words) {
      const cx = (w.bbox.x0 + w.bbox.x1) / 2;
      const col = colsTemp.find((c) => cx >= c.left && cx <= c.right);
      if (col) {
        if (!celdas[col.index]) celdas[col.index] = [];
        celdas[col.index].push(w.text);
      } else {
        // Si está después de la última columna, asignar a la última
        const last = colsTemp[colsTemp.length - 1];
        if (last && cx > last.left) {
          if (!celdas[last.index]) celdas[last.index] = [];
          celdas[last.index].push(w.text);
        }
      }
    }

    const nombreCol = colsTemp.find((c) => c.tipo === "nombre");
    const totalCol = colsTemp.find((c) => c.tipo === "total");
    const rangoCol = colsTemp.find((c) => c.tipo === "rango");
    const nombre =
      nombreCol && celdas[nombreCol.index]
        ? celdas[nombreCol.index].join(" ").trim()
        : words
            .filter((w) => {
              const cx = (w.bbox.x0 + w.bbox.x1) / 2;
              return !colsTemp.some((c) => c.tipo === "dia" || c.tipo === "total") || cx < (colsTemp.find((c) => c.tipo === "dia")?.left ?? Infinity);
            })
            .map((w) => w.text)
            .join(" ")
            .trim();

    if (!nombre) continue;

    const totalNum = totalCol && celdas[totalCol.index]
      ? parseInt((celdas[totalCol.index].join("") || "0").replace(/[^\d]/g, ""), 10) || 0
      : 0;

    const acumuladoNum = rangoCol && celdas[rangoCol.index]
      ? parseInt((celdas[rangoCol.index].join("") || "0").replace(/[^\d]/g, ""), 10) || 0
      : 0;

    const diasFila = colsDias.map((c) => {
      const txt = (celdas[c.index] ?? []).join("");
      const num = parseInt(txt.replace(/[^\d]/g, ""), 10) || 0;
      return {
        fecha: c.fecha!,
        label: c.label!,
        cantidad: num,
      };
    });

    contador++;
    filasDetectadas.push({
      filaId: `f${Date.now()}_${contador}`,
      nombreOriginal: nombre,
      nombreEditable: nombre,
      personalId: null,
      sugerenciaPersonalId: null,
      dias: diasFila,
      total: totalNum,
      acumulado: acumuladoNum,
    });
  }

  return {
    columnas: colsTemp,
    filasDetectadas,
    debug: {
      lineas: lineasOrdenadas.length,
      headerLineIdx,
      headerTexto: headerLine ? headerLine.text : "",
      headerWords: palabrasHeader.map((p) => ({ text: p.text, x0: p.x0, x1: p.x1 })),
      grupos: gruposHeader,
      colsDetectadas: colsTemp.map((c) => ({
        tipo: c.tipo,
        headerText: c.headerText,
        left: c.left,
        right: c.right,
      })),
    },
  };
}

// ============================
// Similitud Jaccard para nombres
// ============================
function limpiarNombreOcr(s: string): string {
  // Quita caracteres no-letrales (comunes cuando el OCR lee bordes de tabla como "|", "-", ":", etc.)
  // y caracteres sueltos (1-2 letras) que suelen ser artefactos.
  // También elimina tokens de 1 carácter (típicos de "—", "|", "/", etc. leídos como "I", "L", "i")
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-zñÑüÜ\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2) // eliminar tokens de 1 carácter (artefactos)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensUtiles(s: string): string[] {
  // Tokens de al menos 2 letras; filtra "I", "L", etc. que son artefactos típicos de líneas OCR
  return s
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

// Verifica si un token OCR es prefijo de un token del personal (o viceversa)
// con suficiente superposición. Mínimo 3 caracteres en común.
function prefijoCompatible(ocrTok: string, personalTok: string): boolean {
  const a = ocrTok.toUpperCase();
  const b = personalTok.toUpperCase();
  if (a.length < 3 || b.length < 3) return false;
  // a es prefijo de b (OCR truncó el apellido, ej: "ANCAJ" de "ANCAJIMA")
  if (b.startsWith(a)) return true;
  // b es prefijo de a (OCR leyó caracteres extra)
  if (a.startsWith(b)) return true;
  // prefijo común >= 3 letras
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 3;
}

// Matching robusto por apellidos + primera letra del nombre
// Devuelve { match, score, fuente } donde:
//  - match=true si los apellidos (al menos 1 con prefijo) + 1 letra de nombre coinciden
//  - score es 0..1
function matchPorApellidosYNombre(
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

  // Contar cuántos apellidos del personal matchean con algún token OCR (prefijo-compatible)
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

  // Verificar al menos 1 letra del nombre presente en OCR
  let nomMatch = false;
  for (const nom of nomTokens) {
    if (nom.length === 0) continue;
    const primeraLetra = nom[0];
    for (const tok of ocrTokens) {
      if (tok.length > 0 && tok[0] === primeraLetra) {
        nomMatch = true;
        break;
      }
    }
    if (nomMatch) break;
  }

  // Score combinado: 70% apellidos + 30% nombre
  const score = apeMatchRatio * 0.7 + (nomMatch ? 0.3 : 0);

  // Match si: al menos 1 apellido compatible Y al menos 1 letra del nombre coincide
  const match = apeMatchCount >= 1 && nomMatch;

  return { match, score, apeMatchRatio, nomMatch };
}

// Encuentra la longitud de la subcadena común más larga entre dos strings.
// Útil para matching tolerante a caracteres perdidos por el OCR.
function longestCommonSubstring(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  if (m * n > 100000) {
    // Para strings muy largos, usar una versión más eficiente
    let best = 0;
    for (let i = 0; i < m; i++) {
      let len = 0;
      for (let j = 0; j < n; j++) {
        if (a[i] === b[j]) {
          len++;
          if (len > best) best = len;
        } else {
          len = 0;
        }
      }
    }
    return best;
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  let best = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > best) best = dp[i][j];
      } else {
        dp[i][j] = 0;
      }
    }
  }
  return best;
}

function similitud(a: string, b: string): number {
  const a1 = a
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zñü\s]/g, "")
    .trim();
  const b1 = b
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zñü\s]/g, "")
    .trim();
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

// ============================
// TAB 2: Análisis
// ============================
function AnalisisTab() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );

  const today = toISODate(new Date());
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return toISODate(d);
  });
  const [fechaHasta, setFechaHasta] = useState(today);
  const [filtroCargo, setFiltroCargo] = useState<string>("todos");
  const [personaSel, setPersonaSel] = useState<string>("");

  const serie = useQuery(
    api.indicadores.getTinkasRango,
    tienda ? { tiendaId: tienda._id, fechaInicio: fechaDesde, fechaFin: fechaHasta } : "skip"
  );
  const setTinka = useMutation(api.indicadores.setTinka);

  const persMap = useMemo(() => {
    return new Map<string, any>((personales ?? []).map((p: any) => [p._id as string, p]));
  }, [personales]);

  const personalesFiltrados = useMemo(() => {
    if (!personales) return [];
    if (filtroCargo === "todos") return personales;
    return personales.filter((p: any) => p.cargo === filtroCargo);
  }, [personales, filtroCargo]);

  const serieFiltrada = useMemo(() => {
    return (serie ?? []).filter((s: any) => {
      if (filtroCargo !== "todos") {
        const p = persMap.get(s.personalId);
        if (!p || p.cargo !== filtroCargo) return false;
      }
      return true;
    });
  }, [serie, persMap, filtroCargo]);

  const fechas = useMemo(() => {
    const set = new Set<string>();
    (serie ?? []).forEach((s: any) => set.add(s.fecha));
    return Array.from(set).sort();
  }, [serie]);

  const totalesPorFecha = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of serieFiltrada) {
      m[s.fecha] = (m[s.fecha] || 0) + s.cantidad;
    }
    return fechas.map((f) => ({ fecha: f, label: f.slice(5), total: m[f] || 0 }));
  }, [serieFiltrada, fechas]);

  const totalesPorPersona = useMemo(() => {
    const m: Record<string, { total: number; nombre: string; cargo: string; dias: number; id: string }> = {};
    for (const s of serieFiltrada) {
      const p = persMap.get(s.personalId);
      if (!p) continue;
      if (!m[s.personalId]) {
        m[s.personalId] = { total: 0, nombre: `${p.nombres} ${p.apellidos}`.trim(), cargo: p.cargo, dias: 0, id: p._id };
      }
      m[s.personalId].total += s.cantidad;
      m[s.personalId].dias += 1;
    }
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [serieFiltrada, persMap]);

  const evolucionPersona = useMemo(() => {
    if (!personaSel || !fechas.length) return [];
    return fechas
      .map((f) => {
        const s = (serie ?? []).find((x: any) => x.fecha === f && x.personalId === personaSel);
        return { fecha: f, label: f.slice(5), cantidad: s?.cantidad ?? 0 };
      });
  }, [personaSel, fechas, serie]);

  const promediosPorDiaSemana = useMemo(() => {
    const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const m: Record<number, number[]> = {};
    for (let i = 0; i < 7; i++) m[i] = [];
    for (const s of serieFiltrada) {
      const dow = getDayOfWeek(s.fecha);
      m[dow].push(s.cantidad);
    }
    return DIAS.map((d, i) => ({
      dia: d,
      promedio: m[i].length > 0 ? m[i].reduce((a, b) => a + b, 0) / m[i].length : 0,
      registros: m[i].length,
    }));
  }, [serieFiltrada]);

  const handleSetTinka = async (personalId: string, fecha: string, cantidad: number) => {
    await setTinka({ personalId: personalId as Id<"personales">, fecha, cantidad });
  };

  const setQuick = (period: string) => {
    const t = today;
    if (period === "hoy") {
      setFechaDesde(t);
      setFechaHasta(t);
    } else if (period === "ayer") {
      const a = addDaysToISO(t, -1);
      setFechaDesde(a);
      setFechaHasta(a);
    } else if (period === "semana") {
      setFechaDesde(toISODate(getWeekStart(new Date())));
      setFechaHasta(t);
    } else if (period === "mes") {
      const d = new Date();
      const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      setFechaDesde(ini);
      setFechaHasta(t);
    } else if (period === "30dias") {
      setFechaDesde(addDaysToISO(t, -30));
      setFechaHasta(t);
    }
  };

  const totalRegistros = serieFiltrada.length;
  const totalAcumulado = serieFiltrada.reduce((s, x: any) => s + x.cantidad, 0);
  const promedioPorRegistro = totalRegistros > 0 ? totalAcumulado / totalRegistros : 0;
  const maximoDiario = totalesPorFecha.reduce((m, x) => Math.max(m, x.total), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Análisis y seguimiento por persona
          </CardTitle>
          <CardDescription>
            Histórico, ranking, comparativa por día y tabla densa editable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Cargo</Label>
              <Select value={filtroCargo} onValueChange={setFiltroCargo}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Cajer@">Cajer@</SelectItem>
                  <SelectItem value="Self Checkout">Self Checkout</SelectItem>
                  <SelectItem value="RS">RS</SelectItem>
                  <SelectItem value="Ecommerce">Ecommerce</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Persona (para evolución)</Label>
              <Select value={personaSel} onValueChange={setPersonaSel}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Ninguna —</SelectItem>
                  {personalesFiltrados.map((p: any) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.apellidos} {p.nombres} ({p.nick})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">Período rápido:</span>
            {["hoy", "ayer", "semana", "mes", "30dias"].map((p) => (
              <Button key={p} size="sm" variant="outline" onClick={() => setQuick(p)}>
                {p === "hoy" ? "Hoy" : p === "ayer" ? "Ayer" : p === "semana" ? "Semana" : p === "mes" ? "Mes" : "30 días"}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiMini label="Registros" value={totalRegistros.toLocaleString()} />
            <KpiMini label="Acumulado" value={totalAcumulado.toLocaleString()} />
            <KpiMini label="Promedio/registro" value={promedioPorRegistro.toFixed(1)} />
            <KpiMini label="Máx. diario" value={maximoDiario.toLocaleString()} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tinkas por día</CardTitle>
          </CardHeader>
          <CardContent>
            {totalesPorFecha.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">Sin datos</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={totalesPorFecha}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Promedio por día de la semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={promediosPorDiaSemana}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="promedio" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {personaSel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4" /> Evolución: {personalesFiltrados.find((p: any) => p._id === personaSel)?.nombres ?? ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evolucionPersona.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">Sin datos para el rango</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={evolucionPersona}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="cantidad" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Ranking por persona
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-96">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Persona</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Promedio/día</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {totalesPorPersona.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">
                      Sin datos
                    </TableCell>
                  </TableRow>
                ) : (
                  totalesPorPersona.map((p, i) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{i + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{p.nombre}</TableCell>
                      <TableCell><Badge variant="secondary">{p.cargo}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{p.dias}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold">{p.total}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(p.dias > 0 ? p.total / p.dias : 0).toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Edit2 className="h-4 w-4" /> Tabla densa (editable)
          </CardTitle>
          <CardDescription className="text-xs">
            Click en cualquier celda para editar. Tinka = 0 se guarda como 0.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TablaDensa
            personales={personalesFiltrados}
            fechas={fechas}
            serie={serie ?? []}
            onChange={handleSetTinka}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function KpiMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

function TablaDensa({
  personales, fechas, serie, onChange,
}: {
  personales: any[]; fechas: string[]; serie: any[]; onChange: (personalId: string, fecha: string, cant: number) => void;
}) {
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");

  const getValor = (personalId: string, fecha: string): number => {
    const s = serie.find((x) => x.personalId === personalId && x.fecha === fecha);
    return s?.cantidad ?? 0;
  };

  const startEdit = (key: string, current: number) => {
    setEditKey(key);
    setEditVal(String(current));
  };

  const commitEdit = (personalId: string, fecha: string) => {
    const n = Math.max(0, parseInt(editVal) || 0);
    onChange(personalId, fecha, n);
    setEditKey(null);
  };

  return (
    <div className="overflow-auto border rounded-lg max-h-[600px]">
      <table className="text-xs border-collapse w-full">
        <thead className="sticky top-0 bg-background z-10">
          <tr>
            <th className="text-left px-2 py-1.5 font-semibold border-b min-w-[180px] sticky left-0 bg-background">
              Persona
            </th>
            {fechas.map((f) => (
              <th key={f} className="text-center px-1 py-1.5 font-semibold border-b w-16">
                {f.slice(5)}
              </th>
            ))}
            <th className="text-center px-2 py-1.5 font-semibold border-b w-16 bg-muted/50">Total</th>
          </tr>
        </thead>
        <tbody>
          {personales.length === 0 || fechas.length === 0 ? (
            <tr>
              <td colSpan={fechas.length + 2} className="text-center py-6 text-muted-foreground">
                Sin datos
              </td>
            </tr>
          ) : (
            (() => {
              return personales.map((p) => {
                let total = 0;
                return (
                  <tr key={p._id} className="hover:bg-muted/30">
                    <td className="px-2 py-1 border-b sticky left-0 bg-background font-medium">
                      {p.apellidos} {p.nombres}
                      <div className="text-[10px] text-muted-foreground">{p.cargo} · {p.nick}</div>
                    </td>
                    {fechas.map((f) => {
                      const val = getValor(p._id, f);
                      total += val;
                      const key = `${p._id}_${f}`;
                      const isEditing = editKey === key;
                      return (
                        <td key={f} className="text-center border-b p-0">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              value={editVal}
                              autoFocus
                              onChange={(e) => setEditVal(e.target.value)}
                              onBlur={() => commitEdit(p._id, f)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(p._id, f);
                                if (e.key === "Escape") setEditKey(null);
                              }}
                              className="h-7 w-14 text-center text-xs mx-auto"
                            />
                          ) : (
                            <button
                              onClick={() => startEdit(key, val)}
                              className={`w-full h-7 text-center hover:bg-blue-100 ${
                                val > 0 ? "font-semibold" : "text-muted-foreground"
                              }`}
                            >
                              {val}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center font-bold border-b bg-muted/50">{total}</td>
                  </tr>
                );
              });
            })()
          )}
        </tbody>
      </table>
    </div>
  );
}
