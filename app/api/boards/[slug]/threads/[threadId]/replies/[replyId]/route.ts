import { NextRequest, NextResponse } from "next/server";
import { deleteReply } from "@/lib/boards";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// Self-moderation only, same boundary as DELETE /api/boards/[slug]/
// threads/[threadId] -- see that route's own comment.
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ slug: string; threadId: string; replyId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { replyId } = await ctx.params;
  try {
    deleteReply(replyId, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
