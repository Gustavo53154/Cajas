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
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ListChecks, RotateCcw } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

type Asignacion = {
  _id: Id<"capacitacionAsignaciones">;
  personalId: Id<"personales">;
  turnoId?: string;
  fechaRecibido?: string;
  nota?: string;
};

type Personal = {
  _id: Id<"personales">;
  apellidos: string;
  nombres: string;
  nick: string;
};

export function RecibidoChecklist({
  capacitacionId,
  turnoId,
  turnoLabel,
  asignaciones,
  personales,
  trigger,
}: {
  capacitacionId: Id<"capacitaciones">;
  turnoId: string;
  turnoLabel: string;
  asignaciones: Asignacion[];
  personales: Personal[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const marcar = useMutation(api.capacitaciones.marcarRecibido);
  const desmarcar = useMutation(api.capacitaciones.desmarcarRecibido);

  const personalById = new Map(personales.map((p) => [p._id, p]));
  const enTurno = asignaciones.filter((a) => a.turnoId === turnoId);
  const recibidos = enTurno.filter((a) => a.fechaRecibido).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <ListChecks className="h-4 w-4 mr-1" />
            {turnoLabel} · {recibidos}/{enTurno.length}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Recibido · {turnoLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {enTurno.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">
              Nadie asignado a este turno todavía.
            </div>
          )}
          {enTurno.map((a) => {
            const p = personalById.get(a.personalId);
            if (!p) return null;
            const done = !!a.fechaRecibido;
            return (
              <div
                key={a._id}
                className="flex items-center justify-between border rounded px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">
                    {p.apellidos} {p.nombres}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {done ? `Recibido el ${a.fechaRecibido}` : "Pendiente"}
                  </div>
                </div>
                {done ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await desmarcar({
                          capacitacionId,
                          personalId: a.personalId,
                        });
                        toast.success(`${p.nick} desmarcado`);
                      } catch (e: any) {
                        toast.error(e.message);
                      }
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Desmarcar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await marcar({
                          capacitacionId,
                          personalId: a.personalId,
                        });
                        toast.success(`${p.nick} marcado recibido`);
                      } catch (e: any) {
                        toast.error(e.message);
                      }
                    }}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Recibido
                  </Button>
                )}
              </div>
            );
          })}
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
