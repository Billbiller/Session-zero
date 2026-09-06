import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ratingTargetsFor,
  rateCampaignParticipant,
  RatingError,
  DM_RATING_TAGS,
  PLAYER_RATING_TAGS,
} from "@/lib/ratings";
import { getUserById } from "@/lib/auth";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const { role, targets } = ratingTargetsFor(id, auth.user.id);
  const enriched = targets.map((t) => ({
    ...t,
    displayName: getUserById(t.userId)?.display_name ?? "Unknown",
  }));
  // The rater rates the *other* role's tag set — a player picks from the
  // DM tag list (and vice versa), so send whichever list actually applies.
  const tagOptions = role === "dm" ? PLAYER_RATING_TAGS : DM_RATING_TAGS;
  return NextResponse.json({ role, targets: enriched, tagOptions });
}

const bodySchema = z.object({
  rateeId: z.string().min(1),
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
    const rating = rateCampaignParticipant(id, auth.user.id, parsed.data.rateeId, {
      stars: parsed.data.stars,
      tags: parsed.data.tags,
    });
    return NextResponse.json({ rating });
  } catch (err) {
    if (err instanceof RatingError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}
