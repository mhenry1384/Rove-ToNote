import { useEffect, useState } from "react";

/** Relative luminance (WCAG, 0 = black, 1 = white) of an sRGB color. */
function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Luminance of a `#rgb` / `#rrggbb` color, or null if it isn't one. */
export function hexLuminance(hex: string): number | null {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, "$&$&");
  const n = parseInt(h, 16);
  return relativeLuminance((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

const cache = new Map<string, number | null>();

/** Average luminance of the image at `url`, sampled on a small canvas.
 * Returns null while loading, or if the image can't be read (e.g. the host
 * doesn't send CORS headers, which taints the canvas). */
function measureImage(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let total = 0;
        let weight = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255;
          total += relativeLuminance(data[i], data[i + 1], data[i + 2]) * a;
          weight += a;
        }
        resolve(weight > 0 ? total / weight : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useImageLuminance(url: string | null | undefined): number | null {
  const [result, setResult] = useState<{ url: string; lum: number | null } | null>(null);

  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) {
      setResult({ url, lum: cache.get(url) ?? null });
      return;
    }
    let cancelled = false;
    void measureImage(url).then((lum) => {
      cache.set(url, lum);
      if (!cancelled) setResult({ url, lum });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return url && result?.url === url ? result.lum : null;
}

/** Luminance of the app's themed `--bg`, tracking light/dark changes. */
export function useThemeBgLuminance(): number {
  const read = () =>
    hexLuminance(getComputedStyle(document.documentElement).getPropertyValue("--bg")) ?? 1;
  const [lum, setLum] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setLum(read());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return lum;
}

/** Muted/hover colors for small controls (flags, note icons, "Add note")
 * that contrast with the given background luminance: whichever of
 * near-black or near-white has the higher WCAG contrast ratio. */
export function contrastingMutedColors(bgLum: number): { muted: string; hover: string } {
  const contrastWithBlack = (bgLum + 0.05) / 0.05;
  const contrastWithWhite = 1.05 / (bgLum + 0.05);
  return contrastWithBlack >= contrastWithWhite
    ? { muted: "rgba(0, 0, 0, 0.62)", hover: "rgba(0, 0, 0, 0.9)" }
    : { muted: "rgba(255, 255, 255, 0.8)", hover: "#ffffff" };
}
