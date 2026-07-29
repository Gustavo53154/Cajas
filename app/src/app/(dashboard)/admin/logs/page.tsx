"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Store } from "lucide-react";
import { useSession } from "@/hooks/useAuth";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Id } from "@/convex/_generated/dataModel";

export default function AdminLogsPage() {
  const { session } = useSession();
  const adminId = session?.kind === "admin" ? (session as any).id : null;

  const tiendas = useQuery(
    api.tiendas.listTiendas,
    adminId ? { session: { kind: "admin", id: adminId } } : "skip",
  );

  const [tiendaFilter, setTiendaFilter] = useState<Id<"tiendas"> | "all">("all");

  const logs = useQuery(
    api.logs.listLogs as any,
    tiendaFilter === "all" && adminId
      ? { tiendaId: tiendas?.[0]?._id, limit: 200 }
      : tiendaFilter !== "all"
      ? { tiendaId: tiendaFilter as Id<"tiendas">, limit: 200 }
      : "skip",
  );

  if (session?.kind !== "admin") return <div className="p-6 text-muted-foreground">No autorizado.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6" />
          Logs globales
        </h1>
        <p className="text-sm text-muted-foreground">Auditoría de todas las acciones del sistema.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Label>Tienda:</Label>
            <select
              className="border rounded-md p-2 bg-background"
              value={tiendaFilter}
              onChange={(e) => setTiendaFilter(e.target.value as any)}
            >
              <option value="all">Todas (última vista)</option>
              {tiendas?.map((t: any) => (
                <option key={t._id} value={t._id}>{t.nombre}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
          <CardDescription>Mostrando los últimos 200.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs === undefined && <div className="text-sm text-muted-foreground">Cargando...</div>}
          {logs?.length === 0 && <div className="text-sm text-muted-foreground">Sin logs.</div>}
          <div className="space-y-1">
            {logs?.map((l: any) => (
              <div key={l._id} className="flex items-start gap-2 text-sm border-b py-2">
                <Badge variant={l.accion === "eliminar" ? "destructive" : l.accion === "crear" ? "default" : "secondary"}>
                  {l.accion}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs">
                    {l.entidad} · {l.entidadId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.usuarioNombre} · {new Date(l.createdAt).toLocaleString("es-PE")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
