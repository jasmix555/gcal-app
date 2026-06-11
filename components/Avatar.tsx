import { colorForKey } from "@/lib/colors";

interface Props {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  /** Key used to pick the fallback color (defaults to email/name). */
  colorKey?: string | null;
  /** Tailwind size classes, e.g. "h-7 w-7". */
  className?: string;
}

function initials(name?: string | null, email?: string | null) {
  return (name || email || "?").slice(0, 2).toUpperCase();
}

/** A user's profile photo, with an initials-on-color circle as the fallback. */
export default function Avatar({
  src,
  name,
  email,
  colorKey,
  className = "h-7 w-7",
}: Props) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white`}
      style={{ backgroundColor: colorForKey(colorKey || email || name) }}
    >
      {initials(name, email)}
    </span>
  );
}
