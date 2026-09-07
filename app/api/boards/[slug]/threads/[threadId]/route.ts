import { NextRequest, NextResponse } from "next/server";
import { deleteThread } from "@/lib/boards";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// Self-moderation only (backlog #37's own scope) -- the thread's own
// author can delete it (and its replies); there's no admin/report system
// yet, and no DM-style backstop moderator the way campaign resources
// have, since boards aren't campaign-scoped. Thread detail itself is
// server-rendered directly off lib/boards.ts (see app/boards/[slug]/
// [threadId]/page.tsx), so this route only needs to handle the delete
// action -- no GET here, matching /systems/[slug]'s "pure read, no API
// mirror" convention for the read side.
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ slug: string; threadId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { threadId } = await ctx.params;
  try {
    deleteThread(threadId, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
