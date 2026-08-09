/** Google Keep's actual light-theme background swatches. */
export interface NoteColor {
  id: string;
  label: string;
  bg: string;
}

export const NOTE_COLORS: NoteColor[] = [
  { id: "coral", label: "Coral", bg: "#f28b82" },
  { id: "peach", label: "Peach", bg: "#fbbc04" },
  { id: "sand", label: "Sand", bg: "#fff475" },
  { id: "mint", label: "Mint", bg: "#ccff90" },
  { id: "sage", label: "Sage", bg: "#a7ffeb" },
  { id: "fog", label: "Fog", bg: "#cbf0f8" },
  { id: "storm", label: "Storm", bg: "#aecbfa" },
  { id: "dusk", label: "Dusk", bg: "#d7aefb" },
  { id: "blossom", label: "Blossom", bg: "#fdcfe8" },
  { id: "clay", label: "Clay", bg: "#e6c9a8" },
];

export function noteColorBg(colorId: string | null | undefined): string | null {
  if (!colorId) return null;
  return NOTE_COLORS.find((c) => c.id === colorId)?.bg ?? null;
}

/** Softened near-black for text on a colored background — pure black at full
 * opacity read as too harsh against these light swatches. */
export const NOTE_TEXT_COLOR = "rgba(0, 0, 0, 0.78)";
