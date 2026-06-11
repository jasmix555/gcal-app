import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/groups/:id/members/:userId
 * Remove a member from the group.
 * - Requester must be OWNER or ADMIN.
 * - The OWNER can never be removed.
 * - An ADMIN can only remove MEMBERs (not other admins).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const me = await getMembership(params.id);
  if (!me) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Removing yourself = leaving the group (allowed for non-owners).
  const isSelf = params.userId === me.userId;
  if (!isSelf && me.role !== "OWNER" && me.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only owners and admins can remove members." },
      { status: 403 }
    );
  }

  const target = await prisma.membership.findUnique({
    where: { userId_groupId: { userId: params.userId, groupId: params.id } },
  });
  if (!target) {
    return NextResponse.json(
      { error: "That person isn't in this group." },
      { status: 404 }
    );
  }
  if (target.role === "OWNER") {
    return NextResponse.json(
      {
        error: isSelf
          ? "Owners can't leave their own group — delete it instead."
          : "The group owner can't be removed.",
      },
      { status: 403 }
    );
  }
  if (!isSelf && me.role === "ADMIN" && target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Admins can't remove other admins." },
      { status: 403 }
    );
  }

  await prisma.membership.delete({
    where: { userId_groupId: { userId: params.userId, groupId: params.id } },
  });
  return NextResponse.json({ ok: true });
}
