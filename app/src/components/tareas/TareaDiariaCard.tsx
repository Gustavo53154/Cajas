"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, ArrowRight, UserCog, CheckCircle2 } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

type Tarea = {
  _id: Id<"tareasInstancia">;
  titulo: string;
  descripcion?: string;
  plazo?: string;
  estado: "pendiente" | "en_curso" | "completada" | "vencida";
  responsableId: Id<"personales">;
  colaboradoresIds: Id<"personales">[];
  asignadosIds: Id<"personales">[];
  completadosIds: Id<"personales">[];
  fecha: string;
};

type Personal = {
  _id: Id<"personales">;
  apellidos: string;
  nombres: string;
  nick: string;
  cargo: string;
};

export function TareaDiariaCard({
  tarea,
  personalById,
  onReassign,
  onDelete,
  onRollover,
}: {
  tarea: Tarea;
  personalById: Map<Id<"personales">, Personal>;
  onReassign: (id: Id<"tareasInstancia">, responsableId: Id<"personales">) => void;
  onDelete: (id: Id<"tareasInstancia">) => void;
  onRollover: (id: Id<"tareasInstancia">) => void;
}) {
  const toggle = useMutation(api.tareas.toggleCompletada);
  const responsable = personalById.get(tarea.responsableId);
  const colaboradores = tarea.colaboradoresIds
    .map((id) => personalById.get(id))
    .filter(Boolean) as Personal[];

  return (
    <Card className={tarea.estado === "completada" ? "opacity-60" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              {tarea.titulo}
              <Badge
                variant={
                  tarea.estado === "completada"
                    ? "success"
                    : tarea.estado === "en_curso"
                    ? "warning"
                    : tarea.estado === "vencida"
                    ? "destructive"
                    : "secondary"
                }
                className="text-[10px]"
              >
                {tarea.estado}
              </Badge>
              {tarea.plazo && (
                <Badge variant="outline" className="text-[10px]">
                  ⏰ {tarea.plazo}
                </Badge>
              )}
            </CardTitle>
            {tarea.descripcion && (
              <div className="text-sm text-muted-foreground mt-1">{tarea.descripcion}</div>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
              {responsable ? (
                <span className="font-medium text-foreground">
                  👤 {responsable.apellidos} {responsable.nombres}{" "}
                  <span className="text-muted-foreground">({responsable.nick})</span>
                </span>
              ) : (
                <span className="text-amber-600 font-medium">⚠ Sin asignar</span>
              )}
              {colaboradores.length > 0 && (
                <span className="text-muted-foreground">
                  · +{colaboradores.length} colaborador(es)
                </span>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRollover(tarea._id)}>
                <ArrowRight className="h-3 w-3 mr-2" /> Pasar a mañana
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onReassign(tarea._id, tarea.responsableId ?? tarea.asignadosIds[0] ?? ("personales" as any))}
              >
                <UserCog className="h-3 w-3 mr-2" /> {responsable ? "Reasignar" : "Asignar"} responsable
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(tarea._id)}
                className="text-red-600"
              >
                <Trash2 className="h-3 w-3 mr-2" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {tarea.asignadosIds.length === 0 && (
            <div className="text-xs text-muted-foreground">
              Sin asignados.
            </div>
          )}
          {tarea.asignadosIds.map((id) => {
            const p = personalById.get(id);
            if (!p) return null;
            const done = tarea.completadosIds.includes(id);
            return (
              <label
                key={id}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={done}
                  onCheckedChange={() =>
                    toggle({ tareaId: tarea._id, personalId: id }).catch((e) =>
                      toast.error(e.message)
                    )
                  }
                />
                <span
                  className={done ? "line-through text-muted-foreground" : ""}
                >
                  {p.apellidos} {p.nombres}{" "}
                  <span className="text-xs text-muted-foreground">({p.nick})</span>
                </span>
                {done && <CheckCircle2 className="h-3 w-3 text-green-500" />}
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
