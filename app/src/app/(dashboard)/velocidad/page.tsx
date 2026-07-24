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
import { Save, Gauge } from "lucide-react";
import { toISODate } from "@/lib/utils";
import { toast } from "sonner";

export default function VelocidadPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true, cargo: "Cajer@" } : "skip"
  );
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const velocidades = useQuery(
    api.indicadores.getVelocidades,
    tienda ? { tiendaId: tienda._id, fecha } : "skip"
  );
  const setV = useMutation(api.indicadores.setVelocidad);
  const map = new Map(velocidades?.map((v: any) => [v.personalId, v]));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="h-6 w-6" />
            Velocidad
          </h1>
          <p className="text-sm text-muted-foreground">Velocidad de atención por cajero/día</p>
        </div>
        <Input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-44"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registro de velocidad - {fecha}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cajero</TableHead>
                <TableHead className="w-32">Velocidad</TableHead>
                <TableHead className="w-32">Meta</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personales?.map((p: any) => {
                const v = map.get(p._id);
                return (
                  <VelocidadFila
                    key={p._id}
                    persona={p}
                    velocidad={v}
                    onSave={async (valor, meta) => {
                      await setV({ fecha, personalId: p._id, valor, meta });
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

function VelocidadFila({ persona, velocidad, onSave }: any) {
  const [valor, setValor] = useState(velocidad?.valor ?? 0);
  const [meta, setMeta] = useState(velocidad?.meta ?? 0);
  const cumple = meta > 0 && valor >= meta;
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{persona.apellidos} {persona.nombres}</div>
        <div className="text-xs text-muted-foreground">{persona.nick}</div>
      </TableCell>
      <TableCell>
        <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(parseFloat(e.target.value) || 0)} className="h-8 w-24" />
      </TableCell>
      <TableCell>
        <Input type="number" step="0.01" value={meta} onChange={(e) => setMeta(parseFloat(e.target.value) || 0)} className="h-8 w-24" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {meta > 0 && (
            <Badge variant={cumple ? "success" : "destructive"}>
              {cumple ? "✓" : "✗"}
            </Badge>
          )}
          <Button size="sm" onClick={() => onSave(valor, meta)}>
            <Save className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
