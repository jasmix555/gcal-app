import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, getMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function serialize(m: any) {
  return {
    id: m.id,
    title: m.title,
    content: m.content || "",
    groupId: m.groupId || null,
    remindAt: m.remindAt ? m.remindAt.toISOString() : null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/**
 * GET /api/memos
 *   ?timeMin=&timeMax=  → only memos with a reminder in that window (for the calendar)
 *   (no params)         → all of the current user's memos (for the notes panel)
 */
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");

  const where: any = { createdById: userId };
  if (timeMin || timeMax) {
    where.remindAt = {};
    if (timeMin) where.remindAt.gte = new Date(timeMin);
    if (timeMax) where.remindAt.lt = new Date(timeMax);
  }

  try {
    const memos = await prisma.memo.findMany({
      where,
      orderBy: timeMin || timeMax ? { remindAt: "asc" } : { updatedAt: "desc" },
    });
    return NextResponse.json({ memos: memos.map(serialize) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not load memos" },
      { status: 500 }
    );
  }
}

/** POST /api/memos — create a memo for the current user. */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json();
  const title = String(body.title || "").trim() || "Untitled";

  // Only link to a calendar the user actually belongs to.
  let groupId: string | null = null;
  if (body.groupId) {
    const membership = await getMembership(String(body.groupId));
    if (membership) groupId = String(body.groupId);
  }

  try {
    const memo = await prisma.memo.create({
      data: {
        title,
        content: body.content || "",
        groupId,
        remindAt: body.remindAt ? new Date(body.remindAt) : null,
        createdById: userId,
      },
    });
    return NextResponse.json({ memo: serialize(memo) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not create memo" },
      { status: 500 }
    );
  }
}
