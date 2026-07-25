"use client";

import { useMemo, useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, User, Trash2, UserCog } from "lucide-react";
import { cn, DIAS_SEMANA, getWeekStart, toISODate } from "@/lib/utils";
import { toast } from "sonner";

type TareaLite = {
  _id: Id<"tareasInstancia">;
  titulo: string;
  fecha: string;
  responsableId: Id<"personales">;
  colaboradoresIds: Id<"personales">[];
  asignadosIds: Id<"personales">[];
  completadosIds: Id<"personales">[];
  estado: "pendiente" | "en_curso" | "completada" | "vencida";
  plazo?: string;
  descripcion?: string;
};

type Personal = {
  _id: Id<"personales">;
  apellidos: string;
  nombres: string;
  nick: string;
};

const ESTADO_VARIANT: Record<
  TareaLite["estado"],
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  pendiente: "outline",
  en_curso: "warning",
  completada: "success",
  vencida: "destructive",
};

const ESTADO_LABEL: Record<TareaLite["estado"], string> = {
  pendiente: "pendiente",
  en_curso: "en curso",
  completada: "completada",
  vencida: "vencida",
};

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function CalendarioSimple({
  tiendaId,
}: {
  tiendaId: Id<"tiendas">;
}) {
  const [weekStartDate, setWeekStartDate] = useState(() => getWeekStart(new Date()));
  const [weeksToShow, setWeeksToShow] = useState<1 | 2 | 4>(1);
  const [tareaSel, setTareaSel] = useState<TareaLite | null>(null);

  const totalDays = weeksToShow * 7;
  const weekStartStr = toISODate(weekStartDate);
  const weekEndStr = toISODate(addDays(weekStartDate, totalDays - 1));

  const tareas = useQuery(
    api.tareas.listInstanciasPorFecha,
    tiendaId
      ? { tiendaId, from: weekStartStr, to: weekEndStr }
      : "skip"
  );
  const personales = useQuery(
    api.personales.list,
    tiendaId ? { tiendaId, soloActivos: true } : "skip"
  );
  const del = useMutation(api.tareas.deleteInstancia);

  const personalById = useMemo(() => {
    const m = new Map<Id<"personales">, Personal>();
    for (const p of personales ?? []) m.set(p._id, p);
    return m;
  }, [personales]);

  const tareasPorFecha = useMemo(() => {
    const m = new Map<string, TareaLite[]>();
    for (const t of (tareas ?? []) as TareaLite[]) {
      if (!m.has(t.fecha)) m.set(t.fecha, []);
      m.get(t.fecha)!.push(t);
    }
    return m;
  }, [tareas]);

  const dias: Date[] = [];
  for (let i = 0; i < totalDays; i++) dias.push(addDays(weekStartDate, i));
  const labelsCorto = ["L", "M", "X", "J", "V", "S", "D"];

  const hoy = toISODate(new Date());
  const totalTareas = (tareas ?? []).length;
  const completadas = (tareas ?? []).filter((t) => t.estado === "completada").length;
  const pendientes = (tareas ?? []).filter(
    (t) => t.estado === "pendiente" || t.estado === "en_curso"
  ).length;
  const vencidas = (tareas ?? []).filter((t) => t.estado === "vencida").length;

  function gotoPrev() {
    setWeekStartDate((d) => addDays(d, -totalDays));
  }
  function gotoNext() {
    setWeekStartDate((d) => addDays(d, totalDays));
  }
  function gotoHoy() {
    setWeekStartDate(getWeekStart(new Date()));
  }

  const monthLabel = weekStartDate.toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
  });

  const semanas: Date[][] = [];
  for (let w = 0; w < weeksToShow; w++) {
    const sem: Date[] = [];
    for (let d = 0; d < 7; d++) sem.push(addDays(weekStartDate, w * 7 + d));
    semanas.push(sem);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalIcon className="h-4 w-4" />
              {weeksToShow === 1
                ? `Semana del ${dias[0].getDate()} – ${dias[6].getDate()} de `
                : `Del ${dias[0].getDate()} de ${dias[0].toLocaleDateString("es-PE", { month: "short" })} al ${dias[dias.length - 1].getDate()} de `}
              <span className="capitalize">{monthLabel}</span>
            </CardTitle>
            <div className="flex items-center gap-1 flex-wrap">
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                {([1, 2, 4] as const).map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={weeksToShow === n ? "default" : "ghost"}
                    onClick={() => setWeeksToShow(n)}
                    className="h-7 px-2 text-xs"
                  >
                    {n === 1 ? "1 sem" : n === 2 ? "2 sem" : "4 sem"}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={gotoPrev} title="Anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={gotoHoy}>
                Hoy
              </Button>
              <Button size="sm" variant="outline" onClick={gotoNext} title="Siguiente">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            <Badge variant="secondary">{totalTareas} tareas esta semana</Badge>
            <Badge variant="success">{completadas} hechas</Badge>
            <Badge variant="warning">{pendientes} en curso / pendientes</Badge>
            {vencidas > 0 && <Badge variant="destructive">{vencidas} vencidas</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {semanas.map((semana, wi) => (
              <div key={wi}>
                {weeksToShow > 1 && (
                  <div className="text-xs font-medium text-muted-foreground mb-1 capitalize">
                    {semana[0].toLocaleDateString("es-PE", { month: "long", year: "numeric" })} — sem {wi + 1}
                  </div>
                )}
                <div className="grid grid-cols-7 gap-1.5">
                  {semana.map((d, i) => {
                    const fecha = toISODate(d);
                    const items = tareasPorFecha.get(fecha) ?? [];
                    const esHoy = fecha === hoy;
                    return (
                      <div
                        key={fecha}
                        className={cn(
                          "border rounded-md p-2 min-h-[160px] flex flex-col",
                          esHoy && "ring-2 ring-primary bg-primary/5"
                        )}
                      >
                        <div className="text-center pb-1.5 mb-1.5 border-b">
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                            {labelsCorto[i]}
                          </div>
                          <div
                            className={cn(
                              "text-lg font-semibold",
                              esHoy && "text-primary"
                            )}
                          >
                            {d.getDate()}
                          </div>
                        </div>
                        <div className="space-y-1.5 flex-1">
                          {items.length === 0 && (
                            <div className="text-[10px] text-muted-foreground text-center py-3">
                              —
                            </div>
                          )}
                          {items.map((t) => {
                            const resp = t.responsableId ? personalById.get(t.responsableId) : null;
                            return (
                              <div
                                key={t._id}
                                className={cn(
                                  "relative w-full text-left rounded border p-1.5 text-[11px] space-y-0.5 hover:bg-accent transition-colors cursor-pointer",
                                  t.estado === "completada" && "opacity-60 line-through",
                                  t.estado === "vencida" && "border-red-400 bg-red-50"
                                )}
                                title={t.descripcion ?? t.titulo}
                                onClick={() => setTareaSel(t)}
                              >
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await del({ id: t._id });
                                      toast.success("Eliminada");
                                    } catch (err: any) {
                                      toast.error(err.message);
                                    }
                                  }}
                                  className="absolute top-0.5 right-0.5 p-0.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                                <div className="font-medium leading-tight pr-4">
                                  {t.titulo}
                                </div>
                                {t.plazo && (
                                  <div className="text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5" /> {t.plazo}
                                  </div>
                                )}
                                {resp ? (
                                  <div className="text-muted-foreground flex items-center gap-1">
                                    <User className="h-2.5 w-2.5" /> {resp.nick}
                                  </div>
                                ) : (
                                  <div className="text-amber-600 flex items-center gap-1 font-medium">
                                    <UserCog className="h-2.5 w-2.5" /> Sin asignar
                                  </div>
                                )}
                                <Badge
                                  variant={ESTADO_VARIANT[t.estado]}
                                  className="text-[9px] px-1 py-0"
                                >
                                  {ESTADO_LABEL[t.estado]}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-2 flex flex-wrap gap-3">
            <span>Click en "Hoy" para volver a la semana actual.</span>
            <span>Click en una tarea para reasignar o eliminarla.</span>
          </div>
        </CardContent>
      </Card>

      {tareaSel && (
        <TareaCalendarioDialog
          tarea={tareaSel}
          tiendaId={tiendaId}
          personales={personales ?? []}
          personalById={personalById}
          onClose={() => setTareaSel(null)}
        />
      )}
    </div>
  );
}

function TareaCalendarioDialog({
  tarea,
  tiendaId,
  personales,
  personalById,
  onClose,
}: {
  tarea: TareaLite;
  tiendaId: Id<"tiendas">;
  personales: any[];
  personalById: Map<Id<"personales">, Personal>;
  onClose: () => void;
}) {
  const [responsableId, setResponsableId] = useState<Id<"personales"> | "">(
    tarea.responsableId ?? ""
  );
  const [colabs, setColabs] = useState<Id<"personales">[]>(tarea.colaboradoresIds);

  const reassign = useMutation(api.tareas.reassignInstancia);
  const del = useMutation(api.tareas.deleteInstancia);

  const resp = tarea.responsableId ? personalById.get(tarea.responsableId) : null;
  const colaboradoresActuales = tarea.colaboradoresIds
    .map((id) => personalById.get(id))
    .filter(Boolean) as Personal[];

  // Personas que pueden ser responsables: las asignadas (pool) + colaboradores actuales
  const candidatosResponsable = useMemo(() => {
    const ids = new Set<Id<"personales">>([
      ...tarea.asignadosIds,
      ...tarea.colaboradoresIds,
    ]);
    return personales.filter((p: any) => ids.has(p._id));
  }, [personales, tarea.asignadosIds, tarea.colaboradoresIds]);

  async function handleSave() {
    try {
      await reassign({
        id: tarea._id,
        responsableId: responsableId ? (responsableId as Id<"personales">) : (tarea.asignadosIds[0] ?? tarea.colaboradoresIds[0]) as Id<"personales">,
        colaboradoresIds: colabs,
      });
      toast.success("Asignación actualizada");
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar esta tarea?")) return;
    try {
      await del({ id: tarea._id });
      toast.success("Eliminada");
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function toggleColab(id: Id<"personales">) {
    setColabs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4" /> {tarea.titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{tarea.fecha}</Badge>
            <Badge variant={ESTADO_VARIANT[tarea.estado]}>{ESTADO_LABEL[tarea.estado]}</Badge>
            {tarea.plazo && <Badge variant="outline">⏰ {tarea.plazo}</Badge>}
            {!resp && <Badge variant="warning">Sin asignar</Badge>}
          </div>
          {tarea.descripcion && (
            <div className="text-sm text-muted-foreground">{tarea.descripcion}</div>
          )}

          <div className="space-y-1">
            <Label>Responsable</Label>
            <select
              className="w-full border rounded-md h-9 px-2 text-sm bg-background"
              value={responsableId}
              onChange={(e) => setResponsableId(e.target.value as Id<"personales"> | "")}
            >
              <option value="">— Sin asignar —</option>
              {candidatosResponsable.map((p: any) => (
                <option key={p._id} value={p._id}>
                  {p.apellidos} {p.nombres} ({p.nick})
                </option>
              ))}
            </select>
            {candidatosResponsable.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No hay personas asignadas. Agrega colaboradores abajo.
              </div>
            )}
            {resp && responsableId !== tarea.responsableId && (
              <div className="text-xs text-muted-foreground">
                Actual: {resp.apellidos} {resp.nombres}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Colaboradores</Label>
            <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1">
              {personales
                .filter((p: any) => p._id !== responsableId)
                .map((p: any) => (
                  <label key={p._id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={colabs.includes(p._id)}
                      onCheckedChange={() => toggleColab(p._id)}
                    />
                    {p.apellidos} {p.nombres} ({p.nick})
                  </label>
                ))}
              {personales.length <= 1 && (
                <div className="text-xs text-muted-foreground">
                  No hay más personas disponibles.
                </div>
              )}
            </div>
            {colaboradoresActuales.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Actuales: {colaboradoresActuales.map((c) => c.nick).join(", ")}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-600">
            <Trash2 className="h-3 w-3 mr-1" /> Eliminar
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSave}>Guardar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
