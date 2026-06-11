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

async function ownMemo(id: string) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Not signed in", status: 401 as const };
  const memo = await prisma.memo.findUnique({ where: { id } });
  if (!memo || memo.createdById !== userId) {
    return { error: "Memo not found", status: 404 as const };
  }
  return { userId, memo };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const r = await ownMemo(params.id);
  if ("error" in r) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json({ memo: serialize(r.memo) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const r = await ownMemo(params.id);
  if ("error" in r) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }

  const body = await req.json();
  const data: any = {};
  if (body.title !== undefined)
    data.title = String(body.title).trim() || "Untitled";
  if (body.content !== undefined) data.content = body.content || "";
  if (body.remindAt !== undefined)
    data.remindAt = body.remindAt ? new Date(body.remindAt) : null;
  if (body.groupId !== undefined) {
    if (body.groupId) {
      const membership = await getMembership(String(body.groupId));
      data.groupId = membership ? String(body.groupId) : null;
    } else {
      data.groupId = null;
    }
  }

  try {
    const memo = await prisma.memo.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ memo: serialize(memo) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not update memo" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const r = await ownMemo(params.id);
  if ("error" in r) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  await prisma.memo.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
