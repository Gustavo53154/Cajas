"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, ChevronRight } from "lucide-react";
import { useSession, useTiendaActiva, useCurrentSession } from "@/hooks/useAuth";
import { Id } from "@/convex/_generated/dataModel";

export default function SeleccionarTiendaPage() {
  const router = useRouter();
  const { session, signOut, isLoading } = useSession();
  const { setTiendaActiva } = useTiendaActiva();
  const { session: current } = useCurrentSession();

  const tiendasAdmin = useQuery(
    api.tiendas.listTiendas,
    session?.kind === "admin" ? { session: { kind: "admin", id: (session as any).id } } : "skip",
  );
  const tiendasJE = useQuery(
    api.tiendas.listTiendas as any,
    session?.kind === "jefeEntrenador" ? { session: { kind: "jefeEntrenador", id: (session as any).id } } : "skip",
  );

  const tiendas = session?.kind === "admin" ? tiendasAdmin : session?.kind === "jefeEntrenador" ? tiendasJE : null;

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.push("/login");
    }
  }, [isLoading, session, router]);

  if (!session) return null;

  const isAdmin = session.kind === "admin";
  const role = isAdmin ? "Admin" : "JefeEntrenador";

  function pick(id: Id<"tiendas">) {
    setTiendaActiva(id);
    router.push("/");
  }

  if (session.kind === "user") {
    // Caja/Gerencia: no debería estar aquí
    router.push("/");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Selecciona una tienda</CardTitle>
              <CardDescription>
                {isAdmin
                  ? "Como Admin puedes operar sobre cualquier tienda."
                  : "Estas son las tiendas que tienes asignadas."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {tiendas === undefined && <div className="text-sm text-muted-foreground">Cargando...</div>}
          {tiendas?.length === 0 && (
            <div className="text-sm text-muted-foreground p-3 border rounded">
              No hay tiendas disponibles. {isAdmin && "Crea una desde /admin/tiendas."}
            </div>
          )}
          {tiendas?.map((t: any) => (
            <button
              key={t._id}
              onClick={() => pick(t._id)}
              className="w-full flex items-center justify-between p-3 rounded-md border hover:bg-accent transition-colors text-left"
            >
              <div>
                <div className="font-medium">{t.nombre}</div>
                <div className="text-xs text-muted-foreground">{t.codigo} · {t.direccion}</div>
                {!t.activa && <div className="text-xs text-amber-600">Desactivada</div>}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          <div className="pt-3 border-t flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Sesión: {role}</div>
            <Button variant="outline" size="sm" onClick={() => { signOut(); router.push("/login"); }}>
              Cerrar sesión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
