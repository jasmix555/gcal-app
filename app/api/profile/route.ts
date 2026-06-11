import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** GET /api/profile — current user's account info. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      passwordHash: true,
      createdAt: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    createdAt: user.createdAt,
    hasPassword: !!user.passwordHash,
    providers: user.accounts.map((a) => a.provider),
  });
}

/** PATCH /api/profile — update display name and/or avatar image. */
export async function PATCH(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = await req.json();
  const data: { name?: string; image?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name can't be empty." },
        { status: 400 }
      );
    }
    data.name = name;
  }
  if (body.image !== undefined) {
    // Accept a data URL / URL, or null to remove. Cap size to keep the row sane.
    if (body.image && String(body.image).length > 1_500_000) {
      return NextResponse.json(
        { error: "Image is too large. Please pick a smaller one." },
        { status: 400 }
      );
    }
    data.image = body.image || null;
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { name: true, image: true },
  });
  return NextResponse.json({ ok: true, ...user });
}

/** DELETE /api/profile — permanently delete the account and all its data. */
export async function DELETE() {
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
    // Events this user authored (cascades their activities/attendees/notifs).
    prisma.event.deleteMany({ where: { createdById: userId } }),
    // Activity entries the user left on other people's events.
    prisma.eventActivity.deleteMany({ where: { userId } }),
    prisma.invitation.deleteMany({ where: { invitedById: userId } }),
    // Calendars the user owns (cascades everything inside).
    prisma.group.deleteMany({ where: { id: { in: ownedIds } } }),
    // Finally the user (cascades memberships, memos, attendances, notifs).
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
