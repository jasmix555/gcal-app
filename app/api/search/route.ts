import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** GET /api/search?q= — events (in the user's calendars) + memos by title. */
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ events: [], memos: [] });
  }

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const allowed = memberships.map((m) => m.groupId);

  const [events, memos] = await Promise.all([
    allowed.length
      ? prisma.event.findMany({
          where: {
            groupId: { in: allowed },
            title: { contains: q, mode: "insensitive" },
          },
          select: { id: true, title: true, start: true, allDay: true },
          orderBy: { start: "desc" },
          take: 6,
        })
      : Promise.resolve([]),
    prisma.memo.findMany({
      where: {
        createdById: userId,
        title: { contains: q, mode: "insensitive" },
      },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
  ]);

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      allDay: e.allDay,
    })),
    memos,
  });
}
