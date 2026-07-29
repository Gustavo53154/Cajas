"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useSession, type Session } from "@/hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useSession();
  const signInAction = useMutation(api.auth.signIn);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Modal de solicitud de reseteo
  const [showReset, setShowReset] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetMotivo, setResetMotivo] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Mutation PÚBLICA para solicitar reseteo sin estar logueado
  const createSolicitudPublic = useMutation(api.auth.createSolicitudResetPublic);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await signInAction({ username, password });
      const session: Session =
        r.kind === "admin"
          ? { kind: "admin", id: (r as any).id }
          : r.kind === "jefeEntrenador"
          ? { kind: "jefeEntrenador", id: (r as any).id }
          : {
              kind: "user",
              id: (r as any).id,
              tiendaId: (r as any).tiendaId,
              tipoCuenta: (r as any).tipoCuenta,
            };
      setSession(session);
      toast.success("Sesión iniciada");
      router.push("/");
    } catch (err: any) {
      toast.error(err?.message ?? "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function handleSolicitar(e: React.FormEvent) {
    e.preventDefault();
    setResetLoading(true);
    try {
      await createSolicitudPublic({ username: resetUsername, motivo: resetMotivo || undefined });
      toast.success("Solicitud enviada. Tu JE la revisará y tu contraseña volverá a 12345678.");
      setShowReset(false);
      setResetUsername("");
      setResetMotivo("");
    } catch (err: any) {
      toast.error(err?.message ?? "Error al enviar solicitud");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
              PV
            </div>
            <div>
              <CardTitle>DreamTeam Cajas</CardTitle>
              <CardDescription>Plaza Vea - Supervisión de Cajas</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!showReset ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="caja-plazavea-default"
                  required
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Ingresando..." : "Iniciar sesión"}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                onClick={() => setShowReset(true)}
              >
                ¿Eres cuenta de Caja o Gerencia? Solicita reset de contraseña
              </button>
            </form>
          ) : (
            <form onSubmit={handleSolicitar} className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Ingresa tu username. Se creará una solicitud que tu JE debe aceptar.
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Motivo (opcional)</Label>
                <Input value={resetMotivo} onChange={(e) => setResetMotivo(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={resetLoading}>
                {resetLoading ? "Enviando..." : "Enviar solicitud"}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                onClick={() => setShowReset(false)}
              >
                Volver al login
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
