import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/events/:id/rsvp
 * Body: { status: "ACCEPTED" | "DECLINED" | "PROPOSED", proposedStart?, proposedEnd? }
 * The current user (an invited attendee) responds; the organizer is notified.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { status, proposedStart, proposedEnd } = await req.json();
  if (!["ACCEPTED", "DECLINED", "PROPOSED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const attendee = await prisma.eventAttendee.findUnique({
    where: { eventId_userId: { eventId: params.id, userId } },
    include: { event: { select: { title: true, createdById: true } } },
  });
  if (!attendee) {
    return NextResponse.json(
      { error: "You're not invited to this event." },
      { status: 403 }
    );
  }

  await prisma.eventAttendee.update({
    where: { eventId_userId: { eventId: params.id, userId } },
    data: {
      status,
      proposedStart:
        status === "PROPOSED" && proposedStart ? new Date(proposedStart) : null,
      proposedEnd:
        status === "PROPOSED" && proposedEnd ? new Date(proposedEnd) : null,
    },
  });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const who = me?.name || me?.email || "Someone";
  const organizerId = attendee.event.createdById;

  if (organizerId && organizerId !== userId) {
    const organizer = await prisma.user.findUnique({
      where: { id: organizerId },
      select: { email: true },
    });
    const verb =
      status === "ACCEPTED"
        ? "accepted"
        : status === "DECLINED"
          ? "declined"
          : "proposed a new time for";
    const type =
      status === "ACCEPTED"
        ? "RSVP_ACCEPTED"
        : status === "DECLINED"
          ? "RSVP_DECLINED"
          : "TIME_PROPOSED";
    await notify({
      userId: organizerId,
      type: type as any,
      eventId: params.id,
      actorId: userId,
      message: `${who} ${verb} “${attendee.event.title}”.`,
      recipientEmail: organizer?.email,
      emailSubject: `RSVP: ${attendee.event.title}`,
    });
  }

  return NextResponse.json({ ok: true });
}
