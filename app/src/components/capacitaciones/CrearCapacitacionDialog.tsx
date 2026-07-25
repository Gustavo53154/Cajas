"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toISODate } from "@/lib/utils";
import { toast } from "sonner";
import {
  ModoAsignacionSelector,
  emptyDestinatarios,
  type PersonalLite,
} from "@/components/compartido/ModoAsignacionSelector";

type Turno = {
  id: string;
  fecha: string;
  hora: string;
  duracionMin: number;
};

function newTurnoId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function CrearCapacitacionDialog({
  tiendaId,
  personales,
  onCreated,
}: {
  tiendaId: Id<"tiendas">;
  personales: PersonalLite[];
  onCreated?: (id: Id<"capacitaciones">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tema, setTema] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fechaInicio, setFechaInicio] = useState(toISODate(new Date()));
  const [fechaFin, setFechaFin] = useState(toISODate(new Date()));
  const [turnos, setTurnos] = useState<Turno[]>([
    { id: newTurnoId(), fecha: toISODate(new Date()), hora: "09:00", duracionMin: 30 },
  ]);
  const [dest, setDest] = useState(emptyDestinatarios("cargo"));
  const [submitting, setSubmitting] = useState(false);

  const create = useMutation(api.capacitaciones.createCapacitacion);

  function addTurno() {
    setTurnos([
      ...turnos,
      { id: newTurnoId(), fecha: fechaFin, hora: "14:00", duracionMin: 30 },
    ]);
  }
  function removeTurno(id: string) {
    if (turnos.length <= 1) return;
    setTurnos(turnos.filter((t) => t.id !== id));
  }
  function updateTurno(id: string, patch: Partial<Turno>) {
    setTurnos(turnos.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function handleCreate() {
    if (!tema.trim()) {
      toast.error("Ingresa el tema de la capacitación.");
      return;
    }
    setSubmitting(true);
    try {
      const args: any = {
        tiendaId,
        tema: tema.trim(),
        descripcion: descripcion.trim() || undefined,
        fechaInicio,
        fechaFin,
        turnos: turnos.map((t) => ({
          id: t.id,
          fecha: t.fecha,
          hora: t.hora,
          duracionMin: Number(t.duracionMin) || 30,
        })),
        modoAsignacion: dest.modo,
        cargos: dest.modo === "cargo" ? dest.cargos : undefined,
        personalIds: dest.modo === "manual" ? dest.personalIds : undefined,
      };
      const id = await create(args);
      toast.success("Capacitación creada");
      setOpen(false);
      onCreated?.(id);
      // reset
      setTema("");
      setDescripcion("");
      setFechaInicio(toISODate(new Date()));
      setFechaFin(toISODate(new Date()));
      setTurnos([
        { id: newTurnoId(), fecha: toISODate(new Date()), hora: "09:00", duracionMin: 30 },
      ]);
      setDest(emptyDestinatarios("cargo"));
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nueva capacitación
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programar capacitación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Tema *</Label>
            <Input
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="Ej. Cierre de caja, Feedback, Felicitación..."
            />
          </div>

          <div>
            <Label>Descripción</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle, motivo, materiales necesarios, etc."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha inicio</Label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => {
                  setFechaInicio(e.target.value);
                  if (e.target.value > fechaFin) setFechaFin(e.target.value);
                }}
              />
            </div>
            <div>
              <Label>Fecha fin (máx +1 día)</Label>
              <Input
                type="date"
                value={fechaFin}
                min={fechaInicio}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Turnos</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addTurno}
              >
                <Plus className="h-3 w-3 mr-1" /> Agregar turno
              </Button>
            </div>
            <div className="space-y-2">
              {turnos.map((t, i) => (
                <div
                  key={t.id}
                  className="grid grid-cols-12 gap-2 items-end border rounded-md p-2"
                >
                  <div className="col-span-1 text-sm text-muted-foreground">
                    #{i + 1}
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">Fecha</Label>
                    <Input
                      type="date"
                      value={t.fecha}
                      min={fechaInicio}
                      max={fechaFin}
                      onChange={(e) => updateTurno(t.id, { fecha: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Hora</Label>
                    <Input
                      type="time"
                      value={t.hora}
                      onChange={(e) => updateTurno(t.id, { hora: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Duración (min)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={480}
                      value={t.duracionMin}
                      onChange={(e) =>
                        updateTurno(t.id, { duracionMin: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {turnos.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTurno(t.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {turnos.length} turno{turnos.length === 1 ? "" : "s"} · agrega cuantos necesites
            </div>
          </div>

          <ModoAsignacionSelector value={dest} onChange={setDest} personales={personales} defaultModo="cargo" />

          {/* Resumen en vivo de destinatarios */}
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
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? "Creando..." : "Crear y asignar turnos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
