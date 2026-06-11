import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/profile/reset
 * Wipes the user's content (notes, authored events, owned calendars, and all
 * memberships) but keeps the login. A fresh Personal calendar is recreated
 * lazily the next time calendars are loaded.
 */
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const owned = await prisma.membership.findMany({
    where: { userId, role: "OWNER" },
    select: { groupId: true },
  });
  const ownedIds = owned.map((m) => m.groupId);

  await prisma.$transaction([
    prisma.memo.deleteMany({ where: { createdById: userId } }),
    prisma.event.deleteMany({ where: { createdById: userId } }),
    prisma.eventActivity.deleteMany({ where: { userId } }),
    prisma.invitation.deleteMany({ where: { invitedById: userId } }),
    prisma.group.deleteMany({ where: { id: { in: ownedIds } } }),
    // Leave every remaining (shared) calendar.
    prisma.membership.deleteMany({ where: { userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
