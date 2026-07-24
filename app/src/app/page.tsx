"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useAuth";

export default function HomePage() {
  const router = useRouter();
  const { user, profile, isLoading } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Bienvenido a DreamTeam Cajas</h1>
        <p className="text-muted-foreground mt-1">
          Hola {profile?.nombreCompleto ?? user.email} — Plataforma de gestión del área de cajas - Plaza Vea
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { href: "/tablero", label: "Tablero en vivo", desc: "Vista en tiempo real del personal y cajas" },
          { href: "/personal", label: "Personal", desc: "CRUD de cajeros con nick y configuración" },
          { href: "/horarios", label: "Horarios", desc: "Horario semanal con pegado masivo" },
          { href: "/planillas", label: "Planillas ES", desc: "Mapa de entradas/salidas por bloques" },
          { href: "/cajas", label: "Asignar Cajas", desc: "Algoritmo de 30 cajas en cascada" },
          { href: "/indicadores", label: "Indicadores SIP", desc: "Débito, crédito y total" },
          { href: "/velocidad", label: "Velocidad", desc: "Velocidad diaria por cajero" },
          { href: "/tinkas", label: "Tinkas", desc: "Cantidad de tinkas vendidas por día" },
          { href: "/evaluaciones", label: "Evaluaciones", desc: "Plantillas y notas por cajero" },
          { href: "/inducciones", label: "Inducciones", desc: "Programar y marcar recibidos" },
          { href: "/reuniones", label: "Reuniones", desc: "Con 1, varios o todo el área" },
          { href: "/tareas", label: "Tareas del área", desc: "Recurrentes y del momento" },
        ].map((m) => (
          <a key={m.href} href={m.href} className="group">
            <div className="rounded-xl border bg-card p-6 transition-all hover:shadow-md hover:border-primary/50">
              <div className="font-semibold mb-1">{m.label}</div>
              <div className="text-sm text-muted-foreground">{m.desc}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
