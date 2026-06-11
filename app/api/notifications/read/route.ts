import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/read
 * Body: { id } to mark one read, or {} to mark all read.
 */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await req.json().catch(() => ({}));

  await prisma.notification.updateMany({
    where: id ? { id, userId } : { userId, read: false },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
