import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { expandOccurrences } from "@/lib/recurrence";

export const dynamic = "force-dynamic";

const userSelect = {
  select: { id: true, name: true, email: true, image: true },
};

const eventInclude = {
  createdBy: userSelect,
  updatedBy: userSelect,
  attendees: { include: { user: userSelect } },
};

const FREQS = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
function normalizeFreq(v: any): string | null {
  const s = String(v || "").toUpperCase();
  return FREQS.includes(s) ? s : null;
}

/**
 * Serialize an event. Pass `occ` to render a specific recurrence occurrence
 * (its id becomes unique while `seriesId` keeps pointing at the master).
 */
function serialize(
  e: any,
  occ?: { start: number; end: number; index: number }
) {
  return {
    id: occ ? `${e.id}::${occ.index}` : e.id,
    seriesId: e.id,
    recurring: !!e.recurrence,
    recurrence: e.recurrence || null,
    recurrenceUntil: e.recurrenceUntil ? e.recurrenceUntil.toISOString() : null,
    recurrenceCount: e.recurrenceCount ?? null,
    groupId: e.groupId,
    title: e.title,
    description: e.description || "",
    location: e.location || "",
    color: e.color || null,
    start: occ ? new Date(occ.start).toISOString() : e.start.toISOString(),
    end: occ ? new Date(occ.end).toISOString() : e.end.toISOString(),
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
  const tMin = timeMin
    ? new Date(timeMin)
    : new Date(Date.now() - 366 * 86400000);
  const tMax = timeMax
    ? new Date(timeMax)
    : new Date(Date.now() + 366 * 86400000);

  // Non-recurring events that overlap the window, OR recurring masters that
  // start before the window ends and haven't fully ended before it.
  const where: any = {
    groupId: { in: allowedIds },
    OR: [
      { recurrence: null, end: { gt: tMin }, start: { lt: tMax } },
      {
        recurrence: { not: null },
        start: { lt: tMax },
        OR: [{ recurrenceUntil: null }, { recurrenceUntil: { gte: tMin } }],
      },
    ],
  };

  try {
    const events = await prisma.event.findMany({
      where,
      include: eventInclude,
      orderBy: { start: "asc" },
    });

    const out: any[] = [];
    for (const e of events) {
      if (!e.recurrence) {
        out.push(serialize(e));
        continue;
      }
      const occs = expandOccurrences(
        e.start.getTime(),
        e.end.getTime(),
        e.recurrence,
        e.recurrenceUntil ? e.recurrenceUntil.getTime() : null,
        e.recurrenceCount ?? null,
        tMin.getTime(),
        tMax.getTime()
      );
      for (const o of occs) out.push(serialize(e, o));
    }
    return NextResponse.json({ events: out });
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
        recurrence: normalizeFreq(body.recurrence),
        recurrenceUntil: body.recurrenceUntil
          ? new Date(body.recurrenceUntil)
          : null,
        recurrenceCount: body.recurrenceCount
          ? Number(body.recurrenceCount)
          : null,
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
