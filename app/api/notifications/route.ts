import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** GET /api/notifications — the current user's recent notifications + unread count. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      include: {
        actor: { select: { name: true, email: true } },
        event: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return NextResponse.json({
    unread,
    notifications: items.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt,
      eventId: n.event?.id ?? null,
    })),
  });
}
