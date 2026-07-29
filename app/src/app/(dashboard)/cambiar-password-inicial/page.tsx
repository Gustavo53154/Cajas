"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, ShieldAlert } from "lucide-react";
import { useSession, useCurrentSession, type Session } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function CambiarPasswordInicialPage() {
  const router = useRouter();
  const { session, setSession } = useSession();
  const { session: current } = useCurrentSession();
  const changePassword = useMutation(api.auth.changePassword);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);

  if (!session) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (newPass.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPass !== confirmPass) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (newPass === "12345678") {
      toast.error("La nueva contraseña no puede ser 12345678");
      return;
    }
    if (newPass === currentPass) {
      toast.error("La nueva contraseña debe ser distinta a la actual");
      return;
    }
    setLoading(true);
    try {
      await changePassword({
        session: session as any,
        currentPassword: currentPass,
        newPassword: newPass,
      });
      // Actualizar el session en localStorage para que mustChangePassword quede en false
      if (session.kind === "user") {
        setSession({ ...session } as any);
      }
      toast.success("Contraseña actualizada");
      if (session.kind === "admin" || session.kind === "jefeEntrenador") {
        router.push("/seleccionar-tienda");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Error al cambiar contraseña");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-amber-500 flex items-center justify-center text-white">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Cambio de contraseña obligatorio</CardTitle>
              <CardDescription>Es tu primer inicio de sesión</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Por seguridad, debes cambiar la contraseña temporal <code className="bg-amber-100 px-1 rounded">12345678</code> antes de continuar.
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label>Contraseña actual (12345678)</Label>
              <Input
                type="password"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Nueva contraseña</Label>
              <Input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres, no puede ser 12345678.</p>
            </div>
            <div className="space-y-1">
              <Label>Confirmar nueva contraseña</Label>
              <Input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Guardando..." : "Cambiar contraseña y continuar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
