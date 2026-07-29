"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Store, Plus, Power, MapPin, Hash, Users, ChevronRight } from "lucide-react";
import { useSession } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";

export default function AdminTiendasPage() {
  const router = useRouter();
  const { session } = useSession();
  const adminId = session?.kind === "admin" ? (session as any).id : null;

  const tiendas = useQuery(api.tiendas.listTiendas, adminId ? { session: { kind: "admin", id: adminId } } : "skip");
  const jes = useQuery(api.jefesEntrenador.listAll, adminId ? { sessionAdminId: adminId } : "skip");

  const createTienda = useMutation(api.tiendas.createTiendaFull);
  const toggleActiva = useMutation(api.tiendas.toggleTiendaActiva);
  const reasignarJE = useMutation(api.tiendas.reasignarJefeEntrenador);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    codigo: "",
    direccion: "",
    nCajasRegulares: 18,
    nCajasRapidas: 6,
    nCajasSelf: 6,
    tienePersonalSelf: true,
    tienePersonalRs: true,
    jefeEntrenadorId: "",
  });
  const [creating, setCreating] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  if (session?.kind !== "admin") {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">No autorizado.</p>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!adminId) return;
    setCreating(true);
    try {
      const result = await createTienda({
        sessionAdminId: adminId,
        nombre: form.nombre,
        codigo: form.codigo.toUpperCase().replace(/\s+/g, "-"),
        direccion: form.direccion,
        nCajasRegulares: form.nCajasRegulares,
        nCajasRapidas: form.nCajasRapidas,
        nCajasSelf: form.nCajasSelf,
        tienePersonalSelf: form.tienePersonalSelf,
        tienePersonalRs: form.tienePersonalRs,
        jefeEntrenadorId: form.jefeEntrenadorId as Id<"jefesEntrenador">,
      });
      setLastResult(result);
      toast.success("Tienda creada");
      setForm({ ...form, nombre: "", codigo: "", direccion: "" });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6" />
            Tiendas
          </h1>
          <p className="text-sm text-muted-foreground">
            Crea tiendas nuevas. Se generan automáticamente las cuentas de Caja y Gerencia.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" /> Nueva tienda
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva tienda</CardTitle>
            <CardDescription>
              Las cantidades de cajas y los flags de personal son inmutables después de crear.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nombre</Label>
                  <Input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Código (sin espacios)</Label>
                  <Input
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    placeholder="PLAZAVEA-LIMA-CENTRO"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Dirección</Label>
                <Input
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Cajas regulares</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.nCajasRegulares}
                    onChange={(e) => setForm({ ...form, nCajasRegulares: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cajas rápidas</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.nCajasRapidas}
                    onChange={(e) => setForm({ ...form, nCajasRapidas: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cajas self</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.nCajasSelf}
                    onChange={(e) => setForm({ ...form, nCajasSelf: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.tienePersonalSelf}
                    onChange={(e) => setForm({ ...form, tienePersonalSelf: e.target.checked })}
                  />
                  Tiene personal Self Checkout
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.tienePersonalRs}
                    onChange={(e) => setForm({ ...form, tienePersonalRs: e.target.checked })}
                  />
                  Tiene personal RS
                </label>
              </div>
              <div className="space-y-1">
                <Label>Jefe Entrenador asignado</Label>
                <select
                  className="w-full border rounded-md p-2 bg-background"
                  value={form.jefeEntrenadorId}
                  onChange={(e) => setForm({ ...form, jefeEntrenadorId: e.target.value })}
                  required
                >
                  <option value="">Seleccionar...</option>
                  {jes?.filter((j: any) => j.activo).map((j: any) => (
                    <option key={j._id} value={j._id}>
                      {j.username} — {j.nombre} {j.apellido}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? "Creando..." : "Crear tienda"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>

            {lastResult && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm space-y-1">
                <div className="font-medium text-green-900">Tienda creada. Guarda estas credenciales:</div>
                <div>Caja: <code className="bg-white px-1">{lastResult.caja.username}</code> / <code className="bg-white px-1">12345678</code></div>
                <div>Gerencia: <code className="bg-white px-1">{lastResult.gerencia.username}</code> / <code className="bg-white px-1">12345678</code></div>
                <div className="text-xs text-muted-foreground">Ambas requieren cambio de contraseña en el primer login.</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          {tiendas === undefined && <div className="text-sm text-muted-foreground">Cargando...</div>}
          {tiendas?.length === 0 && <div className="text-sm text-muted-foreground">No hay tiendas creadas.</div>}
          <div className="space-y-2">
            {tiendas?.map((t: any) => (
              <div key={t._id} className="flex items-center justify-between p-3 border rounded">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.nombre}</span>
                    {!t.activa && <Badge variant="destructive">Desactivada</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{t.codigo}</span>
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{t.direccion}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />
                      {t.nCajasRegulares}r + {t.nCajasRapidas}ráp + {t.nCajasSelf}self
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActiva({ sessionAdminId: adminId!, id: t._id, activa: !t.activa })}
                  >
                    <Power className="h-3 w-3 mr-1" /> {t.activa ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => router.push(`/admin/tiendas/${t._id}`)}
                  >
                    Detalle <ChevronRight className="h-3 w-3 ml-1" />
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
