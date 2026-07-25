// Helpers para drag-and-drop con HTML5 nativo.
// No usa librerías externas; compatible con cualquier React 19 + Next.js.

import { useCallback, useState, useRef, DragEvent } from "react";

export type DndPayload<T> = {
  source: string; // identificador de la zona de origen (opcional)
  data: T;
};

const MIME = "application/x-dtc-dnd";

export function setDragData<T>(e: DragEvent, payload: DndPayload<T>) {
  e.dataTransfer.setData(MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

export function readDragData<T>(e: DragEvent): DndPayload<T> | null {
  const raw = e.dataTransfer.getData(MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DndPayload<T>;
  } catch {
    return null;
  }
}

export function hasDndData(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(MIME);
}

// Hook opcional: estado de "over" para resaltar la zona de drop
export function useDndHover() {
  const [isOver, setIsOver] = useState(false);
  const enter = useCallback((e: DragEvent) => {
    if (hasDndData(e)) {
      e.preventDefault();
      setIsOver(true);
    }
  }, []);
  const leave = useCallback(() => setIsOver(false), []);
  const over = useCallback((e: DragEvent) => {
    if (hasDndData(e)) e.preventDefault();
  }, []);
  return { isOver, onDragEnter: enter, onDragLeave: leave, onDragOver: over };
}

// Helper para accesibilidad por teclado: mueve un item entre zonas con Space/Enter.
// Devuelve callbacks para usar en un chip arrastrable.
export function useKeyboardDnd<T>(
  onDrop: (target: string, payload: DndPayload<T>) => void
) {
  const [active, setActive] = useState<{ source: string; data: T } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (active) {
          // Commit: necesitamos target - simplificado: lo hace el consumidor
          setActive(null);
        } else {
          // begin
          setActive({ source: "", data: null as any });
        }
      } else if (e.key === "Escape") {
        setActive(null);
      }
    },
    [active]
  );

  return { active, setActive, onKeyDown, ref };
}
