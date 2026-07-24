"use client";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Key, Building2, User } from "lucide-react";
import { useAuth, useCurrentUser } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function ConfiguracionPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const cajas = useQuery(api.cajas.listCajas, tienda ? { tiendaId: tienda._id } : "skip");
  const personales = useQuery(api.personales.list, tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip");
  const { user, profile } = useCurrentUser();
  const changePass = useMutation(api.auth.changePassword);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  async function handleChangePassword() {
    if (!user) return;
    if (newPass.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPass !== confirmPass) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    try {
      await changePass({
        userId: user._id,
        currentPassword: currentPass,
        newPassword: newPass,
      });
      toast.success("Contraseña actualizada");
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Configuración
        </h1>
        <p className="text-sm text-muted-foreground">Tu cuenta, tienda y preferencias</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" /> Mi cuenta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Email:</span> <span className="font-mono">{user?.email}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Nombre:</span> {profile?.nombreCompleto}
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Rol:</span>{" "}
            <Badge>{profile?.rol}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" /> Cambiar contraseña
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-md">
          <div>
            <Label>Contraseña actual</Label>
            <Input type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} />
          </div>
          <div>
            <Label>Nueva contraseña</Label>
            <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          </div>
          <div>
            <Label>Confirmar nueva contraseña</Label>
            <Input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
          </div>
          <Button onClick={handleChangePassword}>Cambiar contraseña</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Tienda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Nombre:</span> {tienda?.nombre}</div>
          <div><span className="text-muted-foreground">Código:</span> {tienda?.codigo}</div>
          <div><span className="text-muted-foreground">Cajas:</span> {cajas?.length ?? 0}</div>
          <div><span className="text-muted-foreground">Personal activo:</span> {personales?.length ?? 0}</div>
        </CardContent>
      </Card>
    </div>
  );
}
