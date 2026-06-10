import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const userSelect = {
  select: { id: true, name: true, email: true, image: true },
};

function serialize(e: any) {
  return {
    id: e.id,
    title: e.title,
    description: e.description || "",
    location: e.location || "",
    color: e.color || null,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    allDay: e.allDay,
    createdBy: e.createdBy,
    updatedBy: e.updatedBy,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/** GET /api/events/:id — single event with full activity history. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      createdBy: userSelect,
      updatedBy: userSelect,
      activities: {
        include: { user: userSelect },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await getMembership(event.groupId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  return NextResponse.json({
    event: {
      ...serialize(event),
      activities: event.activities.map((a) => ({
        action: a.action,
        user: a.user,
        createdAt: a.createdAt,
      })),
    },
  });
}

/** PATCH /api/events/:id — any group member can edit; records the editor. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = await prisma.event.findUnique({ where: { id: params.id } });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await getMembership(existing.groupId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = await req.json();
  const data: any = { updatedById: membership.userId };
  if (body.title !== undefined) data.title = String(body.title);
  if (body.description !== undefined)
    data.description = body.description || null;
  if (body.location !== undefined) data.location = body.location || null;
  if (body.color !== undefined) data.color = body.color || null;
  if (body.start !== undefined) data.start = new Date(body.start);
  if (body.end !== undefined) data.end = new Date(body.end);
  if (body.allDay !== undefined) data.allDay = !!body.allDay;

  try {
    const event = await prisma.event.update({
      where: { id: params.id },
      data: {
        ...data,
        activities: {
          create: { userId: membership.userId, action: "updated" },
        },
      },
      include: { createdBy: userSelect, updatedBy: userSelect },
    });
    return NextResponse.json({ event: serialize(event) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not update event" },
      { status: 500 }
    );
  }
}

/** DELETE /api/events/:id — creator, owner, or admin only. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = await prisma.event.findUnique({ where: { id: params.id } });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await getMembership(existing.groupId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const privileged = membership.role === "OWNER" || membership.role === "ADMIN";
  if (existing.createdById !== membership.userId && !privileged) {
    return NextResponse.json(
      {
        error:
          "Only the creator, an admin, or the owner can delete this event.",
      },
      { status: 403 }
    );
  }

  await prisma.event.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
