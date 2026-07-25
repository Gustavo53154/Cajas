"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History } from "lucide-react";

export default function LogsPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const [entidad, setEntidad] = useState<string>("all");
  const log = useQuery(
    api.logs.listLogs,
    tienda ? { tiendaId: tienda._id, entidad: entidad === "all" ? undefined : entidad, limit: 200 } : "skip"
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6" />
            Logs
          </h1>
          <p className="text-sm text-muted-foreground">Historial de cambios en el sistema</p>
        </div>
        <Select value={entidad} onValueChange={setEntidad}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las entidades</SelectItem>
            <SelectItem value="personales">Personales</SelectItem>
            <SelectItem value="horarios">Horarios</SelectItem>
            <SelectItem value="horarios_masivo">Horarios (masivo)</SelectItem>
            <SelectItem value="semanas">Semanas</SelectItem>
            <SelectItem value="inducciones">Inducciones</SelectItem>
            <SelectItem value="reuniones">Reuniones</SelectItem>
            <SelectItem value="plantillasEvaluacion">Plantillas Evaluación</SelectItem>
            <SelectItem value="asignacionesCaja">Asignaciones Caja</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Cambio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log?.map((l: any) => (
                <TableRow key={l._id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(l.createdAt).toLocaleString("es-PE")}
                  </TableCell>
                  <TableCell className="text-xs">{l.usuarioNombre}</TableCell>
                  <TableCell>
                    <Badge variant={l.accion === "crear" ? "success" : l.accion === "eliminar" ? "destructive" : "secondary"}>
                      {l.accion}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{l.entidad}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{l.entidadId.slice(-8)}</TableCell>
                  <TableCell className="text-xs">
                    {l.despues && (
                      <pre className="font-mono text-[10px] bg-muted/50 p-1 rounded max-w-md overflow-x-auto">
                        {JSON.stringify(l.despues, null, 2).slice(0, 200)}
                      </pre>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {log?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    Sin actividad registrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
