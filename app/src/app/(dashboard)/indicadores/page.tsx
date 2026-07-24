"use client";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save, TrendingUp } from "lucide-react";
import { toISODate } from "@/lib/utils";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function IndicadoresPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true, cargo: "Cajer@" } : "skip"
  );
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const participaciones = useQuery(
    api.indicadores.getParticipaciones,
    tienda ? { tiendaId: tienda._id, fecha } : "skip"
  );
  const setP = useMutation(api.indicadores.setParticipacion);

  const map = new Map<any, any>(participaciones?.map((p: any) => [p.personalId, p]));

  const dataChart = personales?.map((p: any) => {
    const pp = map.get(p._id);
    return {
      nombre: p.nick,
      debito: pp?.debitoPct ?? 0,
      credito: pp ? Math.max(0, pp.totalPct - pp.debitoPct) : 0,
      total: pp?.totalPct ?? 0,
    };
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Indicadores Financieros SIP
          </h1>
          <p className="text-sm text-muted-foreground">% Débito, % Crédito (auto) y % Total por cajero</p>
        </div>
        <Input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-44"
        />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataChart ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nombre" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="debito" stackId="a" fill="#3b82f6" name="% Débito" />
                <Bar dataKey="credito" stackId="a" fill="#8b5cf6" name="% Crédito" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registro diario - {fecha}</CardTitle>
          <CardDescription>Ingresa % débito y % total. El crédito se calcula automático.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cajero</TableHead>
                <TableHead className="w-32">% Débito</TableHead>
                <TableHead className="w-32">% Total</TableHead>
                <TableHead className="w-32">% Crédito (auto)</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personales?.map((p: any) => {
                const pp = map.get(p._id);
                return (
                  <IndicadorFila
                    key={p._id}
                    persona={p}
                    participacion={pp}
                    fecha={fecha}
                    onSave={async (debito, total) => {
                      await setP({ fecha, personalId: p._id, debitoPct: debito, totalPct: total });
                      toast.success(`${p.nick} guardado`);
                    }}
                  />
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function IndicadorFila({ persona, participacion, fecha, onSave }: any) {
  const [debito, setDebito] = useState(participacion?.debitoPct ?? 0);
  const [total, setTotal] = useState(participacion?.totalPct ?? 0);
  const credito = Math.max(0, total - debito);
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{persona.apellidos} {persona.nombres}</div>
        <div className="text-xs text-muted-foreground">{persona.nick}</div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={debito}
          onChange={(e) => setDebito(parseFloat(e.target.value) || 0)}
          className="h-8 w-24"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={total}
          onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
          className="h-8 w-24"
        />
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{credito.toFixed(1)}%</Badge>
      </TableCell>
      <TableCell>
        <Button size="sm" onClick={() => onSave(debito, total)}>
          <Save className="h-3 w-3" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
