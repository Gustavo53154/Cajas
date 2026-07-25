"use client";

import { useState, useMemo } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Clock, ListChecks, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Asignencial = {
  personalId: Id<"personales">;
  fechaRecibido?: string;
  nota?: string;
};

type Induccion = {
  _id: Id<"inducciones">;
  tema: string;
  dias: string[];
  fechaProgramada: string;
  fechaFin?: string;
  plazo?: string;
  estado: string;
  asistenciales: Asignencial[];
  personalIds: Id<"personales">[];
};

type Personal = {
  _id: Id<"personales">;
  apellidos: string;
  nombres: string;
  nick: string;
  cargo: string;
};

export function SeguimientoDialog({
  induccion,
  personales,
  trigger,
}: {
  induccion: Induccion;
  personales: Personal[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [showRecibidos, setShowRecibidos] = useState(true);
  const marcar = useMutation(api.inducciones.marcarRecibido);
  const desmarcar = useMutation(api.inducciones.desmarcarRecibido);

  const personalById = useMemo(
    () => new Map(personales.map((p) => [p._id, p])),
    [personales]
  );

  const items = useMemo(() => {
    return induccion.personalIds
      .map((pid) => {
        const p = personalById.get(pid);
        const a = induccion.asistenciales.find((x) => x.personalId === pid);
        return {
          personal: p,
          recibido: !!a?.fechaRecibido,
          fechaRecibido: a?.fechaRecibido,
        };
      })
      .filter((x) => !!x.personal)
      .filter((x) => {
        if (!filter) return true;
        const f = filter.toLowerCase();
        const p = x.personal!;
        return (
          p.apellidos.toLowerCase().includes(f) ||
          p.nombres.toLowerCase().includes(f) ||
          p.nick.toLowerCase().includes(f)
        );
      })
      .filter((x) => (showRecibidos ? true : !x.recibido));
  }, [induccion, personalById, filter, showRecibidos]);

  const total = induccion.personalIds.length;
  const recibidos = induccion.asistenciales.filter((a) => a.fechaRecibido).length;
  const pendientes = total - recibidos;

  async function handleMarcar(personalId: Id<"personales">) {
    try {
      await marcar({ induccionId: induccion._id, personalId });
      const p = personalById.get(personalId);
      toast.success(`${p?.nick ?? "Persona"} marcado`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  async function handleDesmarcar(personalId: Id<"personales">) {
    try {
      await desmarcar({ induccionId: induccion._id, personalId });
      const p = personalById.get(personalId);
      toast.success(`${p?.nick ?? "Persona"} desmarcado`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <ListChecks className="h-4 w-4 mr-1" /> Seguimiento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Seguimiento · {induccion.tema}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Resumen */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-md">
            <Badge variant={recibidos === total ? "success" : recibidos > 0 ? "warning" : "secondary"}>
              {recibidos}/{total} recibidos
            </Badge>
            {pendientes > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {pendientes} pendiente(s)
              </Badge>
            )}
            <div className="text-xs text-muted-foreground ml-auto">
              Días: {induccion.dias.join(", ")}
              {induccion.plazo && ` · Plazo: ${induccion.plazo}`}
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por nombre o nick..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8"
            />
            <label className="flex items-center gap-1 text-xs whitespace-nowrap">
              <Checkbox
                checked={showRecibidos}
                onCheckedChange={(c) => setShowRecibidos(!!c)}
              />
              Mostrar recibidos
            </label>
          </div>

          {/* Lista */}
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {items.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-6">
                {pendientes === 0
                  ? "🎉 Todos recibieron la inducción"
                  : "Sin resultados"}
              </div>
            )}
            {items.map(({ personal, recibido, fechaRecibido }) => {
              if (!personal) return null;
              return (
                <div
                  key={personal._id}
                  className={cn(
                    "flex items-center justify-between border rounded px-3 py-2",
                    recibido && "bg-green-50 border-green-300"
                  )}
                >
                  <div>
                    <div className="text-sm font-medium">
                      {personal.apellidos} {personal.nombres}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {personal.cargo} · {personal.nick}
                      {recibido && fechaRecibido && (
                        <> · ✅ {fechaRecibido}</>
                      )}
                    </div>
                  </div>
                  {recibido ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDesmarcar(personal._id)}
                    >
                      Desmarcar
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => handleMarcar(personal._id)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Recibido
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SeguimientoCapacitacionDialog({
  capacitacionId,
  personales,
  trigger,
}: {
  capacitacionId: Id<"capacitaciones">;
  personales: Personal[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [showRecibidos, setShowRecibidos] = useState(true);
  const asignaciones = useQuery(
    api.capacitaciones.listAsignaciones,
    { capacitacionId }
  );
  const cap = useQuery(api.capacitaciones.getCapacitacion, { id: capacitacionId });
  const marcar = useMutation(api.capacitaciones.marcarRecibido);
  const desmarcar = useMutation(api.capacitaciones.desmarcarRecibido);

  const personalById = useMemo(
    () => new Map(personales.map((p) => [p._id, p])),
    [personales]
  );

  const items = useMemo(() => {
    if (!asignaciones) return [];
    return asignaciones
      .map((a) => {
        const p = personalById.get(a.personalId);
        const turno = cap?.turnos.find((t) => t.id === a.turnoId);
        return {
          personal: p,
          recibido: !!a.fechaRecibido,
          fechaRecibido: a.fechaRecibido,
          turnoId: a.turnoId,
          turnoLabel: turno
            ? `T${cap!.turnos.indexOf(turno) + 1} ${turno.fecha} ${turno.hora}`
            : "Sin turno",
        };
      })
      .filter((x) => !!x.personal)
      .filter((x) => {
        if (!filter) return true;
        const f = filter.toLowerCase();
        const p = x.personal!;
        return (
          p.apellidos.toLowerCase().includes(f) ||
          p.nombres.toLowerCase().includes(f) ||
          p.nick.toLowerCase().includes(f)
        );
      })
      .filter((x) => (showRecibidos ? true : !x.recibido));
  }, [asignaciones, cap, personalById, filter, showRecibidos]);

  const total = asignaciones?.length ?? 0;
  const recibidos = asignaciones?.filter((a) => a.fechaRecibido).length ?? 0;
  const pendientes = total - recibidos;

  async function handleMarcar(personalId: Id<"personales">) {
    try {
      await marcar({ capacitacionId, personalId });
      const p = personalById.get(personalId);
      toast.success(`${p?.nick ?? "Persona"} marcado`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  async function handleDesmarcar(personalId: Id<"personales">) {
    try {
      await desmarcar({ capacitacionId, personalId });
      toast.success("Desmarcado");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <ListChecks className="h-4 w-4 mr-1" /> Seguimiento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Seguimiento · {cap?.tema ?? "..."}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-md">
            <Badge variant={recibidos === total ? "success" : recibidos > 0 ? "warning" : "secondary"}>
              {recibidos}/{total} recibidos
            </Badge>
            {pendientes > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {pendientes} pendiente(s)
              </Badge>
            )}
            {cap && (
              <div className="text-xs text-muted-foreground ml-auto">
                Turnos: {cap.turnos.length}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por nombre o nick..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8"
            />
            <label className="flex items-center gap-1 text-xs whitespace-nowrap">
              <Checkbox
                checked={showRecibidos}
                onCheckedChange={(c) => setShowRecibidos(!!c)}
              />
              Mostrar recibidos
            </label>
          </div>

          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {items.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-6">
                {pendientes === 0 && total > 0
                  ? "🎉 Todos recibieron la capacitación"
                  : "Sin resultados"}
              </div>
            )}
            {items.map(({ personal, recibido, fechaRecibido, turnoLabel }) => {
              if (!personal) return null;
              return (
                <div
                  key={personal._id}
                  className={cn(
                    "flex items-center justify-between border rounded px-3 py-2",
                    recibido && "bg-green-50 border-green-300"
                  )}
                >
                  <div>
                    <div className="text-sm font-medium">
                      {personal.apellidos} {personal.nombres}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {personal.cargo} · {personal.nick}
                      {" · "}
                      <Badge variant="outline" className="text-[10px]">
                        {turnoLabel}
                      </Badge>
                      {recibido && fechaRecibido && (
                        <> · ✅ {fechaRecibido}</>
                      )}
                    </div>
                  </div>
                  {recibido ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDesmarcar(personal._id)}
                    >
                      Desmarcar
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => handleMarcar(personal._id)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Recibido
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
