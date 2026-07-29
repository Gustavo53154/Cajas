"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Plus, Power } from "lucide-react";
import { useSession } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function AdminAdminsPage() {
  const { session } = useSession();
  const adminId = session?.kind === "admin" ? (session as any).id : null;
  const admins = useQuery(api.admins.list, adminId ? { sessionAdminId: adminId } : "skip");
  const createAdmin = useMutation(api.auth.createAdmin);
  const updateAdmin = useMutation(api.admins.update);
  const resetPass = useMutation(api.auth.adminResetPassword);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", nombre: "", apellido: "", password: "" });

  if (session?.kind !== "admin") return <div className="p-6 text-muted-foreground">No autorizado.</div>;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!adminId) return;
    try {
      await createAdmin({
        sessionAdminId: adminId,
        username: form.username,
        nombre: form.nombre,
        apellido: form.apellido,
        password: form.password,
      });
      toast.success("Admin creado");
      setForm({ username: "", nombre: "", apellido: "", password: "" });
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Admins
          </h1>
          <p className="text-sm text-muted-foreground">Solo otro Admin puede crear nuevos Admins.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo Admin
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo Admin</CardTitle>
            <CardDescription>Contraseña definida al crear (no se fuerza cambio en primer login).</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Username</Label>
                  <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label>Nombre</Label>
                  <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label>Apellido</Label>
                  <Input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label>Contraseña (mín 8)</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">Crear Admin</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Listado</CardTitle></CardHeader>
        <CardContent>
          {admins === undefined && <div className="text-sm text-muted-foreground">Cargando...</div>}
          <div className="space-y-2">
            {admins?.map((a: any) => (
              <div key={a._id} className="flex items-center justify-between p-3 border rounded">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {a.nombre} {a.apellido}
                    {!a.activo && <Badge variant="destructive">Inactivo</Badge>}
                    {a._id === adminId && <Badge>Yo</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">@{a.username}</div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={a._id === adminId}
                    onClick={() => updateAdmin({ sessionAdminId: adminId!, id: a._id, activo: !a.activo })}
                  >
                    <Power className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={a._id === adminId}
                    onClick={async () => {
                      const np = prompt("Nueva contraseña:");
                      if (!np) return;
                      try {
                        await resetPass({
                          targetKind: "admin",
                          targetId: a._id,
                          newPassword: np,
                          sessionAdminId: adminId!,
                        });
                        toast.success("Contraseña actualizada");
                      } catch (e: any) { toast.error(e.message); }
                    }}
                  >
                    Reset pass
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
