"use client";

// Hooks de sesión multi-rol.
//
// La sesión se guarda en localStorage como un objeto discriminado:
//   { kind: "admin", id: "..." }
//   { kind: "jefeEntrenador", id: "...", tiendaActivaId?: "..." }
//   { kind: "user", id: "...", tiendaId: "...", tipoCuenta: "Cajas" | "Gerencia" }

import { useEffect, useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const STORAGE_KEY = "dtc_session";
const STORE_KEY = "dtc_tienda_activa";

export type SessionKind = "admin" | "jefeEntrenador" | "user";

export type Session =
  | { kind: "admin"; id: Id<"admins"> }
  | { kind: "jefeEntrenador"; id: Id<"jefesEntrenador">; tiendaActivaId?: Id<"tiendas"> }
  | { kind: "user"; id: Id<"userProfiles">; tiendaId: Id<"tiendas">; tipoCuenta: "Cajas" | "Gerencia" };

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function readTiendaActiva(): Id<"tiendas"> | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return null;
  return raw as Id<"tiendas">;
}

export function useSession(): {
  session: Session | null;
  setSession: (s: Session | null) => void;
  signOut: () => void;
  isLoading: boolean;
} {
  const [session, setSessionState] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSessionState(readSession());
    setIsLoading(false);
  }, []);

  const setSession = useCallback((s: Session | null) => {
    if (typeof window !== "undefined") {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    }
    setSessionState(s);
  }, []);

  const signOut = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORE_KEY);
    }
    setSessionState(null);
  }, []);

  return { session, setSession, signOut, isLoading };
}

export function useCurrentSession() {
  const { session, isLoading: sessionLoading } = useSession();
  const data = useQuery(
    api.auth.getCurrentSession,
    session ? (session as any) : "skip",
  );
  return {
    session: data ?? null,
    rawSession: session,
    isLoading: sessionLoading || (session !== null && data === undefined),
  };
}

export function useTiendaActiva(): {
  tiendaActivaId: Id<"tiendas"> | null;
  setTiendaActiva: (id: Id<"tiendas"> | null) => void;
} {
  const [tiendaActivaId, setState] = useState<Id<"tiendas"> | null>(null);

  useEffect(() => {
    setState(readTiendaActiva());
  }, []);

  const setTiendaActiva = useCallback((id: Id<"tiendas"> | null) => {
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORE_KEY, id);
      else localStorage.removeItem(STORE_KEY);
    }
    setState(id);
  }, []);

  return { tiendaActivaId, setTiendaActiva };
}

// Para usuarios Caja/Gerencia: su tienda es fija. Para JE/Admin: usar useTiendaActiva.
export function useEffectiveTiendaId(): Id<"tiendas"> | null {
  const { rawSession } = useCurrentSession();
  const { tiendaActivaId } = useTiendaActiva();
  if (!rawSession) return null;
  if (rawSession.kind === "user") return rawSession.tiendaId;
  return tiendaActivaId;
}

// Helper de permisos en el cliente (refleja la matriz del spec)
export function useCan() {
  const { rawSession } = useCurrentSession();
  return useMemo(() => {
    const isAdmin = rawSession?.kind === "admin";
    const isJE = rawSession?.kind === "jefeEntrenador";
    const isCaja = rawSession?.kind === "user" && rawSession.tipoCuenta === "Cajas";
    const isGerencia = rawSession?.kind === "user" && rawSession.tipoCuenta === "Gerencia";
    const isReadOnly = isGerencia;

    return {
      isAdmin,
      isJE,
      isCaja,
      isGerencia,
      isReadOnly,
      isLoggedIn: !!rawSession,
      canWrite: isAdmin || isJE || isCaja,
      canSeeStoreSelector: isAdmin || isJE,
      canSeeAdminMenu: isAdmin,
      canSeeJEMenu: isAdmin || isJE,
      canSeeGerencia: true, // todos pueden ver
      canChangeOwnPassword: isAdmin || isJE, // Caja/Gerencia solo en primer login
      canResetCajaGerenciaPassword: isAdmin || isJE,
      canCreateTienda: isAdmin,
      canEditTiendaBasic: isAdmin || isJE,
      canEditTiendaConfig: false, // nadie post-creación
      canToggleTiendaActiva: isAdmin,
      canManageJEs: isAdmin,
      canManageAdmins: isAdmin,
      canManageCuentasTienda: isAdmin || isJE,
    };
  }, [rawSession]);
}

// Compat: useAuth antiguo (mismo nombre para no romper imports)
export function useAuth() {
  const { session, setSession, signOut, isLoading } = useSession();
  const id = session ? (session as any).id : null;
  const setUserId = useCallback(
    (newId: any) => {
      // Compat: si llega null, signOut
      if (newId === null) {
        signOut();
        return;
      }
      // Si llega un id, se asume que es de tipo "user" (uso legacy)
      const s: Session = { kind: "user", id: newId, tiendaId: "" as any, tipoCuenta: "Cajas" };
      setSession(s);
    },
    [setSession, signOut],
  );
  return { userId: id, setUserId, signOut, isLoading };
}
