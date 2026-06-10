import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/groups/join
 * Body: { code }
 * Adds the signed-in user to the group that owns this join code.
 */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await req.json();
  if (!code) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }

  const group = await prisma.group.findUnique({ where: { joinCode: code } });
  if (!group) {
    return NextResponse.json(
      { error: "This invite link is invalid or has been reset." },
      { status: 404 }
    );
  }

  await prisma.membership.upsert({
    where: { userId_groupId: { userId, groupId: group.id } },
    update: {},
    create: { userId, groupId: group.id, role: "MEMBER" },
  });

  return NextResponse.json({ ok: true, groupId: group.id, groupName: group.name });
}
