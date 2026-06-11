import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/permissions";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

const userSelect = {
  select: { id: true, name: true, email: true, image: true },
};

const baseInclude = {
  createdBy: userSelect,
  updatedBy: userSelect,
  attendees: { include: { user: userSelect } },
};

function serialize(e: any) {
  return {
    id: e.id,
    groupId: e.groupId,
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
    attendees: (e.attendees || []).map((a: any) => ({
      id: a.user.id,
      name: a.user.name,
      email: a.user.email,
      image: a.user.image,
      status: a.status,
      proposedStart: a.proposedStart ? a.proposedStart.toISOString() : null,
      proposedEnd: a.proposedEnd ? a.proposedEnd.toISOString() : null,
    })),
  };
}

/** GET /api/events/:id — single event with attendees + activity history. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      ...baseInclude,
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

/** PATCH /api/events/:id — edit fields and/or sync attendees; notifies people. */
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

  // Move the event to a different calendar (group) the user belongs to.
  if (body.groupId && body.groupId !== existing.groupId) {
    const target = await getMembership(body.groupId);
    if (!target) {
      return NextResponse.json(
        { error: "You're not a member of the target calendar." },
        { status: 403 }
      );
    }
    data.groupId = body.groupId;
  }

  const eventChanged = [
    "title",
    "description",
    "location",
    "color",
    "start",
    "end",
    "allDay",
  ].some((k) => body[k] !== undefined);

  try {
    // Sync attendees if the list was provided.
    let newUsers: { id: string; email: string }[] = [];
    if (Array.isArray(body.attendees)) {
      const emails = body.attendees.map((e: string) =>
        String(e).toLowerCase().trim()
      );
      const users = emails.length
        ? await prisma.user.findMany({ where: { email: { in: emails } } })
        : [];
      const desiredIds = new Set(
        users.map((u) => u.id).filter((id) => id !== existing.createdById)
      );
      const current = await prisma.eventAttendee.findMany({
        where: { eventId: params.id },
      });
      const currentIds = new Set(current.map((a) => a.userId));
      const toAdd = users.filter(
        (u) => desiredIds.has(u.id) && !currentIds.has(u.id)
      );
      const toRemove = [...currentIds].filter((id) => !desiredIds.has(id));
      if (toAdd.length) {
        await prisma.eventAttendee.createMany({
          data: toAdd.map((u) => ({ eventId: params.id, userId: u.id })),
          skipDuplicates: true,
        });
      }
      if (toRemove.length) {
        await prisma.eventAttendee.deleteMany({
          where: { eventId: params.id, userId: { in: toRemove } },
        });
      }
      newUsers = toAdd.map((u) => ({ id: u.id, email: u.email }));
    }

    const event = await prisma.event.update({
      where: { id: params.id },
      data: {
        ...data,
        activities: {
          create: { userId: membership.userId, action: "updated" },
        },
      },
      include: baseInclude,
    });

    const actor = await prisma.user.findUnique({
      where: { id: membership.userId },
      select: { name: true, email: true },
    });
    const who = actor?.name || actor?.email || "Someone";
    const newIds = new Set(newUsers.map((u) => u.id));

    // Invite notifications for newly-added attendees.
    await Promise.all(
      newUsers.map((u) =>
        notify({
          userId: u.id,
          type: "EVENT_INVITE",
          eventId: event.id,
          actorId: membership.userId,
          message: `${who} invited you to “${event.title}”.`,
          recipientEmail: u.email,
          emailSubject: `Invitation: ${event.title}`,
        })
      )
    );

    // Update notifications for existing attendees (not the editor, not the new ones).
    if (eventChanged) {
      await Promise.all(
        (event.attendees as any[])
          .filter(
            (a) => a.user.id !== membership.userId && !newIds.has(a.user.id)
          )
          .map((a) =>
            notify({
              userId: a.user.id,
              type: "EVENT_UPDATED",
              eventId: event.id,
              actorId: membership.userId,
              message: `${who} updated “${event.title}”.`,
              recipientEmail: a.user.email,
              emailSubject: `Updated: ${event.title}`,
            })
          )
      );
    }

    return NextResponse.json({ event: serialize(event) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not update event" },
      { status: 500 }
    );
  }
}

/** DELETE /api/events/:id — creator, owner, or admin only; notifies attendees. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = await prisma.event.findUnique({
    where: { id: params.id },
    include: { attendees: { include: { user: userSelect } } },
  });
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

  const actor = await prisma.user.findUnique({
    where: { id: membership.userId },
    select: { name: true, email: true },
  });
  const who = actor?.name || actor?.email || "Someone";

  // Notify attendees BEFORE deletion (no eventId — it's about to be removed).
  await Promise.all(
    (existing.attendees as any[])
      .filter((a) => a.user.id !== membership.userId)
      .map((a) =>
        notify({
          userId: a.user.id,
          type: "EVENT_CANCELLED",
          eventId: null,
          actorId: membership.userId,
          message: `${who} cancelled “${existing.title}”.`,
          recipientEmail: a.user.email,
          emailSubject: `Cancelled: ${existing.title}`,
        })
      )
  );

  await prisma.event.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
