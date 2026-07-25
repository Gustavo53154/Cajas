"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type Patron = "diaria" | "laborables" | "finde" | "personalizada";
export type DiaSemana = "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom";

export const DIAS: { value: DiaSemana; label: string }[] = [
  { value: "lun", label: "L" },
  { value: "mar", label: "M" },
  { value: "mie", label: "X" },
  { value: "jue", label: "J" },
  { value: "vie", label: "V" },
  { value: "sab", label: "S" },
  { value: "dom", label: "D" },
];

export function PatronSelector({
  value,
  diasSemana,
  onChange,
  onDiasChange,
}: {
  value: Patron;
  diasSemana: DiaSemana[];
  onChange: (v: Patron) => void;
  onDiasChange: (d: DiaSemana[]) => void;
}) {
  function toggleDia(d: DiaSemana) {
    if (diasSemana.includes(d)) onDiasChange(diasSemana.filter((x) => x !== d));
    else onDiasChange([...diasSemana, d]);
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm">Frecuencia</Label>
        <RadioGroup
          value={value}
          onValueChange={(v) => onChange(v as Patron)}
          className="mt-2 grid grid-cols-2 gap-2"
        >
          <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer text-sm">
            <RadioGroupItem value="diaria" /> Todos los días
          </label>
          <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer text-sm">
            <RadioGroupItem value="laborables" /> Lunes a viernes
          </label>
          <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer text-sm">
            <RadioGroupItem value="finde" /> Sábado y domingo
          </label>
          <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer text-sm">
            <RadioGroupItem value="personalizada" /> Días específicos
          </label>
        </RadioGroup>
      </div>

      {value === "personalizada" && (
        <div>
          <Label className="text-xs text-muted-foreground">Días</Label>
          <div className="flex gap-1 mt-1">
            {DIAS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDia(d.value)}
                className={
                  "h-9 w-9 rounded-md border text-sm font-medium " +
                  (diasSemana.includes(d.value)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent")
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
