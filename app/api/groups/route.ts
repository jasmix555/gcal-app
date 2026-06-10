import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** GET /api/groups — groups the current user belongs to. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      group: {
        include: { _count: { select: { memberships: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = memberships.map((m) => ({
    id: m.group.id,
    name: m.group.name,
    role: m.role,
    memberCount: m.group._count.memberships,
  }));

  return NextResponse.json({ groups });
}

/** POST /api/groups — create a group; creator becomes OWNER. */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { name } = await req.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "Group name is required." }, { status: 400 });
  }

  const group = await prisma.group.create({
    data: {
      name: String(name).trim(),
      memberships: { create: { userId, role: "OWNER" } },
    },
  });

  return NextResponse.json({ group: { id: group.id, name: group.name } });
}
