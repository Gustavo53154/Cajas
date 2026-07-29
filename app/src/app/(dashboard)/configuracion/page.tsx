"use client";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Key, Building2, User, ShieldAlert } from "lucide-react";
import { useSession, useCurrentSession, useCan, useEffectiveTiendaId } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function ConfiguracionPage() {
  const { session } = useSession();
  const { session: current } = useCurrentSession();
  const can = useCan();
  const tiendaId = useEffectiveTiendaId();

  const tienda = useQuery(api.tiendas.getTienda, tiendaId ?? undefined);
  const cajas = useQuery(
    api.cajas.listCajas,
    tiendaId ? { tiendaId } : "skip",
  );
  const personales = useQuery(
    api.personales.list,
    tiendaId ? { tiendaId, soloActivos: true } : "skip",
  );

  const changePass = useMutation(api.auth.changePassword);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  if (!session) return null;

  const isCajaGerencia = session.kind === "user";
  const isGerencia = isCajaGerencia && session.tipoCuenta === "Gerencia";

  async function handleChangePassword() {
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
        session: session as any,
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

  const userLabel = (() => {
    if (current?.kind === "admin") {
      return `${current.admin.nombre} ${current.admin.apellido}`.trim() || current.admin.username;
    }
    if (current?.kind === "jefeEntrenador") {
      return `${current.jefeEntrenador.nombre} ${current.jefeEntrenador.apellido}`.trim() || current.jefeEntrenador.username;
    }
    if (current?.kind === "user") {
      return current.profile.nombreCompleto;
    }
    return "Usuario";
  })();

  const userSubLabel = (() => {
    if (current?.kind === "admin") return `Admin · @${current.admin.username}`;
    if (current?.kind === "jefeEntrenador") return `JefeEntrenador · @${current.jefeEntrenador.username}`;
    if (current?.kind === "user") {
      return `${current.profile.tipoCuenta} · @${current.profile.username}`;
    }
    return "...";
  })();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Configuración
        </h1>
        <p className="text-sm text-muted-foreground">Tu cuenta y datos de la tienda.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" /> Mi cuenta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Nombre:</span> {userLabel}</div>
          <div><span className="text-muted-foreground">Identificador:</span> <span className="font-mono">{userSubLabel}</span></div>
        </CardContent>
      </Card>

      {/* Cambio de contraseña: Admin y JE sí, Caja/Gerencia NO */}
      {!isCajaGerencia && (
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
      )}

      {/* Caja/Gerencia: solo mensaje informativo */}
      {isCajaGerencia && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Cambio de contraseña
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {isGerencia
                ? "Las cuentas de Gerencia no pueden cambiar su contraseña. Si la olvidaste, usa 'Olvidé mi contraseña' en la pantalla de login para enviar una solicitud al JE."
                : "Las cuentas de Caja no pueden cambiar su contraseña. Si la olvidaste, usa 'Olvidé mi contraseña' en la pantalla de login para enviar una solicitud al JE."}
            </div>
          </CardContent>
        </Card>
      )}

      {tienda && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Tienda
            </CardTitle>
            <CardDescription>
              {can.canEditTiendaBasic
                ? "Puedes editar nombre y dirección. Las cantidades de cajas y flags no se pueden modificar."
                : "Datos informativos (solo el Admin/JE puede editarlos)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Nombre:</span> {tienda.nombre}</div>
            <div><span className="text-muted-foreground">Código:</span> {tienda.codigo}</div>
            <div><span className="text-muted-foreground">Dirección:</span> {tienda.direccion}</div>
            <div><span className="text-muted-foreground">Cajas:</span> {tienda.nCajasRegulares}r + {tienda.nCajasRapidas}ráp + {tienda.nCajasSelf}self = {(cajas ?? []).length}</div>
            <div><span className="text-muted-foreground">Tiene personal Self:</span> {tienda.tienePersonalSelf ? "Sí" : "No"}</div>
            <div><span className="text-muted-foreground">Tiene personal RS:</span> {tienda.tienePersonalRs ? "Sí" : "No"}</div>
            <div><span className="text-muted-foreground">Personal activo:</span> {(personales ?? []).length}</div>
            <div className="pt-2 flex items-center gap-2">
              {tienda.activa ? <Badge>Activa</Badge> : <Badge variant="destructive">Desactivada</Badge>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
