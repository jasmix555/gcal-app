import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/groups/reorder  Body: { order: string[] }
 * Persists the user's sidebar calendar order (per-user, via membership.position).
 */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { order } = await req.json();
  if (!Array.isArray(order)) {
    return NextResponse.json(
      { error: "order must be an array" },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    order.map((groupId: string, index: number) =>
      prisma.membership.updateMany({
        where: { userId, groupId: String(groupId) },
        data: { position: index },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
