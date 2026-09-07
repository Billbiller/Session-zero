import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateInitiativeEntry, removeInitiativeEntry } from "@/lib/initiativeTracker";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  initiative: z.number().finite().optional(),
  hp: z.string().max(50).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; entryId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { entryId } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const entry = updateInitiativeEntry(entryId, auth.user.id, parsed.data);
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
    removeInitiativeEntry(entryId, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
