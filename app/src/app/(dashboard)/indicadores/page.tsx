"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Save, TrendingUp, FileUp, CheckCircle2, XCircle, Calendar, Filter,
  ChevronUp, ChevronDown, ChevronsUpDown, Search
} from "lucide-react";
import { toISODate, getWeekStart, addDays } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell, LabelList
} from "recharts";

type SemaphoreStatus = "green" | "yellow" | "red";
type Metrica = "debito" | "total" | "credito";
type TipoValor = "valor" | "cumplimiento";
type TopModo = "mejores" | "peores" | "ambos";

const DEFAULT_META_DEBITO = 4.0;
const DEFAULT_META_TOTAL = 17.5;

function formatPct(value: number, decimals = 2): string {
  if (isNaN(value)) return "0%";
  return `${value.toFixed(decimals)}%`;
}

function formatDateDMY(fecha: string): string {
  const parts = fecha.split("-");
  if (parts.length !== 3) return fecha;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function clasificarSemaforo(valor: number, meta: number): SemaphoreStatus {
  if (!valor) return "red";
  const ratio = valor / meta;
  if (ratio >= 1.0) return "green";
  if (ratio >= 0.8) return "yellow";
  return "red";
}

function colorSemaforo(status: SemaphoreStatus): string {
  return status === "green" ? "#10B981" : status === "yellow" ? "#F59E0B" : "#EF4444";
}

function lunesDeSemana(fechaStr: string): string {
  const parts = fechaStr.split("-").map(Number);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const lunes = new Date(dt);
  lunes.setDate(dt.getDate() + diff);
  return `${lunes.getFullYear()}-${String(lunes.getMonth() + 1).padStart(2, "0")}-${String(lunes.getDate()).padStart(2, "0")}`;
}

function getSemanas(fechas: string[]): string[] {
  return [...new Set(fechas.map(lunesDeSemana))].sort();
}

function calcularPromedio(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function parseInforme(texto: string): { ok: { codigo: string; debitoPct: number; creditoPct: number; totalPct: number }[]; errores: string[] } {
  const ok: { codigo: string; debitoPct: number; creditoPct: number; totalPct: number }[] = [];
  const errores: string[] = [];
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lineas.length; i++) {
    const lin = lineas[i];
    if (/^codigo/i.test(lin)) continue;
    const partes = lin.split(/[,;\t]/).map((p) => p.trim());
    if (partes.length < 4) {
      errores.push(`Línea ${i + 1}: formato inválido → "${lin}"`);
      continue;
    }
    const [codigo, debStr, creStr, totStr] = partes;
    const debitoPct = parseFloat(debStr);
    const creditoPct = parseFloat(creStr);
    const totalPct = parseFloat(totStr);
    if (!codigo || isNaN(debitoPct) || isNaN(creditoPct) || isNaN(totalPct)) {
      errores.push(`Línea ${i + 1}: datos inválidos → "${lin}"`);
      continue;
    }
    ok.push({ codigo, debitoPct, creditoPct, totalPct });
  }
  return { ok, errores };
}

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

export default function IndicadoresPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true, cargo: "Cajer@" } : "skip"
  );

  // Estado de filtros
  const today = toISODate(new Date());
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return toISODate(d);
  });
  const [fechaHasta, setFechaHasta] = useState(today);
  const [operador, setOperador] = useState("");
  const [metrica, setMetrica] = useState<Metrica>("debito");
  const [tipo, setTipo] = useState<TipoValor>("valor");
  const [semana, setSemana] = useState("todas");
  const [topModo, setTopModo] = useState<TopModo>("mejores");
  const [topCant, setTopCant] = useState(10);
  const [metaDebito, setMetaDebito] = useState(DEFAULT_META_DEBITO);
  const [metaTotal, setMetaTotal] = useState(DEFAULT_META_TOTAL);
  const [fechaImportar, setFechaImportar] = useState(today);

  const importar = useMutation(api.indicadores.importarInformeSIP);
  const serieDiaria = useQuery(
    api.indicadores.getParticipacionesRango,
    tienda ? { tiendaId: tienda._id, fechaInicio: fechaDesde, fechaFin: fechaHasta } : "skip"
  );

  const persMap = useMemo(() => {
    return new Map<string, any>((personales ?? []).map((p: any) => [p._id, p]));
  }, [personales]);

  // Convierte participaciones a formato Register para los gráficos
  const registers = useMemo(() => {
    return (serieDiaria ?? []).map((s: any) => {
      const p = persMap.get(s.personalId);
      return {
        _id: `${s.personalId}_${s.fecha}`,
        fecha: s.fecha,
        operadorId: s.personalId,
        operadorNombre: p ? `${p.nombres} ${p.apellidos} (${p.nick})` : null,
        debito: s.debitoPct,
        total: s.totalPct,
        credito: Math.max(0, s.totalPct - s.debitoPct),
        sedeId: tienda?._id ?? "",
        marcaTemporal: "",
        sheetRowHash: `${s.personalId}_${s.fecha}`,
        createdAt: 0,
        updatedAt: 0,
      };
    });
  }, [serieDiaria, persMap, tienda]);

  const filteredRegisters = useMemo(() => {
    return registers.filter((r) => {
      if (r.fecha < fechaDesde || r.fecha > fechaHasta) return false;
      if (operador && r.operadorId !== operador) return false;
      return true;
    });
  }, [registers, fechaDesde, fechaHasta, operador]);

  const semanas = useMemo(() => getSemanas(registers.map((r) => r.fecha)), [registers]);
  const operadoresList = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of registers) {
      m.set(r.operadorId, r.operadorNombre ?? `Operador ${r.operadorId}`);
    }
    return Array.from(m.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [registers]);

  const handleQuickPeriod = (period: string) => {
    const t = today;
    switch (period) {
      case "hoy":
        setFechaDesde(t); setFechaHasta(t); break;
      case "ayer": {
        const a = new Date(); a.setDate(a.getDate() - 1);
        const ayer = toISODate(a);
        setFechaDesde(ayer); setFechaHasta(ayer); break;
      }
      case "semana": {
        const lunes = getWeekStart(new Date());
        const lunesStr = toISODate(lunes);
        setFechaDesde(lunesStr); setFechaHasta(t); break;
      }
      case "mes": {
        const d = new Date();
        const primerDia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        setFechaDesde(primerDia); setFechaHasta(t); break;
      }
      case "todos": {
        if (registers.length > 0) {
          const sorted = [...registers].sort((a, b) => a.fecha.localeCompare(b.fecha));
          setFechaDesde(sorted[0].fecha);
          setFechaHasta(sorted[sorted.length - 1].fecha);
        }
        break;
      }
    }
    setSemana("todas");
  };

  const handleSemanaChange = (s: string) => {
    setSemana(s);
    if (s !== "todas") {
      const [y, m, d] = s.split("-").map(Number);
      const lunes = new Date(y, m - 1, d);
      const domingo = new Date(lunes);
      domingo.setDate(lunes.getDate() + 6);
      setFechaDesde(toISODate(lunes));
      setFechaHasta(toISODate(domingo));
    }
  };

  const resetFilters = () => {
    setOperador("");
    setSemana("todas");
    handleQuickPeriod("mes");
  };

  return (
    <div className="min-h-screen bg-gray-50 -m-6 p-6">
      <header className="bg-white shadow-sm border-l-4 border-blue-600 px-6 py-4 mb-4 rounded-xl">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Dashboard Participación SIP
            </h1>
            <p className="text-sm text-gray-500">
              {tienda?.nombre ?? "Tienda"} · Tarjeta SIP · Débito y Total
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <Label>Meta débito</Label>
              <Input
                type="number" step="0.1" value={metaDebito}
                onChange={(e) => setMetaDebito(parseFloat(e.target.value) || 0)}
                className="w-16 h-8"
              />
              <Label>Meta total</Label>
              <Input
                type="number" step="0.1" value={metaTotal}
                onChange={(e) => setMetaTotal(parseFloat(e.target.value) || 0)}
                className="w-16 h-8"
              />
            </div>
          </div>
        </div>
      </header>

      <KPICards registers={filteredRegisters} metaDebito={metaDebito} metaTotal={metaTotal} />

      <Filters
        operadores={operadoresList}
        semanas={semanas}
        filters={{ fechaDesde, fechaHasta, operador, metrica, tipo, semana }}
        setFilter={(k, v) => {
          if (k === "fechaDesde") setFechaDesde(v as string);
          else if (k === "fechaHasta") setFechaHasta(v as string);
          else if (k === "operador") setOperador(v as string);
          else if (k === "metrica") setMetrica(v as Metrica);
          else if (k === "tipo") setTipo(v as TipoValor);
        }}
        onQuickPeriod={handleQuickPeriod}
        onSemanaChange={handleSemanaChange}
        onReset={resetFilters}
        topModo={topModo}
        setTopModo={setTopModo}
        topCant={topCant}
        setTopCant={setTopCant}
      />

      <Charts
        registers={filteredRegisters}
        metaDebito={metaDebito}
        metaTotal={metaTotal}
        metrica={metrica}
        tipo={tipo}
        topModo={topModo}
        topCant={topCant}
      />

      <DataTable registers={filteredRegisters} />

      <ImportarInforme
        tiendaId={tienda?._id}
        fecha={fechaImportar}
        setFecha={setFechaImportar}
        personales={personales ?? []}
        onImportar={async (lineas) => {
          if (!tienda) return;
          const res = await importar({
            tiendaId: tienda._id,
            fecha: fechaImportar,
            lineas,
          });
          const matched = res.filter((r) => r.matched).length;
          const unmatched = res.length - matched;
          if (unmatched > 0) {
            toast.warning(`${matched} OK, ${unmatched} sin match (revisa el código)`);
          } else {
            toast.success(`${matched} cajeros actualizados`);
          }
          return res;
        }}
      />
    </div>
  );
}

// =================== KPI Cards ===================

function KPICards({ registers, metaDebito, metaTotal }: { registers: any[]; metaDebito: number; metaTotal: number }) {
  if (registers.length === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-gray-200 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
            <div className="h-7 bg-gray-200 rounded w-16 mt-3" />
            <div className="h-3 bg-gray-200 rounded w-32 mt-2" />
          </div>
        ))}
      </div>
    );
  }

  const promDebito = calcularPromedio(registers.map((r) => r.debito));
  const promTotal = calcularPromedio(registers.map((r) => r.total));
  const promCredito = promTotal - promDebito;
  const semDebito = clasificarSemaforo(promDebito, metaDebito);
  const semCredito = clasificarSemaforo(promCredito, metaDebito);
  const semTotal = clasificarSemaforo(promTotal, metaTotal);
  const cumDebitoPct = (registers.filter((r) => r.debito >= metaDebito).length / registers.length) * 100;
  const cumTotalPct = (registers.filter((r) => r.total >= metaTotal).length / registers.length) * 100;
  const cajerosUnicos = new Set(registers.map((r) => r.operadorId)).size;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
      <KPICard label="Débito SIP" value={formatPct(promDebito)} sub={`Promedio · Meta ${formatPct(metaDebito)}`} colorClass="border-blue-500" semaforo={semDebito} />
      <KPICard label="Crédito SIP" value={formatPct(promCredito)} sub="Total - Débito" colorClass="border-purple-500" semaforo={semCredito} />
      <KPICard label="Total SIP" value={formatPct(promTotal)} sub={`Promedio · Meta ${formatPct(metaTotal)}`} colorClass="border-emerald-500" semaforo={semTotal} />
      <KPICard label="Cumpl. Débito" value={`${cumDebitoPct.toFixed(1)}%`} sub={`Meta ${formatPct(metaDebito)}`} colorClass="border-amber-500" />
      <KPICard label="Registros" value={registers.length.toString()} sub={`${cajerosUnicos} cajeros`} colorClass="border-cyan-500" />
    </div>
  );
}

function KPICard({ label, value, sub, colorClass, semaforo }: { label: string; value: string; sub: string; colorClass: string; semaforo?: SemaphoreStatus }) {
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${colorClass} relative`}>
      <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1.5">{value}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>
      {semaforo && (
        <div className="absolute right-3 top-3 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorSemaforo(semaforo) }} />
      )}
    </div>
  );
}

// =================== Filters ===================

function Filters({
  operadores, semanas, filters, setFilter, onQuickPeriod, onSemanaChange, onReset,
  topModo, setTopModo, topCant, setTopCant
}: any) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-3">
        <div>
          <label className="block text-[10px] text-gray-500 font-semibold mb-1">Desde</label>
          <input type="date" value={filters.fechaDesde} onChange={(e) => setFilter("fechaDesde", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 font-semibold mb-1">Hasta</label>
          <input type="date" value={filters.fechaHasta} onChange={(e) => setFilter("fechaHasta", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 font-semibold mb-1">Operador</label>
          <select value={filters.operador} onChange={(e) => setFilter("operador", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos</option>
            {operadores.map((op: any) => <option key={op.id} value={op.id}>{op.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 font-semibold mb-1">Métrica</label>
          <select value={filters.metrica} onChange={(e) => setFilter("metrica", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="debito">Débito</option>
            <option value="total">Total</option>
            <option value="credito">Crédito</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 font-semibold mb-1">Tipo</label>
          <select value={filters.tipo} onChange={(e) => setFilter("tipo", e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="valor">Valor</option>
            <option value="cumplimiento">Cumplimiento</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 font-semibold mb-1">Semana</label>
          <select value={filters.semana} onChange={(e) => onSemanaChange(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="todas">Todas</option>
            {semanas.map((s: string, i: number) => <option key={s} value={s}>Sem {i + 1} ({formatDateDMY(s)})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 font-semibold mb-1">Top N</label>
          <select value={topCant} onChange={(e) => setTopCant(Number(e.target.value))}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-semibold">Período:</span>
        {["hoy", "ayer", "semana", "mes", "todos"].map((p) => (
          <button key={p} onClick={() => onQuickPeriod(p)}
            className="px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold hover:bg-blue-100">
            {p === "hoy" ? "Hoy" : p === "ayer" ? "Ayer" : p === "semana" ? "Esta semana" : p === "mes" ? "Este mes" : "Todo"}
          </button>
        ))}
        <button onClick={onReset} className="px-3 py-1 bg-red-50 text-red-600 rounded-md text-xs font-semibold hover:bg-red-100 ml-2">
          Limpiar
        </button>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-semibold">Ranking:</span>
            {(["mejores", "peores", "ambos"] as TopModo[]).map((m) => (
              <button key={m} onClick={() => setTopModo(m)}
                className={`px-3 py-1 rounded-md text-xs font-semibold ${topModo === m
                  ? m === "mejores" ? "bg-emerald-500 text-white"
                  : m === "peores" ? "bg-red-500 text-white"
                  : "bg-gray-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {m === "mejores" ? "Mejores" : m === "peores" ? "Peores" : "Ambos"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />≥100%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />80-99%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />&lt;80%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== Charts ===================

function Charts({ registers, metaDebito, metaTotal, metrica, tipo, topModo, topCant }: any) {
  if (registers.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm h-80 flex items-center justify-center text-gray-400">
          No hay datos para mostrar
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm h-80 flex items-center justify-center text-gray-400">
          No hay datos para mostrar
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4 mb-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EvolucionChart registers={registers} metrica={metrica} tipo={tipo} metaDebito={metaDebito} metaTotal={metaTotal} />
        <RankingChart registers={registers} metrica={metrica} tipo={tipo} metaDebito={metaDebito} metaTotal={metaTotal} topModo={topModo} topCant={topCant} />
      </div>
      <SemanaChart registers={registers} metaDebito={metaDebito} metaTotal={metaTotal} metrica={metrica} />
    </div>
  );
}

function EvolucionChart({ registers, metrica, tipo, metaDebito, metaTotal }: any) {
  const porDia: Record<string, { debito: number[]; total: number[]; credito: number[] }> = {};
  for (const r of registers) {
    if (!porDia[r.fecha]) porDia[r.fecha] = { debito: [], total: [], credito: [] };
    porDia[r.fecha].debito.push(r.debito);
    porDia[r.fecha].total.push(r.total);
    porDia[r.fecha].credito.push(r.credito);
  }
  const data = Object.entries(porDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, vals]) => ({
      fecha,
      label: formatDateDMY(fecha),
      debito: calcularPromedio(vals.debito),
      total: calcularPromedio(vals.total),
      credito: calcularPromedio(vals.credito),
    }));
  const meta = metrica === "debito" ? metaDebito : metrica === "credito" ? metaDebito : metaTotal;
  const metaRef = tipo === "cumplimiento" ? 100 : meta;
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <h3 className="text-sm font-semibold mb-3 text-gray-800">Evolución Diaria</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
          <Tooltip formatter={(v: any) => formatPct(Number(v))} />
          <Legend />
          <ReferenceLine y={metaRef} stroke="#10B981" strokeDasharray="5 5" label={{ value: "Meta", position: "right", fontSize: 10 }} />
          {metrica === "debito" ? (
            <Line type="monotone" dataKey="debito" stroke="#2563EB" strokeWidth={2} dot={false} name="Débito" />
          ) : metrica === "credito" ? (
            <Line type="monotone" dataKey="credito" stroke="#8B5CF6" strokeWidth={2} dot={false} name="Crédito" />
          ) : (
            <>
              <Line type="monotone" dataKey="debito" stroke="#2563EB" strokeWidth={2} dot={false} name="Débito" />
              <Line type="monotone" dataKey="total" stroke="#10B981" strokeWidth={2} dot={false} name="Total" />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SemanaChart({ registers, metaDebito, metaTotal, metrica }: any) {
  const DIAS = [
    { idx: 1, nombre: "Lun", nombreCompleto: "Lunes" },
    { idx: 2, nombre: "Mar", nombreCompleto: "Martes" },
    { idx: 3, nombre: "Mié", nombreCompleto: "Miércoles" },
    { idx: 4, nombre: "Jue", nombreCompleto: "Jueves" },
    { idx: 5, nombre: "Vie", nombreCompleto: "Viernes" },
    { idx: 6, nombre: "Sáb", nombreCompleto: "Sábado" },
    { idx: 0, nombre: "Dom", nombreCompleto: "Domingo" },
  ];
  const porDiaSemana: Record<number, { debito: number[]; total: number[]; credito: number[] }> = {};
  for (let i = 0; i < 7; i++) porDiaSemana[DIAS[i].idx] = { debito: [], total: [], credito: [] };
  for (const r of registers) {
    const [y, m, d] = r.fecha.split("-").map(Number);
    const diaIdx = new Date(y, m - 1, d).getDay();
    porDiaSemana[diaIdx].debito.push(r.debito);
    porDiaSemana[diaIdx].total.push(r.total);
    porDiaSemana[diaIdx].credito.push(r.credito);
  }
  const meta = metrica === "debito" ? metaDebito : metrica === "credito" ? metaDebito : metaTotal;
  const data = DIAS.map((d) => {
    const vals = porDiaSemana[d.idx];
    const promDebito = vals.debito.length > 0 ? calcularPromedio(vals.debito) : 0;
    const promTotal = vals.total.length > 0 ? calcularPromedio(vals.total) : 0;
    const promCredito = vals.credito.length > 0 ? calcularPromedio(vals.credito) : 0;
    const value = metrica === "debito" ? promDebito : metrica === "credito" ? promCredito : promTotal;
    return {
      dia: d.nombre,
      diaCompleto: d.nombreCompleto,
      value,
      semaforo: clasificarSemaforo(value, meta),
      registros: vals.debito.length,
    };
  });
  const nombreMetrica = metrica === "debito" ? "Débito" : metrica === "credito" ? "Crédito" : "Total";
  const colorBar = metrica === "debito" ? "#2563EB" : metrica === "credito" ? "#8B5CF6" : "#10B981";
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Promedio por Día de la Semana · {nombreMetrica}</h3>
        <div className="text-xs text-gray-400">
          Meta {formatPct(meta)} · 🟢 ≥100% · 🟡 80-99% · 🔴 &lt;80%
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="dia" tick={{ fontSize: 12, fontWeight: 600 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
          <Tooltip
            formatter={(value: any, _name: any, props: any) => [
              formatPct(Number(value)),
              `${props?.payload?.diaCompleto} (${props?.payload?.registros} reg.)`,
            ]}
          />
          <ReferenceLine y={meta} stroke={colorBar} strokeDasharray="5 5" label={{ value: "Meta", position: "right", fontSize: 10 }} />
          <Bar dataKey="value" name={nombreMetrica} radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={colorSemaforo(entry.semaforo)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RankingChart({ registers, metrica, tipo, metaDebito, metaTotal, topModo, topCant }: any) {
  const porOperador: Record<string, { debito: number[]; total: number[]; nombre: string }> = {};
  for (const r of registers) {
    if (!porOperador[r.operadorId]) {
      porOperador[r.operadorId] = { debito: [], total: [], nombre: r.operadorNombre ?? `Operador ${r.operadorId}` };
    }
    porOperador[r.operadorId].debito.push(r.debito);
    porOperador[r.operadorId].total.push(r.total);
  }
  const meta = metrica === "debito" ? metaDebito : metrica === "credito" ? metaDebito : metaTotal;
  let data = Object.entries(porOperador).map(([opId, vals]) => {
    const promDebito = calcularPromedio(vals.debito);
    const promTotal = calcularPromedio(vals.total);
    const promCredito = promTotal - promDebito;
    const value = metrica === "debito" ? promDebito : metrica === "credito" ? promCredito : promTotal;
    const semaforo = tipo === "cumplimiento"
      ? clasificarSemaforo((value / meta) * 100, 100)
      : clasificarSemaforo(value, meta);
    return {
      nombre: vals.nombre.length > 18 ? vals.nombre.slice(0, 18) + "..." : vals.nombre,
      nombreCompleto: vals.nombre,
      value,
      semaforo,
      registros: vals.debito.length,
    };
  }).sort((a, b) => b.value - a.value);

  if (topModo === "mejores") data = data.slice(0, topCant);
  else if (topModo === "peores") data = data.slice(-topCant).reverse();
  else data = [...data.slice(-topCant).reverse(), ...data.slice(0, topCant)];

  const nombreMetrica = metrica === "debito" ? "Débito" : metrica === "credito" ? "Crédito" : "Total";
  const colorBar = metrica === "debito" ? "#2563EB" : metrica === "credito" ? "#8B5CF6" : "#10B981";
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Ranking de Cajeros · {nombreMetrica}</h3>
        <div className="text-xs text-gray-400">🟢 ≥100% · 🟡 80-99% · 🔴 &lt;80%</div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={110} />
          <Tooltip
            formatter={(value: any, _name: any, props: any) => [
              formatPct(Number(value)),
              `${props?.payload?.nombreCompleto} (${props?.payload?.registros} reg.)`,
            ]}
          />
          <ReferenceLine x={meta} stroke={colorBar} strokeDasharray="5 5" label={{ value: "Meta", position: "top", fontSize: 10 }} />
          <Bar dataKey="value" name={nombreMetrica} radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={colorSemaforo(entry.semaforo)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// =================== Importar ===================

function ImportarInforme({ tiendaId, fecha, setFecha, personales, onImportar }: any) {
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<any>(null);

  const parsed = useMemo(() => parseInforme(texto), [texto]);
  const promedio = useMemo(() => {
    if (parsed.ok.length === 0) return null;
    const n = parsed.ok.length;
    const sum = parsed.ok.reduce(
      (acc, l) => ({ debito: acc.debito + l.debitoPct, credito: acc.credito + l.creditoPct, total: acc.total + l.totalPct }),
      { debito: 0, credito: 0, total: 0 }
    );
    return { debito: (sum.debito / n).toFixed(2), credito: (sum.credito / n).toFixed(2), total: (sum.total / n).toFixed(2), n };
  }, [parsed]);

  const codesPreview = useMemo(() => {
    if (!personales.length || parsed.ok.length === 0) return new Map<string, string>();
    const norm = (s: string) => s.toUpperCase();
    const map = new Map<string, string>();
    for (const p of personales) {
      if (p.nick) map.set(norm(p.nick), p.nick);
      if (p.codigoEmpleado) map.set(norm(p.codigoEmpleado), p.nick);
      if (p.codigoOperadorCaja) map.set(norm(p.codigoOperadorCaja), p.nick);
    }
    return map;
  }, [personales, parsed]);

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex flex-wrap justify-between items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileUp className="h-4 w-4" /> Importar informe (pegar)
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Fecha:</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" />
          </div>
        </div>
        <CardDescription>
          Formato: <code className="text-xs bg-muted px-1 py-0.5 rounded">CodigoCajero,PartDebito,PartCredito,PartTotal</code>{" "}
          · match por <b>nick</b>, <b>código de empleado</b> u <b>operador de caja</b>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Ejemplo:\nC001,3.2,1.8,5.0\nC002,2.8,2.2,5.0\nC003,3.5,1.5,5.0`}
          rows={5}
          className="font-mono text-xs"
        />
        {parsed.ok.length > 0 && (
          <div className="text-xs space-y-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{parsed.ok.length} líneas válidas</Badge>
              {parsed.errores.length > 0 && <Badge variant="destructive">{parsed.errores.length} con error</Badge>}
              {promedio && (
                <Badge variant="outline">
                  Promedio: {promedio.debito}% débito · {promedio.credito}% crédito · {promedio.total}% total
                </Badge>
              )}
            </div>
            <div className="border rounded p-2 max-h-28 overflow-y-auto bg-gray-50">
              {parsed.ok.map((l, i) => {
                const match = codesPreview.get(l.codigo.toUpperCase());
                return (
                  <div key={i} className="flex justify-between font-mono">
                    <span>
                      {match
                        ? <CheckCircle2 className="inline h-3 w-3 text-green-600 mr-1" />
                        : <XCircle className="inline h-3 w-3 text-amber-500 mr-1" />}
                      {l.codigo}
                    </span>
                    <span>D {l.debitoPct}% · C {l.creditoPct}% · T {l.totalPct}%{match ? ` → ${match}` : " (sin match)"}</span>
                  </div>
                );
              })}
            </div>
            {parsed.errores.length > 0 && (
              <div className="text-red-600 text-xs space-y-0.5">
                {parsed.errores.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            disabled={!tiendaId || parsed.ok.length === 0}
            onClick={async () => {
              try {
                const res = await onImportar(parsed.ok);
                if (res) {
                  setResultado({
                    matched: res.filter((r: any) => r.matched).map((r: any) => ({ codigo: r.codigo, nombre: r.nombre })),
                    unmatched: res.filter((r: any) => !r.matched).map((r: any) => r.codigo),
                  });
                }
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <Save className="h-4 w-4 mr-2" /> Guardar informe en {fecha}
          </Button>
        </div>
        {resultado && (
          <div className="text-xs space-y-1 border-t pt-2">
            {resultado.matched.length > 0 && <div className="text-green-700">✓ {resultado.matched.length} actualizados</div>}
            {resultado.unmatched.length > 0 && <div className="text-amber-700">⚠ Sin match: {resultado.unmatched.join(", ")}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =================== DataTable ===================

function DataTable({ registers }: { registers: any[] }) {
  const [sortKey, setSortKey] = useState<"fecha" | "operador" | "debito" | "total" | "credito">("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchText, setSearchText] = useState("");
  const [filterOperador, setFilterOperador] = useState("");
  const [filterFechaDesde, setFilterFechaDesde] = useState("");
  const [filterFechaHasta, setFilterFechaHasta] = useState("");
  const [filterDebitoMin, setFilterDebitoMin] = useState("");
  const [filterDebitoMax, setFilterDebitoMax] = useState("");
  const [filterTotalMin, setFilterTotalMin] = useState("");
  const [filterTotalMax, setFilterTotalMax] = useState("");
  const [filterCreditoMin, setFilterCreditoMin] = useState("");
  const [filterCreditoMax, setFilterCreditoMax] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const operadoresUnicos = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of registers) m.set(r.operadorId, r.operadorNombre ?? `Operador ${r.operadorId}`);
    return Array.from(m.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [registers]);

  const filteredAndSorted = useMemo(() => {
    let res = [...registers];
    if (filterOperador) res = res.filter((r) => r.operadorId === filterOperador);
    if (filterFechaDesde) res = res.filter((r) => r.fecha >= filterFechaDesde);
    if (filterFechaHasta) res = res.filter((r) => r.fecha <= filterFechaHasta);
    const dMin = parseFloat(filterDebitoMin); const dMax = parseFloat(filterDebitoMax);
    if (!isNaN(dMin)) res = res.filter((r) => r.debito >= dMin);
    if (!isNaN(dMax)) res = res.filter((r) => r.debito <= dMax);
    const tMin = parseFloat(filterTotalMin); const tMax = parseFloat(filterTotalMax);
    if (!isNaN(tMin)) res = res.filter((r) => r.total >= tMin);
    if (!isNaN(tMax)) res = res.filter((r) => r.total <= tMax);
    const cMin = parseFloat(filterCreditoMin); const cMax = parseFloat(filterCreditoMax);
    if (!isNaN(cMin)) res = res.filter((r) => r.credito >= cMin);
    if (!isNaN(cMax)) res = res.filter((r) => r.credito <= cMax);
    if (searchText.trim()) {
      const t = searchText.toLowerCase();
      res = res.filter((r) => (r.operadorNombre ?? "").toLowerCase().includes(t) || r.operadorId.includes(t));
    }
    res.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "fecha") cmp = a.fecha.localeCompare(b.fecha);
      else if (sortKey === "operador") cmp = (a.operadorNombre ?? "").localeCompare(b.operadorNombre ?? "");
      else if (sortKey === "debito") cmp = a.debito - b.debito;
      else if (sortKey === "total") cmp = a.total - b.total;
      else if (sortKey === "credito") cmp = a.credito - b.credito;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return res;
  }, [registers, sortKey, sortDir, filterOperador, filterFechaDesde, filterFechaHasta, filterDebitoMin, filterDebitoMax, filterTotalMin, filterTotalMax, filterCreditoMin, filterCreditoMax, searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, filteredAndSorted.length);
  const pageRegisters = filteredAndSorted.slice(startIdx, endIdx);

  const handleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const handleClearFilters = () => {
    setFilterOperador(""); setFilterFechaDesde(""); setFilterFechaHasta("");
    setFilterDebitoMin(""); setFilterDebitoMax(""); setFilterTotalMin(""); setFilterTotalMax("");
    setFilterCreditoMin(""); setFilterCreditoMax(""); setSearchText(""); setPage(1);
  };

  const hasActiveFilters = filterOperador || filterFechaDesde || filterFechaHasta || filterDebitoMin || filterDebitoMax || filterTotalMin || filterTotalMax || filterCreditoMin || filterCreditoMax || searchText;

  const SortIcon = ({ col }: { col: typeof sortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 text-gray-300 ml-1" />;
    return sortDir === "asc" ? <ChevronUp className="inline h-3 w-3 text-blue-600 ml-1" /> : <ChevronDown className="inline h-3 w-3 text-blue-600 ml-1" />;
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Detalle de Registros</h3>
        <span className="text-xs text-gray-400">
          Mostrando {startIdx + 1}-{endIdx} de {filteredAndSorted.length} registros
          {hasActiveFilters && <span className="ml-2 text-blue-600">(filtrado de {registers.length})</span>}
        </span>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 mb-3">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
          <div>
            <label className="block text-[10px] text-gray-500 font-semibold mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input value={searchText} onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                placeholder="Nombre o ID..."
                className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-semibold mb-1">Operador</label>
            <select value={filterOperador} onChange={(e) => { setFilterOperador(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos</option>
              {operadoresUnicos.map((op) => <option key={op.id} value={op.id}>{op.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-semibold mb-1">Desde</label>
            <input type="date" value={filterFechaDesde} onChange={(e) => { setFilterFechaDesde(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-semibold mb-1">Hasta</label>
            <input type="date" value={filterFechaHasta} onChange={(e) => { setFilterFechaHasta(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-semibold mb-1">Débito mín - máx</label>
            <div className="flex gap-1">
              <input type="number" step="0.1" placeholder="mín" value={filterDebitoMin} onChange={(e) => { setFilterDebitoMin(e.target.value); setPage(1); }}
                className="w-1/2 px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" step="0.1" placeholder="máx" value={filterDebitoMax} onChange={(e) => { setFilterDebitoMax(e.target.value); setPage(1); }}
                className="w-1/2 px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-semibold mb-1">Total mín - máx</label>
            <div className="flex gap-1">
              <input type="number" step="0.1" placeholder="mín" value={filterTotalMin} onChange={(e) => { setFilterTotalMin(e.target.value); setPage(1); }}
                className="w-1/2 px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" step="0.1" placeholder="máx" value={filterTotalMax} onChange={(e) => { setFilterTotalMax(e.target.value); setPage(1); }}
                className="w-1/2 px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 max-w-xs">
            <label className="block text-[10px] text-gray-500 font-semibold mb-1">Crédito mín - máx</label>
            <div className="flex gap-1">
              <input type="number" step="0.1" placeholder="mín" value={filterCreditoMin} onChange={(e) => { setFilterCreditoMin(e.target.value); setPage(1); }}
                className="w-1/2 px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" step="0.1" placeholder="máx" value={filterCreditoMax} onChange={(e) => { setFilterCreditoMax(e.target.value); setPage(1); }}
                className="w-1/2 px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {hasActiveFilters && (
            <button onClick={handleClearFilters}
              className="self-end px-3 py-1.5 bg-red-50 text-red-600 rounded text-xs font-semibold hover:bg-red-100">
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="overflow-auto max-h-96 border border-gray-100 rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              <th onClick={() => handleSort("fecha")} className="text-left px-3 py-2 font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 select-none">Fecha <SortIcon col="fecha" /></th>
              <th onClick={() => handleSort("operador")} className="text-left px-3 py-2 font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 select-none">Operador <SortIcon col="operador" /></th>
              <th onClick={() => handleSort("debito")} className="text-right px-3 py-2 font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 select-none">Débito <SortIcon col="debito" /></th>
              <th onClick={() => handleSort("total")} className="text-right px-3 py-2 font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 select-none">Total <SortIcon col="total" /></th>
              <th onClick={() => handleSort("credito")} className="text-right px-3 py-2 font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 select-none">Crédito <SortIcon col="credito" /></th>
            </tr>
          </thead>
          <tbody>
            {pageRegisters.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No hay registros que coincidan con los filtros</td></tr>
            ) : pageRegisters.map((r, i) => (
              <tr key={r._id || i} className="border-t border-gray-100 hover:bg-blue-50">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateDMY(r.fecha)}</td>
                <td className="px-3 py-2">{r.operadorNombre ?? `Operador ${r.operadorId}`}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.debito.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.total.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.credito.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-3 text-sm">
          <span className="text-xs text-gray-500">Página {currentPage} de {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(1)} disabled={currentPage === 1} className="px-3 py-1 border border-gray-200 rounded text-xs font-semibold hover:bg-gray-50 disabled:opacity-40">«</button>
            <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-200 rounded text-xs font-semibold hover:bg-gray-50 disabled:opacity-40">‹ Ant</button>
            <button onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-200 rounded text-xs font-semibold hover:bg-gray-50 disabled:opacity-40">Sig ›</button>
            <button onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-200 rounded text-xs font-semibold hover:bg-gray-50 disabled:opacity-40">»</button>
          </div>
        </div>
      )}
    </div>
  );
}
