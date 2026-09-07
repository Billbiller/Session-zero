import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getCampaignRating,
  getCampaignRatingSummary,
  rateCampaign,
  canRateCampaign,
  CampaignRatingError,
  CAMPAIGN_RATING_TAGS,
} from "@/lib/campaignRatings";
import { getCurrentUser } from "@/lib/currentUser";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// Public: the aggregate campaign rating is informational for everyone
// deciding whether to join, same as the roster/character list already
// shown on this page -- not gated behind sign-in like the per-user
// ratings endpoint. Signed-in extras (canRate/existing) are added only
// when a viewer is present.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const summary = getCampaignRatingSummary(id);
  const viewer = await getCurrentUser();
  const canRate = viewer ? canRateCampaign(id, viewer.id) : false;
  const existing = viewer ? getCampaignRating(id, viewer.id) : null;
  return NextResponse.json({ summary, canRate, existing, tagOptions: CAMPAIGN_RATING_TAGS });
}

const bodySchema = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.string()).max(8).optional(),
});

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
    const rating = rateCampaign(id, auth.user.id, {
      stars: parsed.data.stars,
      tags: parsed.data.tags,
    });
    return NextResponse.json({ rating });
  } catch (err) {
    if (err instanceof CampaignRatingError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}
