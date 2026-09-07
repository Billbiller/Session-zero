import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSubRequest, listSubRequestsForCampaign, SubRequestError } from "@/lib/subRequests";
import { getCurrentUser } from "@/lib/currentUser";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// Public, like the roster and character list already shown on the same
// campaign page -- inviting an outside volunteer is the whole point of
// this feature, so there's no access gate on reading it.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const viewer = await getCurrentUser();
  return NextResponse.json({ requests: listSubRequestsForCampaign(id, viewer?.id ?? null) });
}

const bodySchema = z.object({ note: z.string().trim().max(500).default("") });

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const subRequest = createSubRequest(id, auth.user.id, parsed.data.note);
    return NextResponse.json({ request: subRequest }, { status: 201 });
  } catch (err) {
    if (err instanceof SubRequestError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}
