import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ownerReview, SubPlacementError } from "@/lib/subPlacements";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  approve: z.boolean(),
  guardrailsNote: z.string().trim().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ placementId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { placementId } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const placement = ownerReview(placementId, auth.user.id, parsed.data);
    return NextResponse.json({ placement });
  } catch (err) {
    if (err instanceof SubPlacementError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}
