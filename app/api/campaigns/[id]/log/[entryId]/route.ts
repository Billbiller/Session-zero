import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateEntry, deleteEntry } from "@/lib/sessionLog";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ content: z.string().trim().min(1) });

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; entryId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { entryId } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const entry = updateEntry(entryId, auth.user.id, parsed.data.content);
    return NextResponse.json({ entry });
  } catch (err) {
    return errorResponse(err, 403);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; entryId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { entryId } = await ctx.params;
  try {
    deleteEntry(entryId, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
