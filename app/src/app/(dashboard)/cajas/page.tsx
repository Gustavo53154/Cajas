"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Users } from "lucide-react";
import { toISODate } from "@/lib/utils";
import { toast } from "sonner";

const CAJA_TIPO_ICON: Record<string, string> = {
  regular: "🟥",
  rapida: "🟦",
  autoservicio: "🟩",
};

const CARGO_COLORS: Record<string, string> = {
  "Cajer@": "bg-red-100 text-red-700",
  "Self Checkout": "bg-yellow-100 text-yellow-700",
  "RS": "bg-blue-100 text-blue-700",
  "Ecommerce": "bg-purple-100 text-purple-700",
  "Supervisor(@)": "bg-green-100 text-green-700",
  "JefeCajas": "bg-orange-100 text-orange-700",
};

export default function CajasPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const cajas = useQuery(api.cajas.listCajas, tienda ? { tiendaId: tienda._id } : "skip");
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );
  const semanas = useQuery(api.horarios.listSemanas, tienda ? { tiendaId: tienda._id } : "skip");
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const [semanaIdReporte, setSemanaIdReporte] = useState<string>("");
  const [tab, setTab] = useState<"preview" | "asignados" | "huecos" | "log">("preview");
  const preview = useQuery(
    api.algoritmoCajas.previewAlgoritmo,
    tienda ? { tiendaId: tienda._id, fecha } : "skip"
  );
  const ejecutar = useMutation(api.algoritmoCajas.ejecutarAlgoritmo);
  const generarExcel = useAction(api.reporteUbicaciones.generarExcelUbicaciones);

  if (semanas && semanas.length > 0 && !semanaIdReporte) {
    setSemanaIdReporte(semanas[0]._id);
  }

  async function handleEjecutar() {
    if (!tienda) return;
    if (!confirm(`¿Generar ubicaciones para ${fecha}? Esto reemplazará las existentes en el tablero en vivo.`)) return;
    try {
      const res = await ejecutar({ tiendaId: tienda._id, fecha });
      toast.success(`Asignaciones creadas: ${res.asignacionesCreadas}. Huecos: ${res.huecos.length}. Errores: ${res.errores.length}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDescargarExcel(soloDia: boolean = false) {
    if (!tienda || !semanaIdReporte) {
      toast.error("Selecciona una semana primero");
      return;
    }
    try {
      toast.info(soloDia ? `Generando Excel del día ${fecha}...` : "Generando Excel de toda la semana...");
      const args: any = { tiendaId: tienda._id, semanaId: semanaIdReporte };
      if (soloDia) args.fecha = fecha;
      const base64 = await generarExcel(args);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = soloDia ? `_${fecha}` : "";
      a.download = `ubicaciones${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel descargado");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDescargarPlantilla(soloDia: boolean = false) {
    if (!tienda || !semanaIdReporte) {
      toast.error("Selecciona una semana primero");
      return;
    }
    try {
      toast.info(soloDia ? `Generando plantilla del día ${fecha}...` : "Generando plantilla de toda la semana...");
      const args: any = { tiendaId: tienda._id, semanaId: semanaIdReporte };
      if (soloDia) args.fecha = fecha;
      const base64 = await generarExcel(args);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = soloDia ? `_${fecha}` : "_semana";
      a.download = `plantilla${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Plantilla descargada");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Mapas para búsqueda rápida
  const personaMap = useMemo(() => new Map(personales?.map((p: any) => [p._id, p])), [personales]);
  const cajaMap = useMemo(() => new Map(cajas?.map((c: any) => [c._id, c])), [cajas]);

  // Días de la semana (L-D) de la semana que contiene la fecha seleccionada
  const DIAS_NOMBRES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const weekDates = useMemo(() => {
    const d = new Date(fecha + "T00:00:00");
    const dow = d.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(monday.getDate() + diff);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(day.getDate() + i);
      return day.toISOString().slice(0, 10);
    });
  }, [fecha]);

  // Agrupar asignaciones por caja, agrupando 25-30 como un solo bloque
  const asignacionesAgrupadas = useMemo(() => {
    const m = new Map<string, any[]>();
    preview?.asignaciones.forEach((a: any) => {
      const caja = cajaMap.get(a.cajaId) as any;
      if (!caja) return;
      const key = caja.tipo === "autoservicio" ? "AUTO" : `C${caja.codigo}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    });
    return m;
  }, [preview, cajaMap]);

  // Para mostrar en lista
  const asignacionesPlanas = useMemo(() => {
    return (preview?.asignaciones ?? []).map((a: any) => {
      const persona = personaMap.get(a.personalId) as any;
      const caja = cajaMap.get(a.cajaId) as any;
      return {
        ...a,
        persona,
        caja,
        personaLabel: persona ? `${persona.apellidos.split(" ")[0]} ${persona.nick || persona.nombres.split(" ")[0]}` : "?",
        cajaLabel: caja ? `C${caja.codigo}` : "?",
      };
    }).sort((a, b) => {
      if ((a.caja?.codigo ?? 999) !== (b.caja?.codigo ?? 999)) return (a.caja?.codigo ?? 999) - (b.caja?.codigo ?? 999);
      return a.bloque - b.bloque;
    });
  }, [preview, personaMap, cajaMap]);

  // Estadísticas
  const stats = useMemo(() => {
    const total = preview?.asignaciones.length ?? 0;
    const porTipo: Record<string, number> = {};
    asignacionesPlanas.forEach((a: any) => {
      const k = a.caja?.tipo ?? "?";
      porTipo[k] = (porTipo[k] ?? 0) + 1;
    });
    return { total, porTipo };
  }, [asignacionesPlanas, preview]);

  // Cajas para mostrar en grid (25-30 agrupadas)
  const cajasParaMostrar = useMemo(() => {
    if (!cajas) return [];
    const regulares = [...cajas]
      .filter((c: any) => c.tipo !== "autoservicio")
      .sort((a: any, b: any) => a.codigo - b.codigo);
    const auto = cajas.find((c: any) => c.tipo === "autoservicio");
    if (auto) {
      regulares.push({
        _id: "AUTO",
        codigo: 25,
        tipo: "autoservicio",
        preferencial: false,
        esVirtual: true,
        rango: "25-30",
      } as any);
    }
    return regulares;
  }, [cajas]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Asignación de Cajas</h1>
          <p className="text-sm text-muted-foreground">
            30 cajas · Cascada por entrada · Caja 1 preferencial · C25-30 = autoservicio
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Barra de días de la semana */}
          <div className="flex gap-1">
            {(["L", "M", "X", "J", "V", "S", "D"] as const).map((letra, i) => {
              const dateStr = weekDates[i];
              const isSelected = dateStr === fecha;
              const dayNum = dateStr.slice(8, 10);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setFecha(dateStr)}
                  className={`flex flex-col items-center justify-center h-11 w-11 rounded-md border text-xs transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-input"
                  }`}
                  title={DIAS_NOMBRES[i]}
                >
                  <span className="font-bold text-[11px] leading-none">{letra}</span>
                  <span className="text-[10px] leading-none mt-0.5">{dayNum}</span>
                </button>
              );
            })}
          </div>
          <Button onClick={handleEjecutar}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generar y publicar
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      {preview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Asignaciones totales</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="text-2xl font-bold text-red-600">{stats.porTipo["regular"] ?? 0}</div>
              <div className="text-xs text-muted-foreground">🟥 Regulares (1-18)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="text-2xl font-bold text-blue-600">{stats.porTipo["rapida"] ?? 0}</div>
              <div className="text-xs text-muted-foreground">🟦 Rápidas (19-24)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="text-2xl font-bold text-green-600">{stats.porTipo["autoservicio"] ?? 0}</div>
              <div className="text-xs text-muted-foreground">🟩 Autoservicio (25-30)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className={`text-2xl font-bold ${preview.huecos?.length > 0 ? "text-yellow-600" : "text-green-600"}`}>
                {preview.huecos?.length ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">⚠️ Huecos</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Errores */}
      {preview?.errores && preview.errores.length > 0 && (
        <Card className="mb-4 border-red-300 bg-red-50">
          <CardContent className="pt-4">
            <div className="text-sm font-semibold text-red-700 mb-2">⚠️ Errores del algoritmo:</div>
            <ul className="text-xs text-red-600 space-y-1">
              {preview.errores.map((e: string, i: number) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="preview">📋 Distribución</TabsTrigger>
          <TabsTrigger value="asignados">👥 Asignados ({asignacionesPlanas.length})</TabsTrigger>
          <TabsTrigger value="huecos">⚠️ Huecos ({preview?.huecos?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="log">📜 Log decisiones</TabsTrigger>
        </TabsList>

        {/* === TAB: Distribución visual por caja === */}
        <TabsContent value="preview">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {cajasParaMostrar.map((c: any) => {
              const key = c.esVirtual ? "AUTO" : `C${c.codigo}`;
              const asigs = asignacionesAgrupadas.get(key) ?? [];
              const huecos = preview?.huecos?.filter((h: any) => {
                if (c.esVirtual) {
                  const cajaIds = cajas?.filter((cx: any) => cx.tipo === "autoservicio").map((cx: any) => cx._id) ?? [];
                  return cajaIds.includes(h.cajaId);
                }
                return (cajaMap.get(h.cajaId) as any)?.codigo === c.codigo;
              }) ?? [];
              return (
                <Card key={c._id} className={`${c.preferencial ? "border-yellow-400 bg-yellow-50" : ""}`}>
                  <CardHeader className="p-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm">
                        {CAJA_TIPO_ICON[c.tipo]} {c.esVirtual ? "Autoservicio" : `C${c.codigo}`}
                      </div>
                      <Badge variant="outline" className="text-[9px] py-0">
                        {c.esVirtual ? "C25-30" : c.tipo.slice(0, 3).toUpperCase()}
                      </Badge>
                    </div>
                    {c.preferencial && (
                      <Badge variant="warning" className="text-[9px] py-0 w-fit">⭐ Preferencial</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="p-2 space-y-1">
                    {asigs.length === 0 ? (
                      <div className="text-[10px] text-muted-foreground italic text-center py-3">
                        Vacía
                      </div>
                    ) : (
                      asigs.sort((a: any, b: any) => a.bloque - b.bloque).map((a: any) => {
                        const persona = personaMap.get(a.personalId);
                        const cargoClass = CARGO_COLORS[(persona as any)?.cargo ?? ""] ?? "bg-gray-100 text-gray-700";
                        return (
                          <div
                            key={a.personalId + a.bloque}
                            className={`text-[10px] px-1.5 py-1 rounded ${cargoClass}`}
                          >
                            <div className="font-mono font-bold flex items-center gap-1">
                              B{a.bloque}: {a.horaInicio}-{a.horaFin}
                              {a.esT && <span className="text-[8px]">(T)</span>}
                            </div>
                            <div className="truncate font-semibold">
                              {persona ? `${(persona as any).apellidos.split(" ")[0]} ${(persona as any).nick || (persona as any).nombres.split(" ")[0]}` : "?"}
                            </div>
                            {persona && (
                              <div className="text-[9px] text-muted-foreground">{(persona as any).cargo}</div>
                            )}
                          </div>
                        );
                      })
                    )}
                    {huecos.length > 0 && (
                      <div className="text-[10px] text-yellow-700 bg-yellow-100 px-1.5 py-1 rounded">
                        ⚠️ Hueco: {huecos[0].desde}-{huecos[0].hasta}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* === TAB: Lista plana de asignados === */}
        <TabsContent value="asignados">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs">
                  <tr>
                    <th className="text-left p-2">Caja</th>
                    <th className="text-left p-2">Bloque</th>
                    <th className="text-left p-2">Hora</th>
                    <th className="text-left p-2">Cajero</th>
                    <th className="text-left p-2">Cargo</th>
                  </tr>
                </thead>
                <tbody>
                  {asignacionesPlanas.map((a: any) => (
                    <tr key={a.personalId + a.bloque + a.cajaId} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-mono">
                        {a.caja?.tipo === "autoservicio" ? (
                          <Badge className="bg-green-500 text-white text-[10px]">AUTO 25-30</Badge>
                        ) : (
                          <Badge variant="outline" className="font-mono">C{a.caja?.codigo}</Badge>
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">B{a.bloque}{a.esT ? " (T)" : ""}</td>
                      <td className="p-2 font-mono text-xs">{a.horaInicio}-{a.horaFin}</td>
                      <td className="p-2 font-semibold">{a.personaLabel}</td>
                      <td className="p-2">
                        <Badge className={CARGO_COLORS[a.persona?.cargo] ?? "bg-gray-100"} variant="secondary">
                          {a.persona?.cargo ?? "?"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {asignacionesPlanas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No hay asignaciones para este día
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === TAB: Huecos === */}
        <TabsContent value="huecos">
          <Card>
            <CardContent className="p-4">
              {!preview?.huecos?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p>No hay huecos. Todas las cajas tienen cobertura continua.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {preview.huecos.map((h: any, i: number) => {
                    const caja = cajaMap.get(h.cajaId) as any;
                    return (
                      <div key={i} className="text-sm flex items-center gap-2 p-2 bg-yellow-50 rounded">
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <span className="font-mono font-bold">Caja {caja?.codigo}:</span>
                        <span>{h.desde} → {h.hasta}</span>
                        <span className="text-muted-foreground text-xs">(sin cobertura)</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === TAB: Log === */}
        <TabsContent value="log">
          <Card>
            <CardContent className="p-0">
              <div className="text-xs space-y-1 max-h-[60vh] overflow-y-auto font-mono p-3">
                {preview?.decisiones?.map((d: any, i: number) => (
                  <div key={i} className="flex gap-2 border-b border-muted py-1">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span className="font-bold min-w-fit">{d.decision}</span>
                    <span className="text-muted-foreground">—</span>
                    <span className="flex-1">{d.detalle}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reporte semanal */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Reporte semanal de ubicaciones
          </CardTitle>
          <CardDescription>Exporta las ubicaciones de toda la semana en Excel (una hoja por día)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Select value={semanaIdReporte} onValueChange={setSemanaIdReporte}>
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
            <Button
              onClick={() => handleDescargarExcel(true)}
              disabled={!semanaIdReporte}
              variant="outline"
              size="sm"
              title="Exporta solo el día seleccionado con formato de plantilla"
            >
              <Download className="h-4 w-4 mr-2" />
              Solo {fecha}
            </Button>
            <Button
              onClick={() => handleDescargarExcel(false)}
              disabled={!semanaIdReporte}
              title="Exporta toda la semana con formato de plantilla"
            >
              <Download className="h-4 w-4 mr-2" />
              Semana completa
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
