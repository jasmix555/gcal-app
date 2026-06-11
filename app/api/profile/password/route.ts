import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/profile/password  Body: { currentPassword?, newPassword }
 * Sets a new password. If the account already has one, the current password
 * must be provided and correct.
 */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json();
  if (!newPassword || String(newPassword).length < 6) {
    return NextResponse.json(
      { error: "New password must be at least 6 characters." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.passwordHash) {
    const ok = await bcrypt.compare(
      String(currentPassword || ""),
      user.passwordHash
    );
    if (!ok) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return NextResponse.json({ ok: true });
}
