"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Id } from "@/convex/_generated/dataModel";

export type ModoAsignacion = "manual" | "cargo" | "todos";

export const CARGOS = [
  "Cajer@",
  "Self Checkout",
  "RS",
  "Ecommerce",
] as const;
export type Cargo = (typeof CARGOS)[number];

export type DestinatariosValue = {
  modo: ModoAsignacion;
  cargos: Cargo[];
  personalIds: Id<"personales">[];
};

export function emptyDestinatarios(modo: ModoAsignacion = "cargo"): DestinatariosValue {
  return { modo, cargos: [], personalIds: [] };
}

export type PersonalLite = {
  _id: Id<"personales">;
  apellidos: string;
  nombres: string;
  nick: string;
  cargo: string;
  activo: boolean;
};

export function ModoAsignacionSelector({
  value,
  onChange,
  personales,
  defaultModo,
}: {
  value: DestinatariosValue;
  onChange: (v: DestinatariosValue) => void;
  personales: PersonalLite[];
  defaultModo?: ModoAsignacion;
}) {
  function setModo(modo: ModoAsignacion) {
    onChange({ ...value, modo });
  }
  function toggleCargo(c: Cargo) {
    const tiene = value.cargos.includes(c);
    onChange({
      ...value,
      cargos: tiene ? value.cargos.filter((x) => x !== c) : [...value.cargos, c],
    });
  }
  function togglePersona(id: Id<"personales">) {
    const tiene = value.personalIds.includes(id);
    onChange({
      ...value,
      personalIds: tiene
        ? value.personalIds.filter((x) => x !== id)
        : [...value.personalIds, id],
    });
  }
  function toggleTodos(activos: boolean) {
    onChange({
      ...value,
      personalIds: activos ? personales.filter((p) => p.activo).map((p) => p._id) : [],
    });
  }

  // Calcular conteo por cargo para mostrar en el preview
  const countPorCargo = (cargo: Cargo): number =>
    personales.filter((p) => p.activo && p.cargo === cargo).length;

  const totalCargos = value.cargos.reduce(
    (acc, c) => acc + countPorCargo(c),
    0
  );

  const modoActual = value.modo || defaultModo || "cargo";

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm">¿A quiénes va dirigido?</Label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <button
            type="button"
            onClick={() => setModo("cargo")}
            className={
              "rounded-md border px-3 py-2 text-sm " +
              (modoActual === "cargo"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent")
            }
          >
            Por cargo
            {value.cargos.length > 0 && (
              <Badge
                variant={modoActual === "cargo" ? "secondary" : "outline"}
                className="ml-1 text-[10px]"
              >
                {value.cargos.length}
              </Badge>
            )}
          </button>
          <button
            type="button"
            onClick={() => setModo("manual")}
            className={
              "rounded-md border px-3 py-2 text-sm " +
              (modoActual === "manual"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent")
            }
          >
            Personal específico
            {value.personalIds.length > 0 && (
              <Badge
                variant={modoActual === "manual" ? "secondary" : "outline"}
                className="ml-1 text-[10px]"
              >
                {value.personalIds.length}
              </Badge>
            )}
          </button>
          <button
            type="button"
            onClick={() => setModo("todos")}
            className={
              "rounded-md border px-3 py-2 text-sm " +
              (modoActual === "todos"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent")
            }
          >
            Todo el área
          </button>
        </div>
      </div>

      {modoActual === "cargo" && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">
              Selecciona 1 o más cargos:
            </div>
            {value.cargos.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {value.cargos.length} cargo(s) · {totalCargos} persona(s)
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {CARGOS.map((c) => {
              const count = countPorCargo(c);
              const checked = value.cargos.includes(c);
              return (
                <label
                  key={c}
                  className={
                    "flex items-center gap-2 text-sm border rounded px-2 py-1.5 cursor-pointer transition-colors " +
                    (checked
                      ? "bg-primary/10 border-primary"
                      : "bg-background hover:bg-accent")
                  }
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleCargo(c)}
                  />
                  <span className="flex-1">{c}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {count}
                  </Badge>
                </label>
              );
            })}
          </div>
          {value.cargos.length === 0 && (
            <div className="text-xs text-amber-600">
              ⚠ Selecciona al menos un cargo
            </div>
          )}
        </div>
      )}

      {modoActual === "manual" && (
        <div className="border rounded-md p-3 space-y-1">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-muted-foreground">Selecciona personas:</div>
            <div className="flex items-center gap-2 text-xs">
              <Switch
                checked={
                  value.personalIds.length > 0 &&
                  value.personalIds.length === personales.filter((p) => p.activo).length
                }
                onCheckedChange={(c) => toggleTodos(c)}
              />
              <span className="text-muted-foreground">Todos</span>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {personales
              .filter((p) => p.activo)
              .map((p) => (
                <label key={p._id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.personalIds.includes(p._id)}
                    onCheckedChange={() => togglePersona(p._id)}
                  />
                  <span>
                    {p.apellidos} {p.nombres}{" "}
                    <span className="text-xs text-muted-foreground">({p.cargo})</span>
                  </span>
                </label>
              ))}
          </div>
        </div>
      )}

      {modoActual === "todos" && (
        <div className="border rounded-md p-3 text-xs text-muted-foreground">
          Se incluirá a todo el personal activo del área de Cajas.
        </div>
      )}
    </div>
  );
}
