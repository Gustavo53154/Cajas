"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Plus, Power, Trash2, Move, Store, ChevronRight } from "lucide-react";
import { useSession } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

export default function AdminJefesEntrenadorPage() {
  const { session } = useSession();
  const adminId = session?.kind === "admin" ? (session as any).id : null;

  const jes = useQuery(api.jefesEntrenador.listWithCount, adminId ? { sessionAdminId: adminId } : "skip");
  const tiendas = useQuery(
    api.tiendas.listTiendas,
    adminId ? { session: { kind: "admin", id: adminId } } : "skip",
  );

  const createJE = useMutation(api.auth.createJefeEntrenador);
  const updateJE = useMutation(api.auth.updateJefeEntrenador);
  const reasignar = useMutation(api.tiendas.reasignarJefeEntrenador);
  const resetPass = useMutation(api.auth.adminResetPassword);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", nombre: "", apellido: "" });
  const [lastCreated, setLastCreated] = useState<{ username: string; password: string } | null>(null);
  const [dragOver, setDragOver] = useState<Id<"jefesEntrenador"> | null>(null);

  if (session?.kind !== "admin") {
    return <div className="p-6 text-muted-foreground">No autorizado.</div>;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!adminId) return;
    try {
      const r = await createJE({
        sessionAdminId: adminId,
        username: form.username,
        nombre: form.nombre,
        apellido: form.apellido,
      });
      setLastCreated({ username: r.id ? form.username : "", password: r.defaultPassword });
      setLastCreated({ username: form.username, password: r.defaultPassword });
      toast.success("JE creado");
      setForm({ username: "", nombre: "", apellido: "" });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  function handleDrop(tiendaId: Id<"tiendas">, nuevoJE: Id<"jefesEntrenador">) {
    if (!adminId) return;
    reasignar({
      sessionAdminId: adminId,
      tiendaId,
      nuevoJefeEntrenadorId: nuevoJE,
    })
      .then(() => toast.success("Tienda reasignada"))
      .catch((e) => toast.error(e.message));
    setDragOver(null);
  }

  const tiendasPorJE: Record<string, any[]> = {};
  tiendas?.forEach((t: any) => {
    if (!tiendasPorJE[t.jefeEntrenadorId]) tiendasPorJE[t.jefeEntrenadorId] = [];
    tiendasPorJE[t.jefeEntrenadorId].push(t);
  });
  const tiendasSinAsignar: any[] = []; // (1 tienda → 1 JE, así que "sin asignar" son las de JEs desactivados)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Jefes Entrenador
          </h1>
          <p className="text-sm text-muted-foreground">
            Arrastra una tienda a la columna de otro JE para reasignar. Cada tienda tiene exactamente 1 JE.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo JE
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo JE</CardTitle>
            <CardDescription>Username único global. Contraseña inicial: 12345678 (debe cambiarla en el primer login).</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
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
              </div>
              <div className="flex gap-2">
                <Button type="submit">Crear JE</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </form>
            {lastCreated && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
                <div className="font-medium text-green-900">JE creado. Comparte estas credenciales:</div>
                <div>Username: <code className="bg-white px-1">{lastCreated.username}</code></div>
                <div>Contraseña inicial: <code className="bg-white px-1">{lastCreated.password}</code></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {jes === undefined && <div className="text-sm text-muted-foreground">Cargando...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {jes?.map((je: any) => (
          <Card
            key={je._id}
            className={dragOver === je._id ? "ring-2 ring-primary" : ""}
            onDragOver={(e) => { e.preventDefault(); setDragOver(je._id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              const tiendaId = e.dataTransfer.getData("text/plain") as Id<"tiendas">;
              if (tiendaId) handleDrop(tiendaId, je._id);
            }}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{je.nombre} {je.apellido}</CardTitle>
                {!je.activo && <Badge variant="destructive">Inactivo</Badge>}
              </div>
              <CardDescription>
                <code className="text-xs">@{je.username}</code> · {je.nTiendas} tienda(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1 min-h-[40px]">
                {(tiendasPorJE[je._id] ?? []).map((t: any) => (
                  <div
                    key={t._id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t._id)}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2">
                      <Store className="h-3 w-3" />
                      <span>{t.nombre}</span>
                    </div>
                    <Move className="h-3 w-3 text-muted-foreground" />
                  </div>
                ))}
                {(tiendasPorJE[je._id] ?? []).length === 0 && (
                  <div className="text-xs text-muted-foreground italic">Sin tiendas asignadas</div>
                )}
              </div>
              <div className="flex gap-1 pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateJE({ sessionAdminId: adminId!, id: je._id, activo: !je.activo })}
                  disabled={je.activo && je.nTiendas > 0}
                  title={je.activo && je.nTiendas > 0 ? "Reasigna las tiendas antes" : ""}
                >
                  <Power className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const r = await resetPass({
                        targetKind: "jefeEntrenador",
                        targetId: je._id,
                        sessionAdminId: adminId!,
                      });
                      toast.success(`Nueva contraseña: ${(r as any).newPassword}`);
                    } catch (e: any) { toast.error(e.message); }
                  }}
                >
                  Reset pass
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
