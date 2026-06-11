import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/invitations/decline
 * Body: { token }
 * The signed-in user declines a group invitation addressed to their email.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
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

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: "declined" },
  });

  return NextResponse.json({ ok: true });
}
