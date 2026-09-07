import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { moveInitiativeEntry } from "@/lib/initiativeTracker";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ direction: z.enum(["up", "down"]) });

// A simple move-up/move-down swap with the adjacent entry -- deliberately
// not drag-and-drop, matching backlog #33's own "basics" scope.
export async function POST(
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
    const entries = moveInitiativeEntry(entryId, auth.user.id, parsed.data.direction);
    return NextResponse.json({ entries });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
