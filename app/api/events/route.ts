import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/permissions";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

const userSelect = {
  select: { id: true, name: true, email: true, image: true },
};

const eventInclude = {
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
      status: a.status,
      proposedStart: a.proposedStart ? a.proposedStart.toISOString() : null,
      proposedEnd: a.proposedEnd ? a.proposedEnd.toISOString() : null,
    })),
  };
}

/**
 * GET /api/events?groupIds=a,b,c&timeMin=&timeMax=
 * (single ?groupId= still supported). Returns events from every requested
 * calendar the current user is actually a member of.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("groupIds") || searchParams.get("groupId") || "";
  const requestedIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (requestedIds.length === 0) {
    return NextResponse.json({ events: [] });
  }

  // Keep only calendars the user belongs to.
  const memberships = await Promise.all(
    requestedIds.map(async (id) => ((await getMembership(id)) ? id : null))
  );
  const allowedIds = memberships.filter(Boolean) as string[];
  if (allowedIds.length === 0) {
    return NextResponse.json({ events: [] });
  }

  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");

  // Overlap filter: event starts before the window ends and ends after it starts.
  const where: any = { groupId: { in: allowedIds } };
  if (timeMin) where.end = { gt: new Date(timeMin) };
  if (timeMax) where.start = { lt: new Date(timeMax) };

  try {
    const events = await prisma.event.findMany({
      where,
      include: eventInclude,
      orderBy: { start: "asc" },
    });
    return NextResponse.json({ events: events.map(serialize) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not load events" },
      { status: 500 }
    );
  }
}

/** POST /api/events — create an event in a group the user belongs to. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const groupId = body.groupId;
  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const membership = await getMembership(groupId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  if (!body.title || !body.start || !body.end) {
    return NextResponse.json(
      { error: "title, start and end are required." },
      { status: 400 }
    );
  }

  // Resolve attendee emails to registered users (excluding the creator).
  const emails: string[] = Array.isArray(body.attendees)
    ? body.attendees.map((e: string) => String(e).toLowerCase().trim())
    : [];
  const attendeeUsers = emails.length
    ? (await prisma.user.findMany({ where: { email: { in: emails } } })).filter(
        (u) => u.id !== membership.userId
      )
    : [];

  try {
    const event = await prisma.event.create({
      data: {
        groupId,
        title: String(body.title),
        description: body.description || null,
        location: body.location || null,
        color: body.color || null,
        start: new Date(body.start),
        end: new Date(body.end),
        allDay: !!body.allDay,
        createdById: membership.userId,
        activities: {
          create: { userId: membership.userId, action: "created" },
        },
        attendees: {
          create: attendeeUsers.map((u) => ({ userId: u.id })),
        },
      },
      include: eventInclude,
    });

    // Notify each invited attendee.
    const creator = await prisma.user.findUnique({
      where: { id: membership.userId },
      select: { name: true, email: true },
    });
    const who = creator?.name || creator?.email || "Someone";
    await Promise.all(
      attendeeUsers.map((u) =>
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

    return NextResponse.json({ event: serialize(event) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not create event" },
      { status: 500 }
    );
  }
}
