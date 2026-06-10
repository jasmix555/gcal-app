import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** GET /api/groups/:id — group detail with member list (members only). */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const membership = await getMembership(params.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const group = await prisma.group.findUnique({
    where: { id: params.id },
    include: {
      memberships: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: group.id,
    name: group.name,
    myRole: membership.role,
    members: group.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
    })),
  });
}

/** DELETE /api/groups/:id — owner only. Cascade-removes members/events/invites. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const membership = await getMembership(params.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  if (membership.role !== "OWNER") {
    return NextResponse.json(
      { error: "Only the group owner can delete the group." },
      { status: 403 }
    );
  }

  await prisma.group.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
