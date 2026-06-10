// A stable, pleasant color per person (used for event blocks + member dots).
const PALETTE = [
  "#2563eb", // blue
  "#059669", // emerald
  "#7c3aed", // violet
  "#d97706", // amber
  "#e11d48", // rose
  "#0891b2", // cyan
  "#4f46e5", // indigo
  "#0d9488", // teal
  "#ea580c", // orange
  "#db2777", // pink
];

// Pastel rainbow palette users can pick from per event.
export const PASTEL_PALETTE = [
  "#fecdd3", // rose
  "#fed7aa", // orange
  "#fde68a", // amber
  "#d9f99d", // lime
  "#bbf7d0", // green
  "#99f6e4", // teal
  "#bae6fd", // sky
  "#c7d2fe", // indigo
  "#ddd6fe", // violet
  "#fbcfe8", // pink
];

/** Pick black or white text for legibility on a given background hex. */
export function readableText(hex?: string | null): string {
  if (!hex || hex.length < 7) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

/** Deterministically map a key (user id or email) to a palette color. */
export function colorForKey(key?: string | null): string {
  if (!key) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
