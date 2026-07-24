"use client";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CalendarDays, ChevronLeft, ChevronRight, Grid3X3, Download } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const CARGO_COLORS: Record<string, { bg: string }> = {
  "Cajer@": { bg: "bg-red-100" },
  "Self Checkout": { bg: "bg-yellow-100" },
  "RS": { bg: "bg-blue-100" },
  "Ecommerce": { bg: "bg-purple-100" },
  "Supervisor(@)": { bg: "bg-green-100" },
  "JefeCajas": { bg: "bg-orange-100" },
};

const CARGOS_DISPLAY = ["Cajer@", "Self Checkout", "RS", "Ecommerce", "Supervisor(@)"] as const;

function generarSlots(): string[] {
  const slots: string[] = [];
  for (let h = 6; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

function slotToMin(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

const INTERVAL_PRESETS = {
  completo: { nombre: "Todo el día", desde: "06:00", hasta: "24:00" },
  primer: { nombre: "Primer turno (06:00-16:00)", desde: "06:00", hasta: "16:00" },
  segundo: { nombre: "Segundo turno (14:00-24:00)", desde: "14:00", hasta: "24:00" },
  apertura: { nombre: "Apertura (06:00-12:00)", desde: "06:00", hasta: "12:00" },
  cierre: { nombre: "Cierre (17:00-24:00)", desde: "17:00", hasta: "24:00" },
  personalizado: { nombre: "Personalizado", desde: "06:00", hasta: "24:00" },
} as const;

type PresetKey = keyof typeof INTERVAL_PRESETS;

export default function CoberturaPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const semanas = useQuery(api.horarios.listSemanas, tienda ? { tiendaId: tienda._id } : "skip");
  const getOrCreateSemana = useMutation(api.horarios.getOrCreateSemanaActual);

  const [semanaId, setSemanaId] = useState<Id<"semanas"> | null>(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState(1);
  const [cargosVisibles, setCargosVisibles] = useState<Set<string>>(
    new Set(CARGOS_DISPLAY as readonly string[])
  );
  const [vistaTraspuesta, setVistaTraspuesta] = useState(false);
  const [intervaloPreset, setIntervaloPreset] = useState<PresetKey>("completo");
  const [intervaloCustom, setIntervaloCustom] = useState({ desde: "06:00", hasta: "24:00" });

  useEffect(() => {
    if (tienda && !semanaId) {
      getOrCreateSemana({ tiendaId: tienda._id })
        .then(setSemanaId)
        .catch(console.error);
    }
  }, [tienda, semanaId, getOrCreateSemana]);

  const cobertura = useQuery(
    api.cobertura.getCoberturaSemana,
    tienda && semanaId ? { tiendaId: tienda._id, semanaId } : "skip"
  );

  const slots = useMemo(() => generarSlots(), []);

  // Intervalo activo
  const intervaloActual = useMemo(() => {
    if (intervaloPreset === "personalizado") {
      return { desde: intervaloCustom.desde, hasta: intervaloCustom.hasta };
    }
    return INTERVAL_PRESETS[intervaloPreset];
  }, [intervaloPreset, intervaloCustom]);

  // Slots filtrados según el intervalo
  const slotsVisibles = useMemo(() => {
    const desdeMin = slotToMin(intervaloActual.desde);
    const hastaMin = slotToMin(intervaloActual.hasta);
    return slots.filter((s) => {
      const m = slotToMin(s);
      return m >= desdeMin && m < hastaMin;
    });
  }, [slots, intervaloActual]);

  // Concurrencia: cuántas personas en cada slot por cargo (para el día seleccionado)
  const concurrencia = useMemo(() => {
    const result: Record<string, Record<number, number>> = {};
    for (const cargo of CARGOS_DISPLAY) {
      result[cargo] = {};
      for (let i = 0; i < slots.length; i++) {
        result[cargo][i] = 0;
      }
    }
    if (!cobertura) return result;
    for (const dia of Object.keys(cobertura.resultado)) {
      const d = parseInt(dia);
      if (d !== diaSeleccionado) continue;
      for (const cargo of Object.keys((cobertura.resultado as any)[d] ?? {})) {
        for (const p of (cobertura.resultado as any)[d][cargo] ?? []) {
          const eMin = slotToMin(p.entrada);
          const sMin = slotToMin(p.salida);
          for (let i = 0; i < slots.length; i++) {
            const slotMin = slotToMin(slots[i]);
            if (slotMin >= eMin && slotMin < sMin) {
              result[cargo][i] = (result[cargo][i] ?? 0) + 1;
            }
          }
        }
      }
    }
    return result;
  }, [cobertura, slots, diaSeleccionado]);

  // Early returns DESPUÉS de todos los hooks
  if (!tienda) {
    return <div className="p-6">Cargando tienda...</div>;
  }
  if (!semanaId) {
    return <div className="p-6">Cargando semana...</div>;
  }

  function toggleCargo(cargo: string) {
    const nuevo = new Set(cargosVisibles);
    if (nuevo.has(cargo)) nuevo.delete(cargo);
    else nuevo.add(cargo);
    setCargosVisibles(nuevo);
  }

  async function exportPdf() {
    if (!cobertura) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const usableWidth = pageWidth - 2 * margin;
    const labelWidth = 60;
    const cargoWidth = 22;
    const daysStartX = margin + labelWidth + cargoWidth;
    const daysAreaWidth = usableWidth - labelWidth - cargoWidth;
    const colWidth = daysAreaWidth / 7;
    const rowHeight = 6;
    const titleY = margin;

    const personasMap = new Map<
      string,
      { apellidos: string; nombres: string; nick: string; cargo: string }
    >();
    const scheduleMap = new Map<string, Record<number, { entrada: string; salida: string }>>();
    for (const dia of Object.keys(cobertura.resultado)) {
      const d = parseInt(dia);
      for (const cargo of Object.keys((cobertura.resultado as any)[d] ?? {})) {
        for (const p of (cobertura.resultado as any)[d][cargo] ?? []) {
          if (!personasMap.has(p.personalId)) {
            personasMap.set(p.personalId, {
              apellidos: p.apellidos,
              nombres: p.nombres,
              nick: p.nick,
              cargo,
            });
          }
          const sch = scheduleMap.get(p.personalId) ?? {};
          sch[d] = { entrada: p.entrada, salida: p.salida };
          scheduleMap.set(p.personalId, sch);
        }
      }
    }
    const personas = Array.from(personasMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => {
        const cargoCompare = a.cargo.localeCompare(b.cargo);
        if (cargoCompare !== 0) return cargoCompare;
        return a.apellidos.localeCompare(b.apellidos);
      });
    const totalPersonas = personas.length;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(
      `COBERTURA SEMANA ${cobertura.semana.fechaInicio} → ${cobertura.semana.fechaFin}`,
      margin,
      titleY + 4,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      `Plaza Vea · Generado: ${new Date().toLocaleString("es-PE")} · ${totalPersonas} personas`,
      margin,
      titleY + 9,
    );

    const drawHeader = (y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setFillColor(230, 230, 230);
      doc.rect(margin, y, usableWidth, rowHeight, "F");
      doc.text("Apellidos, Nombres (Nick)", margin + 1, y + 4);
      doc.text("Cargo", margin + labelWidth + 1, y + 4);
      DIAS_SEMANA.forEach((dia, i) => {
        doc.text(
          dia.slice(0, 3).toUpperCase(),
          daysStartX + i * colWidth + colWidth / 2,
          y + 4,
          { align: "center" },
        );
      });
      return y + rowHeight;
    };

    const tableY = titleY + 14;
    let y = drawHeader(tableY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (const p of personas) {
      if (y > pageHeight - margin - 2) {
        doc.addPage();
        y = drawHeader(margin);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
      }
      doc.text(
        `${p.apellidos} ${p.nombres}`,
        margin + 1,
        y + 3.5,
        { maxWidth: labelWidth - 2 },
      );
      doc.setFontSize(6);
      doc.text(p.nick, margin + 1, y + 5.5, { maxWidth: labelWidth - 2 });
      doc.setFontSize(7);
      doc.text(p.cargo, margin + labelWidth + 1, y + 3.5, { maxWidth: cargoWidth - 2 });
      const schedule = scheduleMap.get(p.id) ?? {};
      DIAS_SEMANA.forEach((dia, i) => {
        const d = i + 1;
        const h = schedule[d];
        const txt = !h ? "DESC" : h.salida ? `${h.entrada}-${h.salida}` : `${h.entrada}*`;
        doc.text(
          txt,
          daysStartX + i * colWidth + colWidth / 2,
          y + 4,
          { align: "center" },
        );
      });
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
      y += rowHeight;
    }
    doc.save(`cobertura_${cobertura.semana.fechaInicio}.pdf`);
    toast.success(`PDF generado con ${totalPersonas} personas`);
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Grid3X3 className="h-6 w-6" />
            Cobertura de Personal
          </h1>
          <p className="text-sm text-muted-foreground">
            Mapa de quién está en qué horario, por día y por cargo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={semanaId ?? ""}
            onValueChange={(v) => setSemanaId(v as Id<"semanas">)}
          >
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Selecciona semana" />
            </SelectTrigger>
            <SelectContent>
              {semanas?.map((s: any) => (
                <SelectItem key={s._id} value={s._id}>
                  {s.fechaInicio} → {s.fechaFin} ({s.estado})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={exportPdf} disabled={!cobertura}>
            <Download className="h-4 w-4 mr-1" /> Exportar PDF (7 días)
          </Button>
        </div>
      </div>

      {!cobertura ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Cargando cobertura...
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Selector de día */}
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant="outline"
              size="icon"
              disabled={diaSeleccionado <= 1}
              onClick={() => setDiaSeleccionado((d) => Math.max(1, d - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex gap-1">
              {DIAS_SEMANA.map((d, i) => {
                const personasEnDia = Object.values((cobertura.resultado as any)[i + 1] ?? {}).reduce(
                  (acc: number, arr: any[]) => acc + (arr?.length ?? 0),
                  0,
                );
                return (
                  <Button
                    key={i}
                    size="sm"
                    variant={diaSeleccionado === i + 1 ? "default" : "outline"}
                    onClick={() => setDiaSeleccionado(i + 1)}
                  >
                    {d.slice(0, 3)}{" "}
                    {(personasEnDia as number) > 0 && (
                      <Badge variant="secondary" className="ml-1 text-[9px] py-0">
                        {personasEnDia as number}
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="icon"
              disabled={diaSeleccionado >= 7}
              onClick={() => setDiaSeleccionado((d) => Math.min(7, d + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Badge variant="outline" className="ml-2">
              <CalendarDays className="h-3 w-3 mr-1" />
              {DIAS_SEMANA[diaSeleccionado - 1]}
            </Badge>
          </div>

          {/* Filtros por cargo + selección de intervalo + vista traspuesta */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">Cargos:</span>
            {CARGOS_DISPLAY.map((cargo) => {
              const cantEnDia = ((cobertura.resultado as any)[diaSeleccionado]?.[cargo] ?? []).length;
              return (
                <Button
                  key={cargo}
                  size="sm"
                  variant={cargosVisibles.has(cargo) ? "default" : "outline"}
                  className="h-7"
                  onClick={() => toggleCargo(cargo)}
                >
                  {cargosVisibles.has(cargo) ? "✓" : "○"} {cargo} ({cantEnDia})
                </Button>
              );
            })}
            <div className="ml-auto flex items-center gap-1.5">
              <Select
                value={intervaloPreset}
                onValueChange={(v: any) => setIntervaloPreset(v)}
              >
                <SelectTrigger className="h-7 w-52 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVAL_PRESETS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 h-7 pl-2 border-l">
                <span className="text-xs text-muted-foreground">Traspuesta</span>
                <Switch
                  checked={vistaTraspuesta}
                  onCheckedChange={setVistaTraspuesta}
                  title="Alternar entre vista normal y traspuesta"
                />
              </div>
            </div>
          </div>

          {/* Inputs de intervalo personalizado */}
          {intervaloPreset === "personalizado" && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-muted/30 rounded">
              <span className="text-xs">Personalizado:</span>
              <Input
                type="time"
                value={intervaloCustom.desde}
                onChange={(e) =>
                  setIntervaloCustom({ ...intervaloCustom, desde: e.target.value })
                }
                className="w-28 h-7 text-xs"
              />
              <span className="text-xs">a</span>
              <Input
                type="time"
                value={intervaloCustom.hasta}
                onChange={(e) =>
                  setIntervaloCustom({ ...intervaloCustom, hasta: e.target.value })
                }
                className="w-28 h-7 text-xs"
              />
            </div>
          )}

          {/* Resumen del intervalo activo */}
          <div className="text-xs text-muted-foreground mb-2">
            Mostrando:{" "}
            <span className="font-mono font-semibold">{intervaloActual.desde}</span> a{" "}
            <span className="font-mono font-semibold">{intervaloActual.hasta}</span> ·{" "}
            {slotsVisibles.length} bloques de 15 min
          </div>

          {/* Mapa de cobertura */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table
                  className="w-full text-xs border-collapse"
                  style={{ minWidth: vistaTraspuesta ? "1100px" : "900px" }}
                >
                  {vistaTraspuesta ? (
                    <>
                      <thead>
                        <tr>
                          <th className="border bg-muted p-1 text-left sticky left-0 z-10 min-w-[180px]">
                            Persona ↓ / Hora →
                          </th>
                          {slotsVisibles.map((slot, idx) => {
                            const esHoraEnPunto = slot.endsWith(":00");
                            return (
                              <th
                                key={idx}
                                className={`border p-1 text-center text-[10px] min-w-[36px] font-mono ${
                                  esHoraEnPunto ? "bg-muted font-bold" : "bg-muted/50 text-muted-foreground"
                                }`}
                              >
                                {slot}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {CARGOS_DISPLAY.filter((c) => cargosVisibles.has(c)).flatMap((cargo) => {
                          const personas = (cobertura.resultado as any)[diaSeleccionado]?.[cargo] ?? [];
                          return personas.map((p: any) => {
                            const eMin = slotToMin(p.entrada);
                            const sMin = slotToMin(p.salida);
                            return (
                              <tr key={p.personalId}>
                                <th
                                  className={`border p-1 text-left sticky left-0 z-10 ${CARGO_COLORS[cargo]?.bg ?? ""}`}
                                  title={`${p.apellidos} ${p.nombres} (${cargo})`}
                                >
                                  <div className="text-[11px] font-semibold leading-tight">
                                    {p.apellidos.split(" ")[0]} {p.nick}
                                  </div>
                                  <div className="text-[9px] text-muted-foreground leading-tight">
                                    {p.entrada}–{p.salida}
                                  </div>
                                </th>
                                {slotsVisibles.map((slot, idx) => {
                                  const slotMin = slotToMin(slot);
                                  const esHoraEnPunto = slot.endsWith(":00");
                                  const presente = slotMin >= eMin && slotMin < sMin;
                                  const esEntrada = slot === p.entrada;
                                  const esSalida = slot === p.salida;
                                  return (
                                    <td
                                      key={idx}
                                      className={`border p-0 text-center ${
                                        presente
                                          ? CARGO_COLORS[cargo]?.bg ?? "bg-gray-200"
                                          : ""
                                      } ${esEntrada || esSalida ? "ring-2 ring-primary" : ""} ${
                                        esHoraEnPunto ? "border-l-2 border-l-gray-400" : ""
                                      }`}
                                    >
                                      {esEntrada && (
                                        <div className="text-[9px] font-bold text-green-700">E</div>
                                      )}
                                      {esSalida && (
                                        <div className="text-[9px] font-bold text-red-700">S</div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </>
                  ) : (
                    <>
                      <thead>
                        <tr>
                          <th className="border bg-muted p-1 text-left sticky left-0 z-10 w-[60px]">
                            Hora
                          </th>
                          {CARGOS_DISPLAY.filter((c) => cargosVisibles.has(c)).flatMap((cargo) => {
                            const personas = (cobertura.resultado as any)[diaSeleccionado]?.[cargo] ?? [];
                            return personas.map((p: any) => (
                              <th
                                key={p.personalId}
                                className={`border p-1 text-center text-[10px] min-w-[80px] ${CARGO_COLORS[cargo]?.bg ?? ""}`}
                                title={`${p.apellidos} ${p.nombres} (${cargo})`}
                              >
                                {p.apellidos.split(" ")[0]} {p.nick}
                              </th>
                            ));
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {slotsVisibles.map((slot, idx) => {
                          const slotMin = slotToMin(slot);
                          const esHoraEnPunto = slot.endsWith(":00");
                          return (
                            <tr
                              key={idx}
                              className={`${esHoraEnPunto ? "border-t-2 border-t-gray-400" : ""} ${
                                idx % 4 === 0 ? "bg-muted/20" : ""
                              }`}
                            >
                              <td
                                className={`border p-1 font-mono text-center sticky left-0 z-10 bg-background font-semibold ${
                                  esHoraEnPunto ? "" : "text-muted-foreground"
                                }`}
                              >
                                {slot}
                              </td>
                              {CARGOS_DISPLAY.filter((c) => cargosVisibles.has(c)).flatMap((cargo) => {
                                const personas = (cobertura.resultado as any)[diaSeleccionado]?.[cargo] ?? [];
                                return personas.map((p: any) => {
                                  const eMin = slotToMin(p.entrada);
                                  const sMin = slotToMin(p.salida);
                                  const presente = slotMin >= eMin && slotMin < sMin;
                                  const esEntrada = slot === p.entrada;
                                  const esSalida = slot === p.salida;
                                  return (
                                    <td
                                      key={p.personalId}
                                      className={`border p-0 text-center ${
                                        presente
                                          ? CARGO_COLORS[cargo]?.bg ?? "bg-gray-200"
                                          : ""
                                      } ${esEntrada || esSalida ? "ring-2 ring-primary" : ""}`}
                                    >
                                      {esEntrada && (
                                        <div className="text-[9px] font-bold text-green-700">E</div>
                                      )}
                                      {esSalida && (
                                        <div className="text-[9px] font-bold text-red-700">S</div>
                                      )}
                                    </td>
                                  );
                                });
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
            <span className="text-muted-foreground">Leyenda:</span>
            {CARGOS_DISPLAY.map((cargo) => (
              <Badge key={cargo} className={CARGO_COLORS[cargo]?.bg}>
                {cargo}
              </Badge>
            ))}
            <span className="text-muted-foreground ml-3">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1" /> E = entrada
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full ml-2 mr-1" /> S = salida
            </span>
            <span className="text-muted-foreground ml-3">
              <span className="font-mono bg-muted px-1 rounded">E/S</span> = entrada/salida con borde
            </span>
          </div>
        </>
      )}
    </div>
  );
}
