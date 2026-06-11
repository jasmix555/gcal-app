// Expand a recurring event master into the occurrences that fall in a window.
// Kept dependency-free and bounded so it stays fast.

const DAY = 86400000;

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Occurrence {
  start: number; // ms
  end: number; // ms
  index: number; // 0-based occurrence number
}

export function expandOccurrences(
  startMs: number,
  endMs: number,
  freq: string,
  untilMs: number | null,
  count: number | null,
  winStart: number,
  winEnd: number
): Occurrence[] {
  const dur = Math.max(0, endMs - startMs);
  const sd = new Date(startMs);
  const res: Occurrence[] = [];

  // Jump near the window so we don't iterate from the original start.
  let kStart = 0;
  if (freq === "DAILY") {
    kStart = Math.max(0, Math.floor((winStart - startMs) / DAY));
  } else if (freq === "WEEKLY") {
    kStart = Math.max(0, Math.floor((winStart - startMs) / (7 * DAY)));
  } else if (freq === "MONTHLY") {
    const a = new Date(winStart);
    kStart = Math.max(
      0,
      (a.getUTCFullYear() - sd.getUTCFullYear()) * 12 +
        (a.getUTCMonth() - sd.getUTCMonth()) -
        1
    );
  } else if (freq === "YEARLY") {
    kStart = Math.max(
      0,
      new Date(winStart).getUTCFullYear() - sd.getUTCFullYear() - 1
    );
  }

  for (let k = kStart, guard = 0; guard < 600; k++, guard++) {
    if (count != null && k >= count) break;

    let occStart: number;
    if (freq === "DAILY") occStart = startMs + k * DAY;
    else if (freq === "WEEKLY") occStart = startMs + k * 7 * DAY;
    else if (freq === "MONTHLY")
      occStart = Date.UTC(
        sd.getUTCFullYear(),
        sd.getUTCMonth() + k,
        sd.getUTCDate(),
        sd.getUTCHours(),
        sd.getUTCMinutes()
      );
    else if (freq === "YEARLY")
      occStart = Date.UTC(
        sd.getUTCFullYear() + k,
        sd.getUTCMonth(),
        sd.getUTCDate(),
        sd.getUTCHours(),
        sd.getUTCMinutes()
      );
    else break;

    if (occStart > winEnd) break;
    if (untilMs != null && occStart > untilMs) break;
    const occEnd = occStart + dur;
    if (occEnd > winStart) res.push({ start: occStart, end: occEnd, index: k });
    if (res.length > 400) break;
  }

  return res;
}
