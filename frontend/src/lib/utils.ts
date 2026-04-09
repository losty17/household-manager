import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const UNIT_LABELS: Record<string, string> = {
  count: "unidade",
  grams: "gramas",
  kg: "kg",
  liters: "litros",
  ml: "ml",
  pieces: "peças",
  bottles: "garrafas",
  boxes: "caixas",
  packs: "pacotes",
};

export function translateUnit(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

export const FREQUENCY_LABELS: Record<string, string> = {
  none: "Nenhuma",
  weekly: "Semanal",
  "bi-weekly": "Quinzenal",
  monthly: "Mensal",
};

export function translateFrequency(freq: string): string {
  return FREQUENCY_LABELS[freq] ?? freq;
}

/** Converts ISO date string "yyyy-MM-dd" to Brazilian "dd/MM/yyyy" */
export function isoToBR(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Converts Brazilian "dd/MM/yyyy" to ISO "yyyy-MM-dd" */
export function brToISO(brDate: string): string {
  if (!brDate) return "";
  const parts = brDate.split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6 && clean.length !== 3) return null;
  const full = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hn = h / 360;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, hn + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hn) * 255);
  const b = Math.round(hue2rgb(p, q, hn - 1 / 3) * 255);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

const DARK_MIN_LIGHTNESS = 0.18;
const DARK_LIGHTNESS_FACTOR = 0.45;
const DARK_SATURATION_FACTOR = 0.8;

/**
 * Adapts a category hex color for dark mode by darkening it and slightly
 * reducing saturation so it sits comfortably on a dark background.
 */
export function adaptColorForDark(color: string, isDark: boolean): string {
  if (!isDark) return color;
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const [h, s, l] = rgbToHsl(...rgb);
  const darkL = Math.max(DARK_MIN_LIGHTNESS, l * DARK_LIGHTNESS_FACTOR);
  const darkS = Math.min(s, s * DARK_SATURATION_FACTOR);
  return hslToHex(h, darkS, darkL);
}
