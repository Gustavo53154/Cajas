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
  ListTodo,
  History,
  LogOut,
  Bell,
  Store,
  Tag,
  Settings,
  Grid3X3,
  CalendarClock,
  ShieldCheck,
  KeyRound,
  Inbox,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession, useCan, type Session } from "@/hooks/useAuth";
import { useCurrentSession } from "@/hooks/useAuth";

type NavItem = { href: string; label: string; icon: any; badge?: string; adminOnly?: boolean; jeOnly?: boolean };

const NAV_OPERATIVO: NavItem[] = [
  { href: "/personal", label: "Personal", icon: Users },
  { href: "/horarios", label: "Horarios", icon: Calendar },
  { href: "/cajas", label: "Asignar Cajas", icon: Store },
  { href: "/tablero", label: "Tablero en vivo", icon: LayoutDashboard, badge: "TIEMPO REAL" },
  { href: "/funciones", label: "Funciones Secundarias", icon: Tag },
  { href: "/planillas", label: "Planillas ES", icon: Monitor },
  { href: "/cobertura", label: "Cobertura", icon: Grid3X3 },
  { href: "/indicadores", label: "Indicadores SIP", icon: TrendingUp },
  { href: "/velocidad", label: "Velocidad", icon: Gauge },
  { href: "/tinkas", label: "Tinkas", icon: Ticket },
  { href: "/tareas", label: "Tareas del área", icon: ListTodo },
  { href: "/evaluaciones", label: "Evaluaciones", icon: ClipboardCheck },
  { href: "/inducciones", label: "Inducciones", icon: GraduationCap },
  { href: "/capacitaciones", label: "Capacitaciones", icon: CalendarClock },
  { href: "/logs", label: "Logs", icon: History },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

const NAV_ADMIN: NavItem[] = [
  { href: "/admin/tiendas", label: "Tiendas", icon: Store, adminOnly: true },
  { href: "/admin/jefes-entrenador", label: "Jefes Entrenador", icon: ShieldCheck, adminOnly: true },
  { href: "/admin/admins", label: "Admins", icon: ShieldCheck, adminOnly: true },
  { href: "/admin/logs", label: "Logs globales", icon: History, adminOnly: true },
];

const NAV_JE: NavItem[] = [
  { href: "/cuenta-tienda", label: "Cuentas de tienda", icon: KeyRound, jeOnly: true },
  { href: "/solicitudes-reseteo", label: "Solicitudes reseteo", icon: Inbox, jeOnly: true },
];

export function Sidebar(props: {
  session: Session;
  tiendaActivaId: Id<"tiendas"> | null;
  onTiendaChange: (id: Id<"tiendas"> | null) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useSession();
  const { session: currentSession } = useCurrentSession();
  const can = useCan();

  const isAdmin = props.session.kind === "admin";
  const isJE = props.session.kind === "jefeEntrenador";
  const isCaja = props.session.kind === "user" && props.session.tipoCuenta === "Cajas";
  const isGerencia = props.session.kind === "user" && props.session.tipoCuenta === "Gerencia";

  // Tiendas disponibles para Admin (todas) / JE (asignadas) / user (la suya)
  const tiendasAdmin = useQuery(
    api.tiendas.listTiendas,
    isAdmin ? { session: { kind: "admin", id: (props.session as any).id } } : "skip",
  );
  const tiendasJE = useQuery(
    isJE ? (api.tiendas as any).listTiendas : null,
    isJE ? { session: { kind: "jefeEntrenador", id: (props.session as any).id } } : "skip",
  );
  const tiendas = isAdmin ? tiendasAdmin : isJE ? tiendasJE : null;

  // Badge solicitudes pendientes
  const nSolicitudes = useQuery(
    (api as any).passwordResetRequests.countPendientesForJE,
    isJE ? { sessionJefeEntrenadorId: (props.session as any).id } : "skip",
  );
  const unreadNotif = useQuery(api.notificaciones.countUnread, {});

  const userLabel = (() => {
    if (currentSession?.kind === "admin") {
      return `${currentSession.admin.nombre} ${currentSession.admin.apellido}`.trim() || currentSession.admin.username;
    }
    if (currentSession?.kind === "jefeEntrenador") {
      return `${currentSession.jefeEntrenador.nombre} ${currentSession.jefeEntrenador.apellido}`.trim() || currentSession.jefeEntrenador.username;
    }
    if (currentSession?.kind === "user") {
      return currentSession.profile.nombreCompleto;
    }
    return "Usuario";
  })();

  const roleLabel = (() => {
    if (isAdmin) return "Admin";
    if (isJE) return "JefeEntrenador";
    if (isCaja) return "Caja";
    if (isGerencia) return "Gerencia (solo ver)";
    return "...";
  })();

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

      {/* Banner Admin sobre tienda */}
      {isAdmin && props.tiendaActivaId && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Operando como Admin</span>
        </div>
      )}

      {/* Selector de tienda para Admin y JE */}
      {can.canSeeStoreSelector && (
        <div className="p-3 border-b">
          <div className="text-xs text-muted-foreground mb-1">Tienda activa</div>
          <Select
            value={props.tiendaActivaId ?? ""}
            onValueChange={(v) => props.onTiendaChange(v as Id<"tiendas">)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {tiendas?.map((t: any) => (
                <SelectItem key={t._id} value={t._id}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Sección operativa */}
        {props.tiendaActivaId && (
          <>
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground mt-2">
              Operación
            </div>
            {NAV_OPERATIVO.map((item) => {
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
                      : "text-foreground/80 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && !isGerencia && (
                    <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </>
        )}

        {/* Sección JE */}
        {isJE && (
          <>
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground mt-3">
              Gestión de cuentas
            </div>
            {NAV_JE.map((item) => {
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
                      : "text-foreground/80 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.href === "/solicitudes-reseteo" && nSolicitudes > 0 && (
                    <Badge variant="destructive" className="ml-auto">
                      {nSolicitudes}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </>
        )}

        {/* Sección Admin */}
        {isAdmin && (
          <>
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground mt-3">
              Administración
            </div>
            {NAV_ADMIN.map((item) => {
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
                      : "text-foreground/80 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t p-3 space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => router.push("/notificaciones")}
        >
          <Bell className="h-4 w-4 mr-2" />
          Notificaciones
          {unreadNotif !== undefined && unreadNotif > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {unreadNotif}
            </Badge>
          )}
        </Button>
        <div className="px-2 py-1 text-xs">
          <div className="font-medium truncate">{userLabel}</div>
          <div className="text-muted-foreground truncate">{roleLabel}</div>
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
