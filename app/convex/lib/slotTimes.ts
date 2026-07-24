// Helpers para planillas: intervalos de 15 min entre 06:00 y 24:00
export const SLOT_INICIO_MIN = 6 * 60; // 06:00
export const SLOT_FIN_MIN = 24 * 60; // 24:00
export const SLOT_INTERVALO = 15; // 15 min
export const TOTAL_SLOTS = (SLOT_FIN_MIN - SLOT_INICIO_MIN) / SLOT_INTERVALO; // 72

export function slotToTime(slot: number): string {
  const min = SLOT_INICIO_MIN + slot * SLOT_INTERVALO;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToSlot(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h * 60 + m - SLOT_INICIO_MIN) / SLOT_INTERVALO;
}

export const COLORES_CARGO: Record<string, string> = {
  "Cajer@": "FF6B6B",
  "Self Checkout": "FFD93D",
  "RS": "6BCB77",
  "Ecommerce": "C77DFF",
  "Supervisor(@)": "4D96FF",
  "JefeCajas": "FF9F45",
  "SubGerente": "B5B5B5",
  "Gerente": "6B6B6B",
};

export const DIAS_SEMANA = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
