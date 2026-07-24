"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  History,
  LogOut,
  Bell,
  Store,
  Tag,
  Settings,
  Grid3X3,
} from "lucide-react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth, useCurrentUser } from "@/hooks/useAuth";

const NAV = [
  { href: "/tablero", label: "Tablero en vivo", icon: LayoutDashboard, badge: "TIEMPO REAL" },
  { href: "/personal", label: "Personal", icon: Users },
  { href: "/horarios", label: "Horarios", icon: Calendar },
  { href: "/cobertura", label: "Cobertura", icon: Grid3X3 },
  { href: "/planillas", label: "Planillas ES", icon: Monitor },
  { href: "/cajas", label: "Asignar Cajas", icon: Store },
  { href: "/funciones", label: "Funciones Secundarias", icon: Tag },
  { href: "/indicadores", label: "Indicadores SIP", icon: TrendingUp },
  { href: "/velocidad", label: "Velocidad", icon: Gauge },
  { href: "/tinkas", label: "Tinkas", icon: Ticket },
  { href: "/evaluaciones", label: "Evaluaciones", icon: ClipboardCheck },
  { href: "/inducciones", label: "Inducciones", icon: GraduationCap },
  { href: "/reuniones", label: "Reuniones", icon: CalendarDays },
  { href: "/tareas", label: "Tareas del área", icon: ListTodo },
  { href: "/auditoria", label: "Auditoría", icon: History },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const { profile } = useCurrentUser();
  const unread = useQuery(api.notificaciones.countUnread, {});

  return (
    <aside className="w-64 border-r bg-card flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
            PV
          </div>
          <div>
            <div className="font-semibold text-sm">DreamTeam</div>
            <div className="text-xs text-muted-foreground">Plaza Vea</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-foreground/80 hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && (
                <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">
                  {item.badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => router.push("/notificaciones")}
        >
          <Bell className="h-4 w-4 mr-2" />
          Notificaciones
          {unread !== undefined && unread > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {unread}
            </Badge>
          )}
        </Button>
        <div className="px-2 py-1 text-xs">
          <div className="font-medium truncate">{profile?.nombreCompleto ?? "Usuario"}</div>
          <div className="text-muted-foreground truncate">{profile?.rol ?? "..."}</div>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            signOut();
            router.push("/login");
          }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Salir
        </Button>
      </div>
    </aside>
  );
}
