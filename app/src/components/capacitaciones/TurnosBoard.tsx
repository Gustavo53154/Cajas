"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, GripVertical, X, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { setDragData, readDragData, hasDndData } from "@/lib/dnd";
import { cn } from "@/lib/utils";
import { RecibidoChecklist } from "@/components/capacitaciones/RecibidoChecklist";

type Turno = { id: string; fecha: string; hora: string; duracionMin: number };

type Asignacion = {
  _id: Id<"capacitacionAsignaciones">;
  capacitacionId: Id<"capacitaciones">;
  personalId: Id<"personales">;
  turnoId?: string;
  fechaRecibido?: string;
};

type Personal = {
  _id: Id<"personales">;
  apellidos: string;
  nombres: string;
  nick: string;
  cargo: string;
};

const COLUMN_SIN_ASIGNAR = "__sin_asignar__";

export function TurnosBoard({
  capacitacionId,
  turnos,
  asignaciones,
  personales,
  onAsignar,
}: {
  capacitacionId: Id<"capacitaciones">;
  turnos: Turno[];
  asignaciones: Asignacion[];
  personales: Personal[];
  onAsignar: (personalId: Id<"personales">, turnoId: string | null) => void;
}) {
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const marcar = useMutation(api.capacitaciones.marcarRecibido);
  const desmarcar = useMutation(api.capacitaciones.desmarcarRecibido);

  const personalById = useMemo(() => {
    const m = new Map<Id<"personales">, Personal>();
    for (const p of personales) m.set(p._id, p);
    return m;
  }, [personales]);

  async function handleToggleRecibido(
    personalId: Id<"personales">,
    recibido: boolean
  ) {
    try {
      if (recibido) {
        await desmarcar({ capacitacionId, personalId });
      } else {
        await marcar({ capacitacionId, personalId });
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const porTurno = useMemo(() => {
    const m = new Map<string, Asignacion[]>();
    for (const t of turnos) m.set(t.id, []);
    for (const a of asignaciones) {
      if (a.turnoId && m.has(a.turnoId)) {
        m.get(a.turnoId)!.push(a);
      }
    }
    return m;
  }, [turnos, asignaciones]);

  const sinAsignar = useMemo(
    () => asignaciones.filter((a) => !a.turnoId),
    [asignaciones]
  );

  const total = asignaciones.length;
  const asignados = asignaciones.filter((a) => a.turnoId).length;
  const recibidos = asignaciones.filter((a) => a.fechaRecibido).length;

  function onDragStart(e: React.DragEvent, personalId: Id<"personales">) {
    setDragData(e, { source: "turnos-board", data: { personalId } });
  }

  function onDragOverCol(e: React.DragEvent, colId: string) {
    if (hasDndData(e)) {
      e.preventDefault();
      setHoverCol(colId);
    }
  }
  function onDragLeaveCol() {
    setHoverCol(null);
  }
  function onDropCol(e: React.DragEvent, colId: string) {
    e.preventDefault();
    setHoverCol(null);
    const payload = readDragData<{ personalId: Id<"personales"> }>(e);
    if (!payload) return;
    const target = colId === COLUMN_SIN_ASIGNAR ? null : colId;
    const asig = asignaciones.find((a) => a.personalId === payload.data.personalId);
    if (!asig) return;
    if (asig.turnoId === target) return;
    onAsignar(payload.data.personalId, target);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="font-medium">{asignados}</span>
          <span className="text-muted-foreground"> de {total} asignados a turno</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={recibidos === total ? "success" : recibidos > 0 ? "warning" : "secondary"}>
            {recibidos}/{total} recibidos
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {/* Sin asignar */}
        <DropColumn
          colId={COLUMN_SIN_ASIGNAR}
          title="Sin asignar"
          subtitle={`${sinAsignar.length} persona(s)`}
          hover={hoverCol === COLUMN_SIN_ASIGNAR}
          onDragOver={onDragOverCol}
          onDragLeave={onDragLeaveCol}
          onDrop={onDropCol}
          highlight
        >
          {sinAsignar.map((a) => {
            const p = personalById.get(a.personalId);
            if (!p) return null;
            return (
              <PersonaChip
                key={a._id}
                p={p}
                onDragStart={onDragStart}
                onQuitar={a.turnoId ? () => onAsignar(a.personalId, null) : undefined}
                recibido={!!a.fechaRecibido}
                onToggleRecibido={(cur) => handleToggleRecibido(a.personalId, cur)}
              />
            );
          })}
          {sinAsignar.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">
              Todos asignados ✓
            </div>
          )}
        </DropColumn>

        {turnos.map((t, idx) => {
          const items = porTurno.get(t.id) ?? [];
          return (
            <DropColumn
              key={t.id}
              colId={t.id}
              title={`Turno ${idx + 1}`}
              subtitle={`${t.fecha} · ${t.hora} · ${t.duracionMin} min`}
              hover={hoverCol === t.id}
              onDragOver={onDragOverCol}
              onDragLeave={onDragLeaveCol}
              onDrop={onDropCol}
              actions={
                <RecibidoChecklist
                  capacitacionId={capacitacionId}
                  turnoId={t.id}
                  turnoLabel={`T${idx + 1} ${t.fecha} ${t.hora}`}
                  asignaciones={asignaciones}
                  personales={personales}
                  trigger={
                    <button
                      type="button"
                      className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-background hover:bg-accent transition-colors"
                      title="Marcar recibido"
                    >
                      <ListChecks className="h-3 w-3" />
                      {items.filter((a) => a.fechaRecibido).length}/{items.length}
                    </button>
                  }
                />
              }
            >
              {items.map((a) => {
                const p = personalById.get(a.personalId);
                if (!p) return null;
                return (
                  <PersonaChip
                    key={a._id}
                    p={p}
                    onDragStart={onDragStart}
                    onQuitar={() => onAsignar(a.personalId, null)}
                    recibido={!!a.fechaRecibido}
                    onToggleRecibido={(cur) => handleToggleRecibido(a.personalId, cur)}
                  />
                );
              })}
              {items.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Arrastra personas aquí
                </div>
              )}
            </DropColumn>
          );
        })}
      </div>
    </div>
  );
}

function DropColumn({
  colId,
  title,
  subtitle,
  children,
  hover,
  onDragOver,
  onDragLeave,
  onDrop,
  highlight,
  actions,
}: {
  colId: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  hover: boolean;
  onDragOver: (e: React.DragEvent, colId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, colId: string) => void;
  highlight?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <Card
      onDragOver={(e) => onDragOver(e, colId)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, colId)}
      className={cn(
        "transition-colors",
        hover && "ring-2 ring-primary bg-primary/5",
        highlight && !hover && "bg-muted/30"
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex flex-col gap-1">
          <div className="flex items-center justify-between gap-1">
            <span>{title}</span>
            {actions}
          </div>
          {subtitle && (
            <Badge variant="outline" className="text-[10px] w-fit">
              {subtitle}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 min-h-[120px]">{children}</CardContent>
    </Card>
  );
}

function PersonaChip({
  p,
  onDragStart,
  onQuitar,
  recibido,
  onToggleRecibido,
}: {
  p: Personal;
  onDragStart: (e: React.DragEvent, personalId: Id<"personales">) => void;
  onQuitar?: () => void;
  recibido: boolean;
  onToggleRecibido?: (current: boolean) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, p._id)}
      tabIndex={0}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm cursor-grab active:cursor-grabbing select-none",
        recibido && "bg-green-50 border-green-300"
      )}
      aria-label={`${p.apellidos} ${p.nombres}, arrastrable`}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground" />
      {onToggleRecibido && (
        <div
          className="cursor-default"
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={recibido}
            onCheckedChange={() => onToggleRecibido(recibido)}
            title={recibido ? "Recibido (desmarcar)" : "Marcar recibido"}
            aria-label={`Marcar ${p.apellidos} ${p.nombres} como recibido`}
          />
        </div>
      )}
      <span className="flex-1 truncate">
        {p.apellidos} {p.nombres}
        <span className="text-xs text-muted-foreground ml-1">({p.nick})</span>
      </span>
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Quitar de este turno"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
