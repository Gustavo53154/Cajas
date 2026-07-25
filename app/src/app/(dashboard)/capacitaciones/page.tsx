"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Trash2, XCircle, FileText, ListChecks, CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { CrearCapacitacionDialog } from "@/components/capacitaciones/CrearCapacitacionDialog";
import { TurnosBoard } from "@/components/capacitaciones/TurnosBoard";
import { RecibidoChecklist } from "@/components/capacitaciones/RecibidoChecklist";
import { SeguimientoCapacitacionDialog } from "@/components/capacitaciones/SeguimientoDialog";
import {} from "@/lib/utils";

export default function CapacitacionesPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const caps = useQuery(
    api.capacitaciones.listByTienda,
    tienda ? { tiendaId: tienda._id } : "skip"
  );
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );
  const resumenSeg = useQuery(
    api.capacitaciones.getResumenSeguimiento,
    tienda ? { tiendaId: tienda._id } : "skip"
  );

  const [selectedId, setSelectedId] = useState<Id<"capacitaciones"> | null>(null);

  if (!tienda) {
    return <div className="p-6">Cargando tienda...</div>;
  }

  const personalesLite = (personales ?? []).map((p: any) => ({
    _id: p._id,
    apellidos: p.apellidos,
    nombres: p.nombres,
    nick: p.nick,
    cargo: p.cargo,
    activo: p.activo,
  }));

  // Todas las capacitaciones que no están canceladas se muestran en "Asignar"
  // (una sección por capacitación, en orden de fecha).
  const enCurso = (caps ?? []).filter(
    (c: any) => c.estado !== "cancelada"
  );

  const totalPendientesCap =
    (resumenSeg ?? []).reduce((acc: number, s: any) => acc + s.pendientes, 0) ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6" />
            Capacitaciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Inducciones y reuniones en 1-2 días, repartidas por turno
          </p>
        </div>
        <CrearCapacitacionDialog tiendaId={tienda._id} personales={personalesLite} />
      </div>

      <Tabs defaultValue="seguimiento">
        <TabsList>
          <TabsTrigger value="seguimiento">
            Seguimiento{totalPendientesCap > 0 && ` (${totalPendientesCap})`}
          </TabsTrigger>
          <TabsTrigger value="asignar">Asignar ({enCurso.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="seguimiento" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> ¿Quién falta recibir cada capacitación?
              </CardTitle>
              <CardDescription>
                Vista global. Click en "Ver" para abrir el seguimiento detallado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(resumenSeg ?? []).length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  No hay capacitaciones para seguir.
                </div>
              ) : (
                <div className="space-y-2">
                  {(resumenSeg ?? []).map((s: any) => (
                    <div
                      key={s._id}
                      className="flex items-center justify-between border rounded-md p-3 hover:bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{s.tema}</span>
                          {s.tipo && (
                            <Badge variant="outline" className="text-[10px]">
                              {s.tipo === "induccion" ? "Inducción" : "Reunión"}
                            </Badge>
                          )}
                          {s.estado === "completada" && (
                            <Badge variant="success" className="text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> completa
                            </Badge>
                          )}
                          {s.estado === "vencida" && (
                            <Badge variant="destructive" className="text-[10px]">
                              vencida
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {s.fechaInicio}
                          {s.fechaInicio !== s.fechaFin && ` → ${s.fechaFin}`}
                          {" · "}
                          {s.turnos.length} turno(s)
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={
                                "h-full transition-all " +
                                (s.porcentaje === 100
                                  ? "bg-green-500"
                                  : s.porcentaje > 0
                                  ? "bg-yellow-500"
                                  : "bg-gray-300")
                              }
                              style={{ width: `${s.porcentaje}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium whitespace-nowrap">
                            {s.recibidos}/{s.total} ({s.porcentaje}%)
                          </span>
                        </div>
                        {s.sinTurno > 0 && (
                          <div className="text-xs text-amber-600 mt-1">
                            ⚠ {s.sinTurno} sin turno asignado
                          </div>
                        )}
                      </div>
                      <div className="ml-3 flex items-center gap-2">
                        {s.pendientes > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            Faltan {s.pendientes}
                          </Badge>
                        )}
                        <SeguimientoCapacitacionDialog
                          capacitacionId={s._id}
                          personales={personalesLite}
                          trigger={
                            <Button size="sm" variant="outline">
                              <ListChecks className="h-3 w-3 mr-1" /> Ver
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asignar" className="space-y-3">
          {enCurso.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay capacitaciones. Crea una con el botón "Nueva capacitación".
              </CardContent>
            </Card>
          )}
          {enCurso.map((c: any) => (
            <CapacitacionCard
              key={c._id}
              capacitacion={c}
              tiendaId={tienda._id}
              personalesLite={personalesLite}
              onSelect={() => setSelectedId(c._id)}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CapacitacionCard({
  capacitacion,
  tiendaId,
  personalesLite,
  hideBoard,
  readonly,
}: {
  capacitacion: any;
  tiendaId: Id<"tiendas">;
  personalesLite: any[];
  onSelect?: () => void;
  hideBoard?: boolean;
  readonly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const asignaciones = useQuery(
    api.capacitaciones.listAsignaciones,
    { capacitacionId: capacitacion._id }
  );
  const asignar = useMutation(api.capacitaciones.asignarTurno);
  const desasignar = useMutation(api.capacitaciones.desasignarTurno);
  const cancel = useMutation(api.capacitaciones.cancelCapacitacion);
  const remove = useMutation(api.capacitaciones.deleteCapacitacion);
  const updateNotas = useMutation(api.capacitaciones.updateNotas);

  const total = capacitacion.personalIds.length;
  const asigList = asignaciones ?? [];
  const conTurno = asigList.filter((a: any) => a.turnoId).length;
  const recibidos = asigList.filter((a: any) => a.fechaRecibido).length;
  const porcentaje = total > 0 ? Math.round((recibidos / total) * 100) : 0;

  async function handleAsignar(personalId: Id<"personales">, turnoId: string | null) {
    try {
      if (turnoId === null) {
        await desasignar({ capacitacionId: capacitacion._id, personalId });
      } else {
        await asignar({ capacitacionId: capacitacion._id, personalId, turnoId });
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const showBoard = expanded && !hideBoard && !readonly;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none hover:bg-muted/30 transition-colors"
        onClick={() => !readonly && setExpanded((e) => !e)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              {capacitacion.tema}
              {capacitacion.tipo && (
                <Badge variant="outline" className="text-[10px]">
                  {capacitacion.tipo === "induccion" ? "Inducción" : "Reunión"}
                </Badge>
              )}
              {capacitacion.motivo && (
                <Badge variant="secondary" className="text-[10px]">
                  {capacitacion.motivo}
                </Badge>
              )}
              <Badge
                variant={
                  capacitacion.estado === "completada"
                    ? "success"
                    : capacitacion.estado === "en_curso"
                    ? "warning"
                    : capacitacion.estado === "vencida" || capacitacion.estado === "cancelada"
                    ? "destructive"
                    : "secondary"
                }
                className="text-[10px]"
              >
                {capacitacion.estado}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              {capacitacion.fechaInicio}
              {capacitacion.fechaInicio !== capacitacion.fechaFin &&
                ` → ${capacitacion.fechaFin}`}
              {capacitacion.descripcion && ` · ${capacitacion.descripcion}`}
            </CardDescription>
            <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
              <Badge variant={conTurno === total ? "success" : conTurno > 0 ? "warning" : "secondary"}>
                {conTurno}/{total} en turno
              </Badge>
              <Badge variant={porcentaje === 100 ? "success" : porcentaje > 0 ? "warning" : "secondary"}>
                {recibidos}/{total} recibidos ({porcentaje}%)
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {capacitacion.turnos.length} turno{capacitacion.turnos.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!readonly && (
              <div
                className="flex gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    if (!confirm("¿Cancelar esta capacitación?")) return;
                    await cancel({ id: capacitacion._id });
                    toast.success("Capacitación cancelada");
                  }}
                  title="Cancelar"
                >
                  <XCircle className="h-4 w-4 text-orange-500" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    if (!confirm("¿Eliminar definitivamente?")) return;
                    await remove({ id: capacitacion._id });
                    toast.success("Eliminada");
                  }}
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            )}
            {!readonly && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((e) => !e);
                }}
                title={expanded ? "Ocultar asignación" : "Ver asignación"}
                aria-label={expanded ? "Colapsar" : "Expandir"}
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
        {/* Acciones de recibido por turno (siempre visibles, no requieren expandir) */}
        {!readonly && (
          <div
            className="flex flex-wrap gap-2 pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            {capacitacion.turnos.map((t: any, idx: number) => (
              <RecibidoChecklist
                key={t.id}
                capacitacionId={capacitacion._id}
                turnoId={t.id}
                turnoLabel={`T${idx + 1} ${t.fecha} ${t.hora}`}
                asignaciones={asigList}
                personales={personalesLite}
              />
            ))}
          </div>
        )}
      </CardHeader>
      {showBoard && (
        <CardContent>
          <TurnosBoard
            capacitacionId={capacitacion._id}
            turnos={capacitacion.turnos}
            asignaciones={asigList}
            personales={personalesLite}
            onAsignar={handleAsignar}
          />
          <div className="mt-4">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> Notas
            </label>
            <Textarea
              defaultValue={capacitacion.notas ?? ""}
              placeholder="Notas / minutos de la capacitación"
              className="mt-1"
              onBlur={async (e) => {
                if (e.target.value !== (capacitacion.notas ?? "")) {
                  await updateNotas({ id: capacitacion._id, notas: e.target.value });
                  toast.success("Notas guardadas");
                }
              }}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
