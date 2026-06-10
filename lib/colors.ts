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
