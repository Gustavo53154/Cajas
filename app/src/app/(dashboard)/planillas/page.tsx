"use client";
import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { toISODate } from "@/lib/utils";

export default function PlanillasPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const planilla = useQuery(
    api.planillas.getPlanillaDia,
    tienda ? { tiendaId: tienda._id, fecha } : "skip"
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Planillas de Entradas/Salidas</h1>
          <p className="text-sm text-muted-foreground">
            Mapa por bloques de 15 min (06:00 - 24:00) · Las columnas se expanden según la cantidad de personal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-44"
          />
          <Button variant="outline" onClick={() => setFecha(toISODate(new Date()))}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!planilla ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay horario registrado para esta semana
          </CardContent>
        </Card>
      ) : (
        <Planilla planilla={planilla} />
      )}
    </div>
  );
}

const CARGOS_COLORS: Record<string, string> = {
  "Cajer@": "bg-red-500 text-white",
  "Self Checkout": "bg-yellow-400 text-black",
  "RS": "bg-blue-400 text-white",
  "Ecommerce": "bg-purple-400 text-white",
  "Supervisor(@)": "bg-green-500 text-white",
  "JefeCajas": "bg-orange-500 text-white",
};

function Planilla({ planilla }: any) {
  // Calcular columnas dinámicas: máximo de personas en cualquier slot
  const maxColsE = useMemo(() => {
    let m = 0;
    for (const arr of planilla.entradas) {
      if (arr.length > m) m = arr.length;
    }
    return Math.max(m, 1);
  }, [planilla]);
  const maxColsS = useMemo(() => {
    let m = 0;
    for (const arr of planilla.salidas) {
      if (arr.length > m) m = arr.length;
    }
    return Math.max(m, 1);
  }, [planilla]);
  const totalCols = 1 + maxColsE + 1 + maxColsS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Entradas (izquierda) · Salidas (derecha)
          <Badge variant="secondary" className="text-[10px]">
            {maxColsE} entradas + {maxColsS} salidas por slot
          </Badge>
        </CardTitle>
        <CardDescription>
          Cada fila = bloque de 15 min. Color = cargo. La columna # indica cuántos están presentes en ese momento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3 text-xs flex-wrap">
          {Object.entries(CARGOS_COLORS).map(([cargo, color]) => (
            <Badge key={cargo} className={color}>
              {cargo}
            </Badge>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: "100%" }}>
            <thead>
              <tr>
                <th className="border p-1 bg-muted w-16 sticky left-0 z-10">Hora</th>
                <th className="border p-1 bg-red-50" colSpan={maxColsE}>
                  Entradas
                </th>
                <th className="border p-1 bg-muted w-12 text-center">#</th>
                <th className="border p-1 bg-blue-50" colSpan={maxColsS}>
                  Salidas
                </th>
              </tr>
            </thead>
            <tbody>
              {planilla.intervalos.map((hora: string, i: number) => {
                const presentes = planilla.conteoPresentes[i] || 0;
                return (
                  <tr key={i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                    <td className="border p-1 font-mono text-center font-semibold bg-background sticky left-0">
                      {hora}
                    </td>
                    {/* Entradas: renderizar según maxColsE */}
                    {Array.from({ length: maxColsE }).map((_, j) => {
                      const e = planilla.entradas[i][j];
                      return (
                        <td key={`e${j}`} className="border p-1 min-w-[110px]">
                          {e && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap inline-block ${CARGOS_COLORS[e.cargo] ?? "bg-gray-300"}`}
                              title={`${e.nombre} - ${e.cargo}`}
                            >
                              {e.nombre}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border p-1 text-center font-mono font-bold bg-muted/30">
                      {presentes || ""}
                    </td>
                    {/* Salidas: renderizar según maxColsS */}
                    {Array.from({ length: maxColsS }).map((_, j) => {
                      const s = planilla.salidas[i][j];
                      return (
                        <td key={`s${j}`} className="border p-1 min-w-[110px]">
                          {s && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap inline-block ${CARGOS_COLORS[s.cargo] ?? "bg-gray-300"}`}
                              title={`${s.nombre} - ${s.cargo}`}
                            >
                              {s.nombre}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
