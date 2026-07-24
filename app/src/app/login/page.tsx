"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { setUserId } = useAuth();
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const signInAction = useMutation(api.auth.signIn);
  const signUpAction = useMutation(api.auth.signUp);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setLoading(true);
    try {
      const { userId } = await signInAction({ email, password });
      setUserId(userId as any);
      toast.success("Sesión iniciada");
      router.push("/");
    } catch (err: any) {
      toast.error(err?.message ?? "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (!nombre.trim()) {
      toast.error("Ingresa tu nombre completo");
      return;
    }
    if (!tienda) {
      toast.error("Tienda no configurada. Ejecuta: npx tsx scripts/seed.ts");
      return;
    }
    setLoading(true);
    try {
      const { userId } = await signUpAction({
        email,
        password,
        nombreCompleto: nombre,
        tiendaId: tienda._id,
        rol: "Supervisor",
      });
      setUserId(userId as any);
      toast.success("Cuenta creada");
      router.push("/");
    } catch (err: any) {
      toast.error(err?.message ?? "Error al crear cuenta");
    } finally {
      setLoading(false);
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
          <form onSubmit={mode === "signIn" ? handleSignIn : handleSignUp} className="space-y-4">
            {mode === "signUp" && (
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre completo</Label>
                <Input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  required={mode === "signUp"}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="supervisor@plazavea.com.pe"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || (mode === "signUp" && !tienda)}>
              {loading ? "Procesando..." : mode === "signIn" ? "Iniciar sesión" : "Crear cuenta"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
              onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
            >
              {mode === "signIn" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Iniciar sesión"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
