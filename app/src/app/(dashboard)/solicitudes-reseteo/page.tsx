"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox, Check, X, Copy } from "lucide-react";
import { useSession } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function SolicitudesReseteoPage() {
  const { session } = useSession();
  const jeId = session?.kind === "jefeEntrenador" ? (session as any).id : null;

  const solicitudes = useQuery(
    api.passwordResetRequests.listForJE,
    jeId ? { sessionJefeEntrenadorId: jeId } : "skip",
  );

  const atender = useMutation(api.auth.atenderSolicitudReset);

  const [filtro, setFiltro] = useState<"pendiente" | "aceptada" | "rechazada" | "all">("pendiente");
  const [rechazoModal, setRechazoModal] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");

  if (session?.kind !== "jefeEntrenador") {
    return <div className="p-6 text-muted-foreground">No autorizado.</div>;
  }

  const filtradas = solicitudes?.filter((s: any) => filtro === "all" || s.estado === filtro) ?? [];

  async function handleAceptar(id: any) {
    if (!jeId) return;
    try {
      const r = await atender({ solicitudId: id, accion: "aceptar", sessionJefeEntrenadorId: jeId });
      await navigator.clipboard.writeText((r as any).newPassword);
      toast.success(`Aceptada. Contraseña copiada: ${(r as any).newPassword}`, { duration: 12000 });
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleRechazar() {
    if (!jeId || !rechazoModal) return;
    try {
      await atender({
        solicitudId: rechazoModal as any,
        accion: "rechazar",
        motivoRechazo: motivoRechazo || undefined,
        sessionJefeEntrenadorId: jeId,
      });
      toast.success("Solicitud rechazada");
      setRechazoModal(null);
      setMotivoRechazo("");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="h-6 w-6" />
          Solicitudes de reseteo
        </h1>
        <p className="text-sm text-muted-foreground">
          Bandeja de solicitudes de tus tiendas asignadas. Al aceptar, la contraseña vuelve a 12345678.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {(["pendiente", "aceptada", "rechazada", "all"] as const).map((f) => (
          <Button
            key={f}
            variant={filtro === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFiltro(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      {solicitudes === undefined && <div className="text-sm text-muted-foreground">Cargando...</div>}
      {filtradas.length === 0 && <div className="text-sm text-muted-foreground">Sin solicitudes en este estado.</div>}

      <div className="space-y-2">
        {filtradas.map((s: any) => (
          <Card key={s._id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {s.usernameSnapshot}
                    <Badge variant={s.tipoSolicitante === "Cajas" ? "default" : "secondary"}>{s.tipoSolicitante}</Badge>
                    <Badge variant={s.estado === "pendiente" ? "destructive" : s.estado === "aceptada" ? "default" : "outline"}>
                      {s.estado}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(s.createdAt).toLocaleString("es-PE")}
                  </div>
                  {s.motivo && (
                    <div className="text-sm mt-2 p-2 bg-muted/50 rounded">"{s.motivo}"</div>
                  )}
                  {s.motivoRechazo && (
                    <div className="text-sm mt-2 p-2 bg-red-50 border border-red-200 rounded">
                      Rechazo: {s.motivoRechazo}
                    </div>
                  )}
                </div>
                {s.estado === "pendiente" && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleAceptar(s._id)}>
                      <Check className="h-3 w-3 mr-1" /> Aceptar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRechazoModal(s._id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {rechazoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Rechazar solicitud</CardTitle>
              <CardDescription>Indica el motivo (opcional).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="w-full border rounded-md p-2 bg-background min-h-[80px]"
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Motivo..."
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setRechazoModal(null); setMotivoRechazo(""); }}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleRechazar}>
                  Confirmar rechazo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
