import { NextRequest, NextResponse } from "next/server";
import { cancelPlacement, SubPlacementError } from "@/lib/subPlacements";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ placementId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { placementId } = await ctx.params;
  try {
    const placement = cancelPlacement(placementId, auth.user.id);
    return NextResponse.json({ placement });
  } catch (err) {
    if (err instanceof SubPlacementError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}
