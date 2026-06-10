import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names (shadcn's standard helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
