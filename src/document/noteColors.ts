/** Google Keep-style background swatches. Colors are chosen dark/saturated
 * enough that white note text stays readable regardless of system theme. */
export interface NoteColor {
  id: string;
  label: string;
  bg: string;
}

export const NOTE_COLORS: NoteColor[] = [
  { id: "coral", label: "Coral", bg: "#5c2b29" },
  { id: "peach", label: "Peach", bg: "#6b4a1e" },
  { id: "sand", label: "Sand", bg: "#635d19" },
  { id: "mint", label: "Mint", bg: "#345920" },
  { id: "sage", label: "Sage", bg: "#16504b" },
  { id: "fog", label: "Fog", bg: "#2d555e" },
  { id: "storm", label: "Storm", bg: "#1e3a5f" },
  { id: "dusk", label: "Dusk", bg: "#42275e" },
  { id: "blossom", label: "Blossom", bg: "#5b2245" },
  { id: "clay", label: "Clay", bg: "#442f19" },
];

export function noteColorBg(colorId: string | null | undefined): string | null {
  if (!colorId) return null;
  return NOTE_COLORS.find((c) => c.id === colorId)?.bg ?? null;
}
