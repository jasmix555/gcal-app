import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/availability
 *   ?userIds=a,b,c   members who must all be free
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD   inclusive local date range
 *   &duration=60     meeting length in minutes
 *   &dayStart=9&dayEnd=18   working hours (local)
 *   &tz=-540         client getTimezoneOffset() in minutes
 *
 * Returns common free slots: working-hours windows of `duration` length where
 * none of the selected members has an event (across every calendar the
 * requester can see). The complement of the union of everyone's busy time.
 */
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const selected = new Set(
    (sp.get("userIds") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const from = sp.get("from") || "";
  const to = sp.get("to") || from;
  const duration = Math.max(15, Number(sp.get("duration")) || 60);
  const dayStart = Math.min(23, Math.max(0, Number(sp.get("dayStart")) || 9));
  const dayEnd = Math.min(24, Math.max(1, Number(sp.get("dayEnd")) || 18));
  const tz = Number(sp.get("tz")) || 0; // minutes (getTimezoneOffset)

  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (!fy || !ty) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  // Local wall-clock (y,m,d,minutes) → real UTC milliseconds.
  const toUtcMs = (y: number, m: number, d: number, minutes: number) =>
    Date.UTC(y, m - 1, d) + minutes * 60000 + tz * 60000;

  const rangeStart = toUtcMs(fy, fm, fd, 0);
  const rangeEnd = toUtcMs(ty, tm, td, 0) + 24 * 3600 * 1000;

  // Calendars the requester can see.
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const allowed = memberships.map((m) => m.groupId);

  // Busy = events overlapping the range that involve any selected member
  // (as creator or attendee).
  const events = await prisma.event.findMany({
    where: {
      groupId: { in: allowed },
      end: { gt: new Date(rangeStart) },
      start: { lt: new Date(rangeEnd) },
    },
    select: {
      start: true,
      end: true,
      createdById: true,
      attendees: { select: { userId: true } },
    },
  });

  const busy: { start: number; end: number }[] = []; // union (for free slots)
  const perMember = new Map<string, { start: number; end: number }[]>();
  for (const id of selected) perMember.set(id, []);

  for (const e of events) {
    const occupants = new Set<string>([
      e.createdById,
      ...e.attendees.map((a) => a.userId),
    ]);
    let involved = false;
    for (const id of selected) {
      if (occupants.has(id)) {
        involved = true;
        perMember.get(id)!.push({
          start: e.start.getTime(),
          end: e.end.getTime(),
        });
      }
    }
    if (involved) busy.push({ start: e.start.getTime(), end: e.end.getTime() });
  }

  const isFree = (s: number, en: number) =>
    !busy.some((b) => b.start < en && b.end > s);

  const now = Date.now();
  const slots: { start: string; end: string }[] = [];
  const STEP = 30; // minutes between candidate starts
  const cursor = new Date(Date.UTC(fy, fm - 1, fd));
  const endDay = new Date(Date.UTC(ty, tm - 1, td));

  while (cursor.getTime() <= endDay.getTime() && slots.length < 60) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    for (
      let min = dayStart * 60;
      min + duration <= dayEnd * 60 && slots.length < 60;
      min += STEP
    ) {
      const s = toUtcMs(y, m, d, min);
      const en = s + duration * 60000;
      if (s < now) continue;
      if (isFree(s, en)) {
        slots.push({
          start: new Date(s).toISOString(),
          end: new Date(en).toISOString(),
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Per-member, per-day busy fraction within working hours (the heat strip).
  const days: string[] = [];
  {
    const c = new Date(Date.UTC(fy, fm - 1, fd));
    const e = new Date(Date.UTC(ty, tm - 1, td));
    while (c.getTime() <= e.getTime() && days.length < 31) {
      days.push(
        `${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(
          c.getUTCDate()
        )}`
      );
      c.setUTCDate(c.getUTCDate() + 1);
    }
  }
  const workMs = (dayEnd - dayStart) * 3600 * 1000;
  const heat: Record<string, number[]> = {};
  for (const [id, intervals] of perMember) {
    heat[id] = days.map((dk) => {
      const [yy, mm, dd] = dk.split("-").map(Number);
      const ws = toUtcMs(yy, mm, dd, dayStart * 60);
      const we = toUtcMs(yy, mm, dd, dayEnd * 60);
      let busyMs = 0;
      for (const iv of intervals) {
        const o = Math.min(we, iv.end) - Math.max(ws, iv.start);
        if (o > 0) busyMs += o;
      }
      return workMs > 0 ? Math.min(1, busyMs / workMs) : 0;
    });
  }

  return NextResponse.json({ slots, days, heat });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
