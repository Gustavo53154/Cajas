"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ReadOnlyBanner } from "@/components/ReadOnlyBanner";
import { useCurrentSession, useTiendaActiva, useEffectiveTiendaId } from "@/hooks/useAuth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { rawSession, isLoading, session } = useCurrentSession();
  const { tiendaActivaId, setTiendaActiva } = useTiendaActiva();
  const effectiveTiendaId = useEffectiveTiendaId();

  useEffect(() => {
    if (isLoading) return;
    if (!rawSession) {
      router.push("/login");
      return;
    }
    // Primer login: forzar cambio de pass
    if (rawSession.kind === "user" && (session as any)?.profile?.mustChangePassword) {
      if (pathname !== "/cambiar-password-inicial") {
        router.push("/cambiar-password-inicial");
        return;
      }
    }
    if (rawSession.kind === "jefeEntrenador" && (session as any)?.jefeEntrenador?.mustChangePassword) {
      if (pathname !== "/cambiar-password-inicial") {
        router.push("/cambiar-password-inicial");
        return;
      }
    }
    // Admin/JE sin tienda activa
    if (
      (rawSession.kind === "admin" || rawSession.kind === "jefeEntrenador") &&
      !effectiveTiendaId
    ) {
      if (pathname !== "/seleccionar-tienda") {
        router.push("/seleccionar-tienda");
      }
    }
  }, [isLoading, rawSession, session, pathname, router, effectiveTiendaId]);

  if (isLoading || !rawSession) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  // Pantallas de cambio de pass y selección de tienda sin sidebar
  if (pathname === "/cambiar-password-inicial" || pathname === "/seleccionar-tienda") {
    return <main className="min-h-screen bg-muted/30">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar
        session={rawSession}
        tiendaActivaId={effectiveTiendaId}
        onTiendaChange={(id) => setTiendaActiva(id)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <ReadOnlyBanner />
        <main className="flex-1 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
