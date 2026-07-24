"use client";

// Hook de auth simple basado en localStorage + Convex userProfiles
// Reemplaza al sistema de Convex Auth para evitar complejidad

import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const STORAGE_KEY = "dtc_user_id";

export function useAuth() {
  const [userId, setUserIdState] = useState<Id<"users"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar desde localStorage al montar
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) {
      setUserIdState(stored as Id<"users">);
    }
    setIsLoading(false);
  }, []);

  const setUserId = useCallback((id: Id<"users"> | null) => {
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setUserIdState(id);
  }, []);

  const signOut = useCallback(() => {
    setUserId(null);
  }, [setUserId]);

  return { userId, setUserId, signOut, isLoading };
}

export function useCurrentUser() {
  const { userId, isLoading: authLoading } = useAuth();
  const data = useQuery(
    api.auth.getCurrentUserById,
    userId ? { userId } : "skip"
  );
  return {
    user: data?.user ?? null,
    profile: data?.profile ?? null,
    isLoading: authLoading || (userId !== null && data === undefined),
  };
}
