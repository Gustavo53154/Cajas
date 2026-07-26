"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save, Ticket, Trophy, ImageIcon } from "lucide-react";
import { toISODate } from "@/lib/utils";
import { toast } from "sonner";

export default function TinkasPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const tinkas = useQuery(
    api.indicadores.getTinkas,
    tienda ? { tiendaId: tienda._id, fecha } : "skip"
  );
  const setT = useMutation(api.indicadores.setTinka);
  const map = new Map<any, any>(tinkas?.map((t: any) => [t.personalId, t]));

  const ranking = personales
    ?.map((p: any) => ({ ...p, cantidad: map.get(p._id)?.cantidad ?? 0 }))
    .filter((p: any) => p.cantidad > 0)
    .sort((a: any, b: any) => b.cantidad - a.cantidad)
    .slice(0, 5);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ticket className="h-6 w-6" />
            Tinkas
          </h1>
          <p className="text-sm text-muted-foreground">Cantidad de tinkas vendidas por cajero/día</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/tinkas/imagen">
              <ImageIcon className="h-4 w-4 mr-2" /> Desde imagen
            </Link>
          </Button>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      {ranking && ranking.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-yellow-500" /> Top 5 del día</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {ranking.map((p: any, i: number) => (
                <div key={p._id} className="flex items-center gap-3 text-sm">
                  <Badge variant={i === 0 ? "warning" : "secondary"}>#{i + 1}</Badge>
                  <span className="font-medium flex-1">{p.apellidos} {p.nombres}</span>
                  <Badge>{p.cantidad} tinkas</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registro del día - {fecha}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cajero</TableHead>
                <TableHead className="w-32">Tinkas</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personales?.map((p: any) => {
                const t = map.get(p._id);
                return (
                  <TinkaFila
                    key={p._id}
                    persona={p}
                    cantidad={t?.cantidad ?? 0}
                    onSave={async (cant) => {
                      await setT({ fecha, personalId: p._id, cantidad: cant });
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

function TinkaFila({ persona, cantidad, onSave }: any) {
  const [cant, setCant] = useState(cantidad);
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{persona.apellidos} {persona.nombres}</div>
        <div className="text-xs text-muted-foreground">{persona.cargo} · {persona.nick}</div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          step="1"
          value={cant}
          onChange={(e) => setCant(parseInt(e.target.value) || 0)}
          className="h-8 w-24"
        />
      </TableCell>
      <TableCell>
        <Button size="sm" onClick={() => onSave(cant)}>
          <Save className="h-3 w-3" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
