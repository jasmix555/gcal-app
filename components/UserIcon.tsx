/** Small person glyph, optionally inside a colored circle, shown beside names. */
export default function UserIcon({
  className = "",
  color,
}: {
  className?: string;
  color?: string;
}) {
  const glyph = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  if (color) {
    return (
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${className}`}
        style={{ backgroundColor: color }}
      >
        {glyph}
      </span>
    );
  }
  return (
    <span className={`shrink-0 text-slate-400 ${className}`}>{glyph}</span>
  );
}
