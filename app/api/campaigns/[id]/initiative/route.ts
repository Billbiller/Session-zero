import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listInitiativeEntries,
  addInitiativeEntry,
  clearInitiativeEntries,
} from "@/lib/initiativeTracker";
import { isDm } from "@/lib/access";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// DM-only -- see lib/access.ts's isDm() and backlog #33's own design
// note: the initiative tracker and NPC notes are prep/running tools for
// the DM's eyes, not shared with the rest of the party the way
// session log/party notes/schedule are.
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
  return NextResponse.json({ entries: listInitiativeEntries(id) });
}

const addSchema = z.object({
  name: z.string().trim().min(1).max(100),
  initiative: z.number().finite(),
  hp: z.string().max(50).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
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
    const entry = addInitiativeEntry(id, auth.user.id, parsed.data);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 403);
  }
}

// Clears the whole tracker -- the explicit "clear" action backlog #33's
// own text calls for, distinct from removing entries one at a time
// (DELETE on a single entry lives at .../initiative/[entryId]).
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  try {
    clearInitiativeEntries(id, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
