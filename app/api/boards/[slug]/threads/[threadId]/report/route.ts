import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reportThread } from "@/lib/boards";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

// Backlog #48: files a report against a thread for a site admin to review
// at /admin/boards -- any signed-in user, once per thread (a second
// report from the same user 403s via BoardError, see lib/boards.ts's
// reportThread). Reporting itself has no moderation power on its own;
// only an admin's own delete action (the existing DELETE route on this
// same thread) actually removes anything.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ slug: string; threadId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { threadId } = await ctx.params;
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    reportThread(threadId, auth.user.id, parsed.data.reason);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
