import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** GET /api/profile/export — a JSON snapshot of the user's data (download). */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, createdAt: true },
  });

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      group: {
        include: {
          events: {
            select: {
              title: true,
              description: true,
              location: true,
              start: true,
              end: true,
              allDay: true,
            },
          },
        },
      },
    },
  });

  const memos = await prisma.memo.findMany({
    where: { createdById: userId },
    select: {
      title: true,
      content: true,
      remindAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const data = {
    exportedAt: new Date().toISOString(),
    account: user,
    calendars: memberships.map((m) => ({
      name: m.group.name,
      role: m.role,
      events: m.group.events,
    })),
    notes: memos,
  };

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="team-calendar-export.json"`,
    },
  });
}
