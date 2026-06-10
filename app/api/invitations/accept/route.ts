import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/invitations/accept
 * Body: { token }
 * The signed-in user accepts an invitation addressed to their email.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const email = session?.user?.email?.toLowerCase();
  if (!userId || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { token } = await req.json();
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation || invitation.status !== "pending") {
    return NextResponse.json(
      { error: "This invitation is no longer valid." },
      { status: 404 }
    );
  }
  if (invitation.email.toLowerCase() !== email) {
    return NextResponse.json(
      { error: "This invitation was sent to a different email address." },
      { status: 403 }
    );
  }

  // Create membership (idempotent) and mark the invitation accepted.
  await prisma.$transaction([
    prisma.membership.upsert({
      where: { userId_groupId: { userId, groupId: invitation.groupId } },
      update: {},
      create: { userId, groupId: invitation.groupId, role: invitation.role },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted" },
    }),
  ]);

  return NextResponse.json({ ok: true, groupId: invitation.groupId });
}
