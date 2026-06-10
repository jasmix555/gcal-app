import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Short, URL-safe, human-shareable code (e.g. "k7Qe2rXa9").
function makeCode() {
  return randomBytes(7).toString("base64url");
}

/**
 * GET /api/groups/:id/invite-link
 * Returns the group's reusable join link + code (creates one if missing).
 * Owners and admins only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const membership = await getMembership(params.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only owners and admins can manage the invite link." },
      { status: 403 }
    );
  }

  let group = await prisma.group.findUnique({ where: { id: params.id } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!group.joinCode) {
    group = await prisma.group.update({
      where: { id: params.id },
      data: { joinCode: makeCode() },
    });
  }

  const baseUrl = process.env.NEXTAUTH_URL || "";
  return NextResponse.json({
    code: group.joinCode,
    url: `${baseUrl}/join/${group.joinCode}`,
    groupName: group.name,
  });
}
