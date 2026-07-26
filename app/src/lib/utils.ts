import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatTime(time: string): string {
  // HH:MM -> HH:MM (ya viene así)
  return time;
}

export function formatHorario(
  h: { entrada?: string; salida?: string; descanso?: boolean } | null | undefined,
  opciones: { sinSalida?: string; vacio?: string; descanso?: string } = {},
): string {
  const { sinSalida = "?", vacio = "—", descanso = "DESC" } = opciones;
  if (!h) return vacio;
  if (h.descanso) return descanso;
  if (h.entrada && h.salida) return `${h.entrada}-${h.salida}`;
  if (h.entrada) return `${h.entrada}${sinSalida}`;
  return vacio;
}

export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 6);
  return d;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date | string, days: number): Date {
  const date = typeof d === "string" ? new Date(d) : new Date(d.getTime());
  date.setDate(date.getDate() + days);
  return date;
}

export const DIAS_SEMANA = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;
