import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function canInvite(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

/** GET /api/groups/:id/invitations — pending invites for the group. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const membership = await getMembership(params.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const invitations = await prisma.invitation.findMany({
    where: { groupId: params.id, status: "pending" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      token: i.token,
      createdAt: i.createdAt,
    })),
  });
}

/** POST /api/groups/:id/invitations — invite someone by email. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const membership = await getMembership(params.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  if (!canInvite(membership.role)) {
    return NextResponse.json(
      { error: "Only owners and admins can invite." },
      { status: 403 }
    );
  }

  const { email, role } = await req.json();
  if (!email || !String(email).trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const normalizedEmail = String(email).toLowerCase().trim();

  // Already a member?
  const existingMember = await prisma.membership.findFirst({
    where: { groupId: params.id, user: { email: normalizedEmail } },
  });
  if (existingMember) {
    return NextResponse.json(
      { error: "That person is already a member." },
      { status: 409 }
    );
  }

  // Already invited (pending)?
  const existingInvite = await prisma.invitation.findFirst({
    where: { groupId: params.id, email: normalizedEmail, status: "pending" },
  });
  if (existingInvite) {
    return NextResponse.json(
      { error: "An invitation has already been sent to that email." },
      { status: 409 }
    );
  }

  const token = randomBytes(24).toString("hex");
  const invitation = await prisma.invitation.create({
    data: {
      email: normalizedEmail,
      groupId: params.id,
      role: role === "ADMIN" ? "ADMIN" : "MEMBER",
      token,
      invitedById: membership.userId,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "";
  return NextResponse.json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      token: invitation.token,
      // Share this link with the invitee (no email service configured yet).
      inviteLink: `${baseUrl}/invite/${invitation.token}`,
    },
  });
}
