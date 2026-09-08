import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reportReply } from "@/lib/boards";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

// Same as POST /api/boards/[slug]/threads/[threadId]/report, one level
// down -- see that route's own comment.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ slug: string; threadId: string; replyId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { replyId } = await ctx.params;
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    reportReply(replyId, auth.user.id, parsed.data.reason);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
