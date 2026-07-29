"use client";

import { Eye } from "lucide-react";
import { useCurrentSession, useCan } from "@/hooks/useAuth";

export function ReadOnlyBanner({ children }: { children?: React.ReactNode }) {
  const can = useCan();
  const { rawSession } = useCurrentSession();

  if (!rawSession) return null;

  // Gerencia: banner de solo ver
  if (can.isGerencia) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-sm text-amber-900">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="font-medium">Modo solo lectura</span>
        <span className="text-amber-800">— Tu cuenta es de Gerencia. No puedes modificar datos de la tienda.</span>
        {children}
      </div>
    );
  }

  return children ?? null;
}
