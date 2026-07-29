"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Power, RefreshCw } from "lucide-react";
import { useSession } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function CuentaTiendaPage() {
  const { session } = useSession();
  const jeId = session?.kind === "jefeEntrenador" ? (session as any).id : null;

  const cuentas = useQuery(
    api.passwordResetRequests.listCuentasTiendaForJE,
    jeId ? { sessionJefeEntrenadorId: jeId } : "skip",
  );

  const resetPass = useMutation(api.auth.jeResetPassword);
  const toggle = useMutation(api.auth.jeToggleCuentaTienda);

  if (session?.kind !== "jefeEntrenador") {
    return <div className="p-6 text-muted-foreground">No autorizado.</div>;
  }

  // Agrupar por tienda
  const porTienda: Record<string, any[]> = {};
  cuentas?.forEach((c: any) => {
    if (!porTienda[c.tiendaId]) porTienda[c.tiendaId] = [];
    porTienda[c.tiendaId].push(c);
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KeyRound className="h-6 w-6" />
          Cuentas de tienda
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestiona las cuentas de Caja y Gerencia de tus tiendas asignadas. Reset devuelve la contraseña a 12345678.
        </p>
      </div>

      {cuentas === undefined && <div className="text-sm text-muted-foreground">Cargando...</div>}
      {cuentas?.length === 0 && <div className="text-sm text-muted-foreground">No tienes tiendas asignadas con cuentas de tienda.</div>}

      {Object.entries(porTienda).map(([tiendaId, list]) => (
        <Card key={tiendaId}>
          <CardHeader>
            <CardTitle className="text-base">Tienda {tiendaId}</CardTitle>
            <CardDescription>{list.length} cuenta(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {list.map((c: any) => (
                <div key={c._id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {c.nombreCompleto}
                      <Badge variant={c.tipoCuenta === "Cajas" ? "default" : "secondary"}>{c.tipoCuenta}</Badge>
                      {!c.activo && <Badge variant="destructive">Inactivo</Badge>}
                      {c.mustChangePassword && <Badge variant="outline">Debe cambiar pass</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">@{c.username}</div>
                    <div className="text-xs text-muted-foreground">
                      Último login: {c.lastLoginAt ? new Date(c.lastLoginAt).toLocaleString("es-PE") : "nunca"}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const r = await resetPass({
                            sessionJefeEntrenadorId: jeId!,
                            tiendaId: c.tiendaId,
                            tipoCuenta: c.tipoCuenta,
                          });
                          toast.success(`Nueva contraseña: ${(r as any).newPassword}`, {
                            description: "Dile a la persona que la cambie al iniciar sesión.",
                            duration: 10000,
                          });
                        } catch (e: any) { toast.error(e.message); }
                      }}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" /> Reset pass
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggle({
                        sessionJefeEntrenadorId: jeId!,
                        tiendaId: c.tiendaId,
                        tipoCuenta: c.tipoCuenta,
                        activo: !c.activo,
                      }).then(() => toast.success(c.activo ? "Cuenta reactivada" : "Cuenta desactivada"))}
                    >
                      <Power className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
