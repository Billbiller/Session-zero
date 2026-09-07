import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateNpcNote, deleteNpcNote } from "@/lib/npcNotes";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; noteId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { noteId } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const npc = updateNpcNote(noteId, auth.user.id, parsed.data);
    return NextResponse.json({ npc });
  } catch (err) {
    return errorResponse(err, 403);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; noteId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { noteId } = await ctx.params;
  try {
    deleteNpcNote(noteId, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
