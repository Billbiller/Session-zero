import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createReply } from "@/lib/boards";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ body: z.string().trim().min(1).max(5000) });

// Replies are read server-side directly off lib/boards.ts's listReplies()
// on the thread detail page -- no GET here, only the write action.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ slug: string; threadId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { threadId } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const reply = createReply(threadId, auth.user.id, parsed.data.body);
    return NextResponse.json({ reply }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 404);
  }
}
