import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listNpcNotes, addNpcNote } from "@/lib/npcNotes";
import { isDm } from "@/lib/access";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// DM-only -- see lib/access.ts's isDm() and backlog #33's own design
// note: NPC quick-notes are a prep tool for the DM's eyes, not shown to
// the party.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!isDm(auth.user.id, id)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  return NextResponse.json({ npcs: listNpcNotes(id) });
}

const addSchema = z.object({
  name: z.string().trim().min(1).max(100),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = addSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const npc = addNpcNote(id, auth.user.id, parsed.data);
    return NextResponse.json({ npc }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
