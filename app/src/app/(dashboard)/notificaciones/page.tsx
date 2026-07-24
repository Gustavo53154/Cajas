"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";

export default function NotificacionesPage() {
  const notifs = useQuery(api.notificaciones.listByUser);
  const markAsRead = useMutation(api.notificaciones.markAsRead);
  const markAll = useMutation(api.notificaciones.markAllAsRead);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Notificaciones
          </h1>
          <p className="text-sm text-muted-foreground">Eventos del sistema</p>
        </div>
        {notifs?.some((n: any) => !n.leida) && (
          <Button variant="outline" onClick={() => markAll().then(() => toast.success("Marcadas como leídas"))}>
            <CheckCheck className="h-4 w-4 mr-1" /> Marcar todas leídas
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {notifs?.map((n: any) => (
          <Card
            key={n._id}
            className={n.leida ? "opacity-60" : "border-primary"}
            onClick={() => !n.leida && markAsRead({ id: n._id })}
          >
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium">{n.titulo}</div>
                  <div className="text-sm text-muted-foreground">{n.mensaje}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(n.createdAt).toLocaleString("es-PE")}
                  </div>
                </div>
                {!n.leida && <Badge variant="default">Nueva</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
        {notifs?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No tienes notificaciones
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
