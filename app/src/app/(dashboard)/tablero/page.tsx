"use client";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, X, Clock, Plus, CheckCircle2, AlertTriangle, GripVertical, XCircle } from "lucide-react";
import { toISODate, formatHorario } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useAuth";

const TURNOS_COLOR: Record<string, string> = {
  "Cajer@": "bg-red-100 border-red-300",
  "Self Checkout": "bg-yellow-100 border-yellow-300",
  "RS": "bg-blue-100 border-blue-300",
  "Ecommerce": "bg-purple-100 border-purple-300",
  "Supervisor(@)": "bg-green-100 border-green-300",
  "JefeCajas": "bg-orange-100 border-orange-300",
};

const CAJA_TIPO_ICON: Record<string, string> = {
  regular: "🟥",
  rapida: "🟦",
  autoservicio: "🟩",
};

type DragPayload =
  | { tipo: "disponible"; personalId: string }
  | { tipo: "asignado-caja"; personalId: string; asignacionId: string }
  | { tipo: "asignado-tarea"; personalId: string; asignacionId: string };

function parseDragData(e: React.DragEvent): DragPayload | null {
  try {
    const json = e.dataTransfer.getData("application/json");
    if (json) {
      const parsed = JSON.parse(json);
      if (parsed && parsed.tipo && parsed.personalId) return parsed as DragPayload;
    }
    const legacy = e.dataTransfer.getData("text/plain");
    if (legacy) return { tipo: "disponible", personalId: legacy };
  } catch {}
  return null;
}

export default function TableroPage() {
  const { profile } = useCurrentUser();
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const cajas = useQuery(api.cajas.listCajas, tienda ? { tiendaId: tienda._id } : "skip");
  const funciones = useQuery(api.cajas.listFunciones, tienda ? { tiendaId: tienda._id } : "skip");
  const personales = useQuery(api.personales.list, tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip");

  const [fecha, setFecha] = useState(toISODate(new Date()));
  const [hora, setHora] = useState("");

  useEffect(() => {
    const actualizar = () => {
      const d = new Date();
      setFecha(toISODate(d));
      setHora(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    actualizar();
    const i = setInterval(actualizar, 30000);
    return () => clearInterval(i);
  }, []);

  const tablero = useQuery(
    api.tablero.getTablero,
    tienda && hora ? { tiendaId: tienda._id, fecha, hora } : "skip"
  );

  const upsertAsignacion = useMutation(api.cajas.upsertAsignacion);
  const setEstado = useMutation(api.cajas.setEstado);
  const createFuncion = useMutation(api.cajas.createFuncion);
  const asignarSoloTarea = useMutation(api.cajas.asignarSoloTarea);
  const limpiarTablero = useMutation(api.cajas.limpiarTablero);
  const cambiarCajaMut = useMutation(api.cajas.cambiarCaja);
  const swapCajas = useMutation(api.cajas.swapCajas);
  const swapTareas = useMutation(api.cajas.swapTareas);

  const personalesMap = useMemo(() => new Map(personales?.map((p: any) => [p._id, p])), [personales]);
  const cajasMap = useMemo(() => new Map(cajas?.map((c: any) => [c._id, c])), [cajas]);
  const funcionesMap = useMemo(() => new Map(funciones?.map((f: any) => [f._id, f])), [funciones]);

  // Mapas para vincular la asignación complementaria de cada persona
  // (cuando alguien está en caja y tarea a la vez, los buscamos en el otro lado)
  const tareasPorPersona = useMemo(() => {
    const m = new Map<string, any>();
    (tablero?.enTareas ?? []).forEach((t: any) => {
      if (!m.has(t.personalId)) m.set(t.personalId, t);
    });
    return m;
  }, [tablero]);
  const cajasPorPersona = useMemo(() => {
    const m = new Map<string, any>();
    (tablero?.enCaja ?? []).forEach((c: any) => {
      if (!m.has(c.personalId)) m.set(c.personalId, c);
    });
    return m;
  }, [tablero]);

  // Orden de cargos para mantener consistencia
  const CARGO_ORDER: Record<string, number> = {
    "Cajer@": 0,
    "Self Checkout": 1,
    "Ecommerce": 2,
    "RS": 3,
    "Supervisor(@)": 4,
    "JefeCajas": 5,
  };

  const [dragOverCaja, setDragOverCaja] = useState<string | null>(null);
  const [dragOverFuncion, setDragOverFuncion] = useState<string | null>(null);
  const [dragOverPersonaTarea, setDragOverPersonaTarea] = useState<string | null>(null);
  const [dragOverDisponible, setDragOverDisponible] = useState(false);
  const [cajaSeleccionada, setCajaSeleccionada] = useState<{ persona: any; tipo: "rapida" | "cualquiera" } | null>(null);
  const [funcionSeleccionada, setFuncionSeleccionada] = useState<any | null>(null);
  const [modalNuevaFuncion, setModalNuevaFuncion] = useState(false);
  const [nuevaFuncion, setNuevaFuncion] = useState({ nombre: "", color: "#3b82f6" });

  function setDragData(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", payload.personalId);
    e.dataTransfer.effectAllowed = "move";
  }

  async function handleAsignarCaja(persona: any, cajaId: Id<"cajas">) {
    if (!tienda) return;
    const caja = cajasMap.get(cajaId);
    if (!caja) return;
    const asigActual = (tablero?.enCaja ?? []).find((a: any) => a.personalId === persona.personalId);
    const asigTarea = (tablero?.enTareas ?? []).find((a: any) => a.personalId === persona.personalId);
    const asigPrevia = asigActual ?? asigTarea;
    // Si el destino ya tiene otra persona, finalizarla primero
    const ocupante = (tablero?.enCaja ?? []).find(
      (a: any) => a.cajaCodigo === (caja as any).codigo && a.personalId !== persona.personalId,
    );
    try {
      if (ocupante) {
        await setEstado({ asignacionId: ocupante.asignacionId, estado: "finalizada" });
      }
      await upsertAsignacion({
        id: asigPrevia?.asignacionId as any,
        tiendaId: tienda._id,
        fecha,
        cajaId,
        personalId: persona.personalId,
        horaInicio: persona.entrada!,
        horaFin: persona.salida!,
        bloque: 1,
        funcionSecundaria: asigPrevia?.funcionSecundariaId as any,
        estado: "activa",
      });
      toast.success(`${persona.nombre} → Caja ${(caja as any).codigo}`);
      setCajaSeleccionada(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleAsignarTarea(persona: any, funcionId: Id<"funcionesSecundarias">) {
    if (!tienda) return;
    const funcion = funcionesMap.get(funcionId);
    if (!funcion) return;
    // Buscar SOLO una asignación de tarea existente (no tocar la de caja)
    const asigTarea = (tablero?.enTareas ?? []).find((a: any) => a.personalId === persona.personalId);
    try {
      if (asigTarea) {
        // Actualizar la tarea existente (cajaId siempre undefined en tareas)
        await upsertAsignacion({
          id: asigTarea.asignacionId as any,
          tiendaId: tienda._id,
          fecha,
          cajaId: undefined,
          personalId: persona.personalId,
          horaInicio: persona.entrada!,
          horaFin: persona.salida!,
          bloque: 1,
          funcionSecundaria: funcionId,
          estado: "activa",
        });
      } else {
        // Crear nueva asignación de tarea (asignarSoloTarea no toca la caja si existe)
        await asignarSoloTarea({
          tiendaId: tienda._id,
          fecha,
          personalId: persona.personalId,
          funcionSecundariaId: funcionId,
          horaInicio: persona.entrada!,
          horaFin: persona.salida!,
        });
      }
      toast.success(`${persona.nombre} → ${(funcion as any).nombre}`);
      setFuncionSeleccionada(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleMoverCaja(asignacionId: string, nuevaCajaId: Id<"cajas">) {
    try {
      await cambiarCajaMut({ asignacionId: asignacionId as any, nuevaCajaId });
      toast.success("Persona movida de caja");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSwapCaja(asignacionId1: string, asignacionId2: string) {
    if (asignacionId1 === asignacionId2) return;
    try {
      await swapCajas({ asignacionId1: asignacionId1 as any, asignacionId2: asignacionId2 as any });
      toast.success("Cajas intercambiadas");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSwapTarea(asignacionId1: string, asignacionId2: string) {
    if (asignacionId1 === asignacionId2) return;
    try {
      await swapTareas({ asignacionId1: asignacionId1 as any, asignacionId2: asignacionId2 as any });
      toast.success("Tareas intercambiadas");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Mover a una caja: si la persona tenía una tarea, se la quita
  async function moverACaja(persona: any, cajaId: Id<"cajas">) {
    if (!tienda) return;
    const caja = cajasMap.get(cajaId);
    if (!caja) return;
    // Importante: capturar TODAS las referencias antes de cualquier mutación,
    // porque `tablero` (datos locales vía useQuery) se desactualiza tras un setEstado.
    const asigTarea = (tablero?.enTareas ?? []).find((a: any) => a.personalId === persona.personalId);
    const asigCaja = (tablero?.enCaja ?? []).find((a: any) => a.personalId === persona.personalId);
    const ocupante = (tablero?.enCaja ?? []).find(
      (a: any) => a.cajaCodigo === (caja as any).codigo && a.personalId !== persona.personalId,
    );
    try {
      if (asigTarea) {
        await setEstado({ asignacionId: asigTarea.asignacionId, estado: "finalizada" });
      }
      if (ocupante) {
        await setEstado({ asignacionId: ocupante.asignacionId, estado: "finalizada" });
      }
      // Upsert usando la referencia capturada antes (id existente o undefined para crear)
      await upsertAsignacion({
        id: asigCaja?.asignacionId as any,
        tiendaId: tienda._id,
        fecha,
        cajaId,
        personalId: persona.personalId,
        horaInicio: persona.entrada!,
        horaFin: persona.salida!,
        bloque: 1,
        estado: "activa",
      });
      toast.success(`${persona.nombre} → Caja ${(caja as any).codigo}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Mover a una tarea: si la persona estaba en una caja, se la quita
  async function moverATarea(persona: any, funcionId: Id<"funcionesSecundarias">) {
    if (!tienda) return;
    const funcion = funcionesMap.get(funcionId);
    if (!funcion) return;
    // Capturar referencias antes de cualquier mutación
    const asigCaja = (tablero?.enCaja ?? []).find((a: any) => a.personalId === persona.personalId);
    const asigTarea = (tablero?.enTareas ?? []).find((a: any) => a.personalId === persona.personalId);
    try {
      if (asigCaja) {
        await setEstado({ asignacionId: asigCaja.asignacionId, estado: "finalizada" });
      }
      if (asigTarea) {
        // Actualizar la tarea existente (no fue tocada por la mutación anterior)
        await upsertAsignacion({
          id: asigTarea.asignacionId as any,
          tiendaId: tienda._id,
          fecha,
          cajaId: undefined,
          personalId: persona.personalId,
          horaInicio: persona.entrada!,
          horaFin: persona.salida!,
          bloque: 1,
          funcionSecundaria: funcionId,
          estado: "activa",
        });
      } else {
        // Crear nueva tarea (no toca la asignación de caja si existe)
        await asignarSoloTarea({
          tiendaId: tienda._id,
          fecha,
          personalId: persona.personalId,
          funcionSecundariaId: funcionId,
          horaInicio: persona.entrada!,
          horaFin: persona.salida!,
        });
      }
      toast.success(`${persona.nombre} → ${(funcion as any).nombre}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleUnassignDesdeDisponible(payload: { tipo: string; asignacionId: string }) {
    try {
      await setEstado({ asignacionId: payload.asignacionId as any, estado: "finalizada" });
      toast.success("Persona devuelta a disponibles");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleQuitar(asignacionId: Id<"asignacionesCaja">) {
    try {
      await setEstado({ asignacionId, estado: "finalizada" });
      toast.success("Persona quitada");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleLimpiarTablero() {
    if (!tienda) return;
    if (!confirm(`¿Limpiar todo el tablero del ${fecha}? Esto quitará a todas las personas asignadas (a cajas y a tareas).`)) return;
    try {
      const res = await limpiarTablero({ tiendaId: tienda._id, fecha });
      toast.success(`Tablero limpiado: ${res.eliminadas} asignaciones eliminadas`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleCrearFuncion() {
    if (!tienda) return;
    if (!nuevaFuncion.nombre.trim()) {
      toast.error("Ingresa un nombre");
      return;
    }
    try {
      await createFuncion({ tiendaId: tienda._id, ...nuevaFuncion });
      toast.success("Función creada");
      setNuevaFuncion({ nombre: "", color: "#3b82f6" });
      setModalNuevaFuncion(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Agrupar por función
  const tareasAgrupadas = useMemo(() => {
    const m = new Map<string, any[]>();
    (tablero?.enTareas ?? []).forEach((p: any) => {
      const fid = p.funcionSecundariaId;
      if (!fid) return;
      if (!m.has(fid)) m.set(fid, []);
      m.get(fid)!.push(p);
    });
    return m;
  }, [tablero]);

  // Caja preferencial primero, autoservicio al final como un solo bloque
  const cajasParaMostrar = useMemo(() => {
    if (!cajas) return [];
    const regulares = [...cajas]
      .filter((c: any) => c.tipo !== "autoservicio")
      .sort((a: any, b: any) => a.codigo - b.codigo);
    const auto = cajas.find((c: any) => c.tipo === "autoservicio");
    if (auto) {
      // Un solo "bloque virtual" para autoservicio
      regulares.push({
        _id: "AUTOSERVICIO",
        codigo: 25,
        tipo: "autoservicio",
        preferencial: false,
        esVirtual: true,
        rango: "25-30",
      } as any);
    }
    return regulares;
  }, [cajas]);

  if (!tablero) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-muted-foreground">Cargando tablero...</div>
      </div>
    );
  }

  const totalAsignados = tablero.enCaja.length + tablero.enTareas.length;

  return (
    <div className="p-3 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6" />
            Tablero en vivo
            <Badge variant="destructive" className="ml-1">TIEMPO REAL</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {fecha} · Hora: <span className="font-mono font-bold">{hora}</span> ·{" "}
            <span className="text-green-600 font-semibold">{tablero.enCaja.length} en caja</span> ·{" "}
            <span className="text-purple-600 font-semibold">{tablero.enTareas.length} en tareas</span> ·{" "}
            <span className="text-blue-600 font-semibold">{tablero.disponibles.length} disponibles</span>
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
          <Button
            variant="destructive"
            size="sm"
            onClick={handleLimpiarTablero}
            title="Limpiar todas las asignaciones del día"
          >
            🧹 Limpiar tablero
          </Button>
        </div>
      </div>

      {/* 3 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* ============== COLUMNA 1: DISPONIBLES ============== */}
        <div className="space-y-2">
          <div className="sticky top-0 bg-background z-10 pb-2">
            <div className="flex items-center gap-2 px-2">
              <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold">
                {tablero.disponibles.length}
              </div>
              <div>
                <h2 className="font-bold text-sm">DISPONIBLES</h2>
                <p className="text-[10px] text-muted-foreground">Suelta aquí para desasignar</p>
              </div>
            </div>
          </div>
          <div
            className={`space-y-1.5 max-h-[calc(100vh-180px)] overflow-y-auto pr-1 rounded-md transition-all ${
              dragOverDisponible ? "ring-2 ring-primary bg-primary/5 p-1" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverDisponible(true);
            }}
            onDragLeave={() => setDragOverDisponible(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverDisponible(false);
              const data = parseDragData(e);
              if (!data) return;
              if (data.tipo === "asignado-caja" || data.tipo === "asignado-tarea") {
                handleUnassignDesdeDisponible({ tipo: data.tipo, asignacionId: data.asignacionId });
              }
            }}
          >
            {tablero.disponibles.length === 0 && (
              <Card>
                <CardContent className="py-6 text-center text-xs text-muted-foreground">
                  No hay personal disponible en este momento
                </CardContent>
              </Card>
            )}
            {tablero.disponibles.map((p: any) => {
              const persona = personalesMap.get(p.personalId);
              const colorClass = TURNOS_COLOR[(persona as any)?.cargo ?? ""] ?? "bg-gray-100 border-gray-300";
              return (
                <div
                  key={p.personalId}
                  draggable
                  onDragStart={(e) => setDragData(e, { tipo: "disponible", personalId: p.personalId })}
                  className={`border-2 ${colorClass} rounded-lg p-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="font-mono text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatHorario(p, { sinSalida: "*", vacio: "" })}
                    </div>
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="font-semibold text-sm truncate">{p.nombre}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap mb-1.5">
                    <Badge variant="outline" className="text-[9px] py-0">{(persona as any)?.cargo}</Badge>
                    {(persona as any)?.soloCajaRapida && <Badge variant="warning" className="text-[9px] py-0">⚡Rápida</Badge>}
                    {(persona as any)?.esAsistenteAutoservicio && <Badge variant="secondary" className="text-[9px] py-0">Auto</Badge>}
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    <Button
                      size="default"
                      variant="default"
                      className="h-9 px-3 text-xs flex-1 font-semibold"
                      onClick={() => setCajaSeleccionada({ persona: p, tipo: (persona as any)?.soloCajaRapida ? "rapida" : "cualquiera" })}
                    >
                      🏪 Caja
                    </Button>
                    <Button
                      size="default"
                      variant="secondary"
                      className="h-9 px-3 text-xs flex-1 font-semibold"
                      onClick={() => setFuncionSeleccionada(p)}
                    >
                      📌 Tarea
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============== COLUMNA 2: CAJAS ============== */}
        <div className="space-y-2">
          <div className="sticky top-0 bg-background z-10 pb-2">
            <div className="flex items-center gap-2 px-2">
              <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                {tablero.enCaja.length}
              </div>
              <div>
                <h2 className="font-bold text-sm">ASIGNACIÓN DE CAJAS</h2>
                <p className="text-[10px] text-muted-foreground">Arrastra para asignar o intercambiar</p>
              </div>
            </div>
          </div>
          <div className="space-y-1.5 max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
            {cajasParaMostrar.map((c: any) => {
              // Si es el bloque virtual de autoservicio, juntar todas las asignaciones 25-30
              let asig: any;
              if (c.esVirtual) {
                asig = tablero.enCaja.find((a: any) => a.esAutoservicio);
              } else {
                asig = tablero.enCaja.find((a: any) => a.cajaCodigo === c.codigo);
              }
              const isDragOver = dragOverCaja === c._id;
              return (
                <div
                  key={c._id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverCaja(c._id);
                  }}
                  onDragLeave={() => setDragOverCaja(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverCaja(null);
                      const data = parseDragData(e);
                      if (!data) return;
                      if (c.esVirtual && tablero.enCaja.some((a: any) => a.esAutoservicio) && data.tipo === "disponible") {
                        toast.error("Ya hay un asistente de autoservicio. Quítalo primero.");
                        return;
                      }
                      const destino = c.esVirtual
                        ? cajas?.find((cx: any) => cx.tipo === "autoservicio")?._id
                        : c._id;
                      if (!destino) return;
                      if (data.tipo === "disponible") {
                        const persona = tablero.disponibles.find((p: any) => p.personalId === data.personalId);
                        if (persona) handleAsignarCaja(persona, destino as any);
                      } else if (data.tipo === "asignado-caja") {
                        if (data.asignacionId === asig?.asignacionId) return;
                        if (asig) {
                          handleSwapCaja(data.asignacionId, asig.asignacionId);
                        } else {
                          handleMoverCaja(data.asignacionId, destino as any);
                        }
                      } else if (data.tipo === "asignado-tarea") {
                        const persona = tablero.enTareas.find((p: any) => p.asignacionId === data.asignacionId);
                        if (persona) moverACaja(persona, destino as any);
                      }
                    }}
                  className={`border-2 rounded-lg p-2 transition-all ${
                    isDragOver
                      ? "border-primary bg-primary/10 scale-[1.02]"
                      : asig
                      ? "border-green-400 bg-green-50"
                      : c.preferencial
                      ? "border-yellow-300 bg-yellow-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <span className="text-base">{CAJA_TIPO_ICON[c.tipo]}</span>
                      <span className="font-bold text-sm">
                        {c.esVirtual ? "Autoservicio" : `C${c.codigo}`}
                      </span>
                      {c.preferencial && <span className="text-[10px]">⭐</span>}
                    </div>
                    <Badge variant="outline" className="text-[9px] py-0">
                      {c.esVirtual ? "C25-30" : c.tipo.slice(0, 3).toUpperCase()}
                    </Badge>
                  </div>
                  {asig ? (
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDragData(e, {
                          tipo: "asignado-caja",
                          personalId: asig.personalId,
                          asignacionId: asig.asignacionId,
                        });
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <div className="font-semibold text-xs truncate flex items-center gap-1">
                        <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                        {asig.nombre}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatHorario(asig, { sinSalida: "*", vacio: "" })}
                      </div>
                      {tareasPorPersona.get(asig.personalId)?.funcionSecundaria && (
                        <div className="text-[10px] mt-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded inline-block flex items-center gap-1">
                          <span>📌</span>
                          <span>{tareasPorPersona.get(asig.personalId).funcionSecundaria}</span>
                        </div>
                      )}
                      <div className="flex gap-1 mt-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0"
                          onClick={() => setFuncionSeleccionada(asig)}
                          title="Asignar tarea secundaria (sin quitarlo de la caja)"
                        >
                          📌
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 hover:bg-red-50"
                          onClick={() => handleQuitar(asig.asignacionId)}
                          title="Quitar"
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground italic text-center py-2">
                      {isDragOver ? "Soltar aquí" : "Arrastra personal"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ============== COLUMNA 3: TAREAS SECUNDARIAS ============== */}
        <div className="space-y-2">
          <div className="sticky top-0 bg-background z-10 pb-2">
            <div className="flex items-center gap-2 px-2">
              <div className="h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm font-bold">
                {tablero.enTareas.length}
              </div>
              <div>
                <h2 className="font-bold text-sm">TAREAS SECUNDARIAS</h2>
                <p className="text-[10px] text-muted-foreground">Suelta sobre el contenedor para agregar · sobre una persona para intercambiar</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 text-xs"
                onClick={() => setModalNuevaFuncion(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Nueva
              </Button>
            </div>
          </div>
          <div className="space-y-2 max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
            {funciones?.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-xs text-muted-foreground">
                  <p>No hay funciones creadas.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setModalNuevaFuncion(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Crear primera
                  </Button>
                </CardContent>
              </Card>
            ) : (
              funciones.map((f: any) => {
                const personas = tareasAgrupadas.get(f._id) ?? [];
                const isDragOver = dragOverFuncion === f._id;
                return (
                  <div
                    key={f._id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverFuncion(f._id);
                    }}
                    onDragLeave={() => setDragOverFuncion(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverFuncion(null);
                      setDragOverPersonaTarea(null);
                      const data = parseDragData(e);
                      if (!data) return;
                      // Contenedor: solo AGREGAR/MOVER (no intercambia).
                      // Para intercambiar hay que soltar directamente sobre la fila de la persona.
                      if (data.tipo === "disponible") {
                        const persona = tablero.disponibles.find((p: any) => p.personalId === data.personalId);
                        if (persona) handleAsignarTarea(persona, f._id);
                      } else if (data.tipo === "asignado-tarea") {
                        const mismoSlot = personas.find((p: any) => p.asignacionId === data.asignacionId);
                        if (mismoSlot) return;
                        const persona = tablero.enTareas.find((p: any) => p.asignacionId === data.asignacionId);
                        if (persona) handleAsignarTarea(persona, f._id);
                      } else if (data.tipo === "asignado-caja") {
                        // Drag cruzado caja→tarea: la persona se mueve (se quita de la caja)
                        const persona = tablero.enCaja.find((p: any) => p.asignacionId === data.asignacionId);
                        if (persona) moverATarea(persona, f._id);
                      }
                    }}
                    className={`border-2 rounded-lg overflow-hidden transition-all ${
                      isDragOver
                        ? "border-primary bg-primary/10 scale-[1.02]"
                        : "border-gray-200"
                    }`}
                  >
                    <div
                      className="px-2 py-1.5 text-white font-semibold text-sm flex items-center justify-between"
                      style={{ backgroundColor: f.color }}
                    >
                      <span>📌 {f.nombre}</span>
                      <span className="text-xs opacity-80">{personas.length}</span>
                    </div>
                    <div className="bg-white p-1.5 space-y-1 min-h-[40px]">
                      {personas.length === 0 ? (
                        <div className="text-[10px] text-muted-foreground italic text-center py-2">
                          {isDragOver ? "Soltar aquí" : "Arrastra personal"}
                        </div>
                      ) : (
                        personas.map((a: any) => {
                          const cajaDeTarea = cajasPorPersona.get(a.personalId);
                          const isDragOverPersona = dragOverPersonaTarea === a.asignacionId;
                          return (
                          <div
                            key={a.asignacionId}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDragData(e, {
                                tipo: "asignado-tarea",
                                personalId: a.personalId,
                                asignacionId: a.asignacionId,
                              });
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverPersonaTarea(a.asignacionId);
                            }}
                            onDragLeave={(e) => {
                              e.stopPropagation();
                              if (dragOverPersonaTarea === a.asignacionId) {
                                setDragOverPersonaTarea(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverFuncion(null);
                              setDragOverPersonaTarea(null);
                              const data = parseDragData(e);
                              if (!data) return;
                              // Fila de persona: SWAP
                              if (data.tipo === "asignado-tarea") {
                                if (data.asignacionId === a.asignacionId) return;
                                handleSwapTarea(data.asignacionId, a.asignacionId);
                              } else if (data.tipo === "disponible") {
                                const persona = tablero.disponibles.find((p: any) => p.personalId === data.personalId);
                                if (persona) handleAsignarTarea(persona, f._id);
                              } else if (data.tipo === "asignado-caja") {
                                const persona = tablero.enCaja.find((p: any) => p.asignacionId === data.asignacionId);
                                if (persona) moverATarea(persona, f._id);
                              }
                            }}
                            className={`flex items-center justify-between gap-1.5 text-[11px] bg-purple-50 hover:bg-purple-100 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing transition-all ${
                              isDragOverPersona ? "ring-2 ring-primary bg-primary/20" : ""
                            }`}
                          >
                            <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold truncate">{a.nombre}</div>
                              <div className="text-muted-foreground font-mono text-[9px] flex items-center gap-1 flex-wrap">
                                <span>{formatHorario(a, { sinSalida: "*", vacio: "" })}</span>
                                {cajaDeTarea?.cajaCodigo && (
                                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                                    🏪 C{cajaDeTarea.cajaCodigo}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0 hover:bg-red-50"
                              onClick={() => handleQuitar(a.asignacionId)}
                              title="Quitar de tarea"
                            >
                              <X className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal: Seleccionar caja para asignar */}
      {cajaSeleccionada && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCajaSeleccionada(null)}>
          <div className="bg-background rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">Asignar a Caja</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {cajaSeleccionada.persona.nombre} · {formatHorario(cajaSeleccionada.persona, { sinSalida: "*", vacio: "" })}
            </p>
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-1.5">
              {cajasParaMostrar
                .filter((c: any) => {
                  if (cajaSeleccionada.tipo === "rapida") {
                    return c.tipo === "rapida";
                  }
                  return true;
                })
                .map((c: any) => (
                  <Button
                    key={c._id}
                    variant="outline"
                    className="h-12 flex flex-col gap-0"
                    onClick={() => {
                      if (c.esVirtual) {
                        const destino = cajas?.find((cx: any) => cx.tipo === "autoservicio");
                        if (destino) handleAsignarCaja(cajaSeleccionada.persona, destino._id);
                      } else {
                        handleAsignarCaja(cajaSeleccionada.persona, c._id);
                      }
                    }}
                  >
                    <span className="text-lg">{CAJA_TIPO_ICON[c.tipo]}</span>
                    <span className="text-[10px]">
                      {c.esVirtual ? "Auto" : `C${c.codigo}`}
                    </span>
                  </Button>
                ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setCajaSeleccionada(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Seleccionar tarea */}
      {funcionSeleccionada && (() => {
        const tareaActual = (tablero?.enTareas ?? []).find((p: any) => p.personalId === funcionSeleccionada.personalId);
        const enCaja = (tablero?.enCaja ?? []).some((p: any) => p.personalId === funcionSeleccionada.personalId);
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setFuncionSeleccionada(null)}>
          <div className="bg-background rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">Asignar Tarea Secundaria</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {funcionSeleccionada.nombre} · {formatHorario(funcionSeleccionada, { sinSalida: "*", vacio: "" })}
            </p>
            {enCaja && (
              <div className="mb-2 p-2 bg-blue-50 text-blue-700 rounded text-xs flex items-center gap-1">
                ℹ️ La persona se mantiene en su caja; se agrega esta tarea adicional.
              </div>
            )}
            {tareaActual?.funcionSecundaria && (
              <div className="mb-3 p-2 bg-purple-50 text-purple-700 rounded text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Ya está en "{tareaActual.funcionSecundaria}". Se cambiará a la nueva.
              </div>
            )}
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {funciones?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay funciones creadas. Crea una primero.
                </p>
              ) : (
                funciones?.map((f: any) => (
                  <Button
                    key={f._id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleAsignarTarea(funcionSeleccionada, f._id)}
                  >
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: f.color }}
                    />
                    {f.nombre}
                  </Button>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-between">
              <Button
                variant="link"
                onClick={() => {
                  setFuncionSeleccionada(null);
                  setModalNuevaFuncion(true);
                }}
              >
                + Crear nueva
              </Button>
              <Button variant="outline" onClick={() => setFuncionSeleccionada(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal: Nueva función */}
      {modalNuevaFuncion && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalNuevaFuncion(false)}>
          <div className="bg-background rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-3">Nueva Función Secundaria</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm">Nombre</label>
                <input
                  type="text"
                  value={nuevaFuncion.nombre}
                  onChange={(e) => setNuevaFuncion({ ...nuevaFuncion, nombre: e.target.value })}
                  placeholder="Ej. Refrigerio, Capacitación, Apoyo..."
                  className="w-full h-9 mt-1 rounded-md border border-input bg-transparent px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-sm">Color</label>
                <div className="flex gap-2 mt-1">
                  {["#3b82f6", "#22c55e", "#ef4444", "#eab308", "#a855f7", "#f97316", "#ec4899", "#6b7280"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNuevaFuncion({ ...nuevaFuncion, color: c })}
                      className={`w-8 h-8 rounded-full border-2 ${nuevaFuncion.color === c ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalNuevaFuncion(false)}>Cancelar</Button>
              <Button onClick={handleCrearFuncion}>Crear</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
