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

/** GET /api/events?groupId=&timeMin=&timeMax= — events for a group in range. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const membership = await getMembership(groupId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");

  // Overlap filter: event starts before the window ends and ends after it starts.
  const where: any = { groupId };
  if (timeMin) where.end = { gt: new Date(timeMin) };
  if (timeMax) where.start = { lt: new Date(timeMax) };

  try {
    const events = await prisma.event.findMany({
      where,
      include: { createdBy: userSelect, updatedBy: userSelect },
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
      },
      include: { createdBy: userSelect, updatedBy: userSelect },
    });
    return NextResponse.json({ event: serialize(event) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not create event" },
      { status: 500 }
    );
  }
}
