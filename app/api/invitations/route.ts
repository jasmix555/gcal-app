import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/invitations — pending invitations addressed to the current user. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const invitations = await prisma.invitation.findMany({
    where: { email, status: "pending" },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    invitations: invitations.map((i) => ({
      id: i.id,
      token: i.token,
      role: i.role,
      group: i.group,
    })),
  });
}
