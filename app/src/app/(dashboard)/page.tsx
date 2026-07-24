"use client";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Calendar,
  LayoutDashboard,
  Monitor,
  TrendingUp,
  Gauge,
  Ticket,
  ClipboardCheck,
  GraduationCap,
  CalendarDays,
  ListTodo,
  Store,
} from "lucide-react";

const MODULES = [
  { href: "/tablero", label: "Tablero en vivo", desc: "Vista en tiempo real del personal y cajas", icon: LayoutDashboard, color: "text-red-500" },
  { href: "/personal", label: "Personal", desc: "CRUD de cajeros con nick y configuración", icon: Users, color: "text-blue-500" },
  { href: "/horarios", label: "Horarios", desc: "Horario semanal con pegado masivo", icon: Calendar, color: "text-purple-500" },
  { href: "/planillas", label: "Planillas ES", desc: "Mapa de entradas/salidas por bloques", icon: Monitor, color: "text-orange-500" },
  { href: "/cajas", label: "Asignar Cajas", desc: "Algoritmo de 30 cajas en cascada", icon: Store, color: "text-cyan-500" },
  { href: "/indicadores", label: "Indicadores SIP", desc: "Débito, crédito y total", icon: TrendingUp, color: "text-green-500" },
  { href: "/velocidad", label: "Velocidad", desc: "Velocidad diaria por cajero", icon: Gauge, color: "text-yellow-500" },
  { href: "/tinkas", label: "Tinkas", desc: "Cantidad de tinkas vendidas por día", icon: Ticket, color: "text-pink-500" },
  { href: "/evaluaciones", label: "Evaluaciones", desc: "Plantillas y notas por cajero", icon: ClipboardCheck, color: "text-indigo-500" },
  { href: "/inducciones", label: "Inducciones", desc: "Programar y marcar recibidos", icon: GraduationCap, color: "text-teal-500" },
  { href: "/reuniones", label: "Reuniones", desc: "Con 1, varios o todo el área", icon: CalendarDays, color: "text-rose-500" },
  { href: "/tareas", label: "Tareas del área", desc: "Recurrentes y del momento", icon: ListTodo, color: "text-amber-500" },
];

export default function HomePage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Bienvenido a DreamTeam Cajas</h1>
        <p className="text-muted-foreground mt-1">
          Plataforma de gestión del área de cajas - Plaza Vea
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.href} href={m.href} className="group">
              <Card className="h-full transition-all hover:shadow-md hover:border-primary/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-muted ${m.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base">{m.label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{m.desc}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
