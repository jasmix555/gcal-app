import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, getMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/changes?groupIds=a,b,c
 * Cheap change-signatures the client polls to know what to refetch:
 *   - events: events in the visible calendars (drives the calendar grid)
 *   - memos:  the user's memos (calendar reminders + the notes list)
 *   - notif:  notifications + pending invitations (drives the bell)
 * Refetch only happens when the relevant signature moves.
 */
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("groupIds") || "";
  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const checks = await Promise.all(
    requested.map(async (id) => ((await getMembership(id)) ? id : null))
  );
  const allowed = checks.filter(Boolean) as string[];

  try {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const [ev, memo, notif, unread, invites] = await Promise.all([
      allowed.length
        ? prisma.event.aggregate({
            where: { groupId: { in: allowed } },
            _count: { _all: true },
            _max: { updatedAt: true },
          })
        : Promise.resolve({ _count: { _all: 0 }, _max: { updatedAt: null } }),
      prisma.memo.aggregate({
        where: { createdById: userId },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      prisma.notification.aggregate({
        where: { userId },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.notification.count({ where: { userId, read: false } }),
      me?.email
        ? prisma.invitation.aggregate({
            where: { email: me.email, status: "pending" },
            _count: { _all: true },
            _max: { createdAt: true },
          })
        : Promise.resolve({ _count: { _all: 0 }, _max: { createdAt: null } }),
    ]);

    return NextResponse.json({
      events: `${ev._count._all}:${ev._max.updatedAt?.getTime() || 0}`,
      memos: `${memo._count._all}:${memo._max.updatedAt?.getTime() || 0}`,
      notif: [
        notif._count._all,
        notif._max.createdAt?.getTime() || 0,
        unread,
        invites._count._all,
        invites._max.createdAt?.getTime() || 0,
      ].join(":"),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not check for changes" },
      { status: 500 }
    );
  }
}
