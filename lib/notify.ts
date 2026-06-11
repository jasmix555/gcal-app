import { prisma } from "@/lib/prisma";

type NotificationType =
  | "EVENT_INVITE"
  | "EVENT_UPDATED"
  | "EVENT_CANCELLED"
  | "RSVP_ACCEPTED"
  | "RSVP_DECLINED"
  | "TIME_PROPOSED";

interface NotifyOpts {
  userId: string; // recipient
  type: NotificationType;
  message: string;
  eventId?: string | null;
  actorId?: string | null;
  // Accepted for call-site compatibility but unused (email was removed).
  recipientEmail?: string | null;
  emailSubject?: string;
}

/** Create an in-app notification for a user. */
export async function notify(opts: NotifyOpts) {
  await prisma.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type as any,
      message: opts.message,
      eventId: opts.eventId ?? null,
      actorId: opts.actorId ?? null,
    },
  });
}
