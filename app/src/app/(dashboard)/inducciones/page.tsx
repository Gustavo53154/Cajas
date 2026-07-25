"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarDays, Plus, Trash2, XCircle, ListChecks, CheckCircle2, Clock } from "lucide-react";
import { toISODate } from "@/lib/utils";
import { toast } from "sonner";
import { ModoAsignacionSelector, emptyDestinatarios, type PersonalLite } from "@/components/compartido/ModoAsignacionSelector";
import { SeguimientoDialog } from "@/components/capacitaciones/SeguimientoDialog";

export default function InduccionesPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const inducciones = useQuery(
    api.inducciones.listInducciones,
    tienda ? { tiendaId: tienda._id } : "skip"
  );
  const seguimiento = useQuery(
    api.inducciones.getSeguimiento,
    tienda ? { tiendaId: tienda._id } : "skip"
  );
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );

  if (!tienda) {
    return <div className="p-6">Cargando tienda...</div>;
  }

  const personalesLite: PersonalLite[] = (personales ?? []).map((p: any) => ({
    _id: p._id,
    apellidos: p.apellidos,
    nombres: p.nombres,
    nick: p.nick,
    cargo: p.cargo,
    activo: p.activo,
  }));

  const hoy = toISODate(new Date());
  const activas = (inducciones ?? []).filter(
    (i: any) => i.estado !== "cancelada" && i.estado !== "completada" && i.estado !== "vencida"
  );
  const historial = (inducciones ?? []).filter(
    (i: any) =>
      i.estado === "completada" || i.estado === "vencida" || i.estado === "cancelada"
  );

  // Pendientes totales en seguimiento
  const totalPendientes = (seguimiento ?? []).reduce(
    (acc, s) => acc + s.pendientes,
    0
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Inducciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Inducciones al personal con seguimiento de quién ya recibió
          </p>
        </div>
        <CrearInduccionDialog tiendaId={tienda._id} personales={personalesLite} />
      </div>

      <Tabs defaultValue="seguimiento">
        <TabsList>
          <TabsTrigger value="seguimiento">
            Seguimiento{totalPendientes > 0 && ` (${totalPendientes})`}
          </TabsTrigger>
          <TabsTrigger value="asignar">Activas ({activas.length})</TabsTrigger>
          <TabsTrigger value="historial">Historial ({historial.length})</TabsTrigger>
        </TabsList>

        {/* SEGUIMIENTO */}
        <TabsContent value="seguimiento" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> ¿Quién falta recibir cada inducción?
              </CardTitle>
              <CardDescription>
                Vista global ordenada por pendientes. Click en una fila para ver el detalle y marcar recibido.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(seguimiento ?? []).length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  No hay inducciones con seguimiento.
                </div>
              ) : (
                <div className="space-y-2">
                  {(seguimiento ?? []).map((s: any) => (
                    <SeguimientoRow
                      key={s._id}
                      row={s}
                      induccion={(inducciones ?? []).find((i: any) => i._id === s._id)!}
                      personales={personalesLite}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVAS */}
        <TabsContent value="asignar" className="space-y-3">
          {activas.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay inducciones activas. Crea una con el botón "Nueva inducción".
              </CardContent>
            </Card>
          )}
          {activas.map((i: any) => (
            <InduccionCard
              key={i._id}
              induccion={i}
              tiendaId={tienda._id}
              personales={personalesLite}
            />
          ))}
        </TabsContent>

        {/* HISTORIAL */}
        <TabsContent value="historial" className="space-y-3">
          {historial.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aún no hay inducciones en el historial.
              </CardContent>
            </Card>
          )}
          {historial.map((i: any) => (
            <InduccionCard
              key={i._id}
              induccion={i}
              tiendaId={tienda._id}
              personales={personalesLite}
              readonly
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================
// Sub-componentes
// ============================

function SeguimientoRow({
  row,
  induccion,
  personales,
}: {
  row: any;
  induccion: any;
  personales: PersonalLite[];
}) {
  return (
    <div className="flex items-center justify-between border rounded-md p-3 hover:bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{row.tema}</span>
          {row.estado === "completada" && (
            <Badge variant="success" className="text-[10px]">
              <CheckCircle2 className="h-3 w-3 mr-1" /> completa
            </Badge>
          )}
          {row.estado === "vencida" && (
            <Badge variant="destructive" className="text-[10px]">
              vencida
            </Badge>
          )}
          {row.vencido && row.estado !== "completada" && (
            <Badge variant="destructive" className="text-[10px]">
              <Clock className="h-3 w-3 mr-1" /> plazo vencido
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Días: {row.dias.join(", ")}
          {row.plazo && ` · Plazo: ${row.plazo}`}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={
                "h-full transition-all " +
                (row.porcentaje === 100
                  ? "bg-green-500"
                  : row.porcentaje > 0
                  ? "bg-yellow-500"
                  : "bg-gray-300")
              }
              style={{ width: `${row.porcentaje}%` }}
            />
          </div>
          <span className="text-xs font-medium whitespace-nowrap">
            {row.recibidos}/{row.total} ({row.porcentaje}%)
          </span>
        </div>
      </div>
      <div className="ml-3 flex items-center gap-2">
        {row.pendientes > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            Faltan {row.pendientes}
          </Badge>
        )}
        <SeguimientoDialog
          induccion={induccion}
          personales={personales}
          trigger={
            <Button size="sm" variant="outline">
              <ListChecks className="h-3 w-3 mr-1" /> Ver
            </Button>
          }
        />
      </div>
    </div>
  );
}

function InduccionCard({
  induccion,
  tiendaId,
  personales,
  readonly,
}: {
  induccion: any;
  tiendaId: Id<"tiendas">;
  personales: PersonalLite[];
  readonly?: boolean;
}) {
  const marcar = useMutation(api.inducciones.marcarRecibido);
  const desmarcar = useMutation(api.inducciones.desmarcarRecibido);
  const cancel = useMutation(api.inducciones.cancelInduccion);
  const remove = useMutation(api.inducciones.deleteInduccion);

  const total = induccion.personalIds?.length ?? 0;
  const recibidos = induccion.asistenciales.filter((a: any) => a.fechaRecibido).length;
  const porcentaje = total > 0 ? Math.round((recibidos / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              {induccion.tema}
              <Badge
                variant={
                  induccion.estado === "completada"
                    ? "success"
                    : induccion.estado === "en_curso"
                    ? "warning"
                    : induccion.estado === "vencida" || induccion.estado === "cancelada"
                    ? "destructive"
                    : "secondary"
                }
                className="text-[10px]"
              >
                {induccion.estado}
              </Badge>
            </CardTitle>
            {induccion.descripcion && (
              <CardDescription className="mt-1">{induccion.descripcion}</CardDescription>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
              <span className="text-muted-foreground">
                Días: <span className="font-medium text-foreground">{induccion.dias.join(", ")}</span>
              </span>
              {induccion.plazo && (
                <Badge variant="outline" className="text-[10px]">
                  Plazo: {induccion.plazo}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <Badge variant={porcentaje === 100 ? "success" : recibidos > 0 ? "warning" : "secondary"}>
                {recibidos}/{total} recibidos ({porcentaje}%)
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {induccion.modoAsignacion}
                {induccion.modoAsignacion === "cargo" && induccion.cargos && (
                  <> · {induccion.cargos.join(", ")}</>
                )}
              </Badge>
            </div>
          </div>
          {!readonly && (
            <div className="flex gap-1">
              <SeguimientoDialog
                induccion={induccion}
                personales={personales}
                trigger={
                  <Button variant="outline" size="sm">
                    <ListChecks className="h-4 w-4 mr-1" /> Seguimiento
                  </Button>
                }
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (!confirm("¿Cancelar esta inducción?")) return;
                  await cancel({ id: induccion._id });
                  toast.success("Inducción cancelada");
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
                  await remove({ id: induccion._id });
                  toast.success("Eliminada");
                }}
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {!readonly && (
        <CardContent>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {induccion.personalIds.length === 0 && (
              <div className="text-xs text-muted-foreground">Sin personal asignado.</div>
            )}
            {induccion.personalIds.map((pid: Id<"personales">) => {
              const p = personales.find((pp) => pp._id === pid);
              if (!p) return null;
              const a = induccion.asistenciales.find(
                (x: any) => x.personalId === pid
              );
              const done = !!a?.fechaRecibido;
              return (
                <div
                  key={pid}
                  className={
                    "flex items-center justify-between text-sm border rounded px-2 py-1 " +
                    (done ? "bg-green-50 border-green-300" : "")
                  }
                >
                  <div>
                    {p.apellidos} {p.nombres}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({p.cargo} · {p.nick})
                    </span>
                  </div>
                  <div>
                    {done ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="success" className="text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> {a.fechaRecibido}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            desmarcar({
                              induccionId: induccion._id,
                              personalId: pid,
                            })
                          }
                        >
                          Desmarcar
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          marcar({ induccionId: induccion._id, personalId: pid })
                        }
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Marcar recibido
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================
// Crear inducción
// ============================

function CrearInduccionDialog({
  tiendaId,
  personales,
}: {
  tiendaId: Id<"tiendas">;
  personales: PersonalLite[];
}) {
  const [open, setOpen] = useState(false);
  const [tema, setTema] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [dias, setDias] = useState<string[]>([toISODate(new Date())]);
  const [plazo, setPlazo] = useState("");
  const [dest, setDest] = useState(emptyDestinatarios("cargo"));
  const [submitting, setSubmitting] = useState(false);
  const create = useMutation(api.inducciones.createInduccion);

  function addDia() {
    if (dias.length >= 7) return;
    const last = new Date(dias[dias.length - 1] + "T00:00:00");
    last.setDate(last.getDate() + 1);
    setDias([...dias, toISODate(last)]);
  }
  function removeDia(idx: number) {
    if (dias.length <= 1) return;
    setDias(dias.filter((_, i) => i !== idx));
  }
  function updateDia(idx: number, value: string) {
    setDias(dias.map((d, i) => (i === idx ? value : d)));
  }

  async function handleCreate() {
    if (!tema.trim()) {
      toast.error("Ingresa el tema");
      return;
    }
    if (dias.length === 0) {
      toast.error("Selecciona al menos un día");
      return;
    }
    const diasOrdenados = [...dias].sort();
    setSubmitting(true);
    try {
      await create({
        tiendaId,
        tema: tema.trim(),
        descripcion: descripcion.trim(),
        fechaProgramada: diasOrdenados[0],
        fechaFin: diasOrdenados[diasOrdenados.length - 1],
        dias: diasOrdenados,
        plazo: plazo || undefined,
        modoAsignacion: dest.modo,
        cargos: dest.modo === "cargo" ? dest.cargos : undefined,
        personalIds: dest.modo === "manual" ? dest.personalIds : undefined,
      });
      toast.success("Inducción creada");
      setOpen(false);
      setTema("");
      setDescripcion("");
      setDias([toISODate(new Date())]);
      setPlazo("");
      setDest(emptyDestinatarios("cargo"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const totalPorCargo = dest.cargos.reduce(
    (acc, c) => acc + personales.filter((p) => p.activo && p.cargo === c).length,
    0
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nueva inducción
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programar inducción</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Tema *</Label>
            <Input
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="Manejo de caja registradora"
            />
          </div>

          <div>
            <Label>Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle o materiales necesarios"
            />
          </div>

          {/* Días (sin turnos) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Días para realizar la inducción *</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addDia}
                disabled={dias.length >= 7}
              >
                <Plus className="h-3 w-3 mr-1" /> Agregar día
              </Button>
            </div>
            <div className="space-y-2">
              {dias.map((d, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-center border rounded-md p-2"
                >
                  <div className="col-span-2 text-sm text-muted-foreground">
                    Día {i + 1}
                  </div>
                  <div className="col-span-9">
                    <Input
                      type="date"
                      value={d}
                      onChange={(e) => updateDia(i, e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {dias.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDia(i)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Toca "Agregar día" si la inducción se dará en varios días (máx 7).
            </div>
          </div>

          <div>
            <Label>Plazo límite (opcional)</Label>
            <Input
              type="date"
              value={plazo}
              onChange={(e) => setPlazo(e.target.value)}
            />
          </div>

          <ModoAsignacionSelector
            value={dest}
            onChange={setDest}
            personales={personales}
            defaultModo="cargo"
          />

          {dest.modo === "cargo" && dest.cargos.length > 0 && (
            <div className="border rounded-md p-3 bg-muted/30 text-xs">
              <div className="font-medium mb-1">Resumen de destinatarios:</div>
              <div className="flex flex-wrap gap-1">
                {dest.cargos.map((c) => {
                  const count = personales.filter(
                    (p) => p.activo && p.cargo === c
                  ).length;
                  return (
                    <Badge key={c} variant="secondary" className="text-[10px]">
                      {c} · {count} persona(s)
                    </Badge>
                  );
                })}
                <Badge variant="outline" className="text-[10px]">
                  Total: {totalPorCargo}
                </Badge>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? "Creando..." : "Crear inducción"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
