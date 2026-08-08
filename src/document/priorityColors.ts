import type { Priority } from "./todoMarkdown";

export const PRIORITY_COLORS: Record<Priority, { label: string; color: string }> = {
  high: { label: "High", color: "#e05b4f" },
  medium: { label: "Medium", color: "#e0a23b" },
  low: { label: "Low", color: "#3b82c4" },
  none: { label: "None", color: "var(--text-muted)" },
};

export const PRIORITY_ORDER: Priority[] = ["high", "medium", "low", "none"];
