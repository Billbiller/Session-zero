import { NextRequest, NextResponse } from "next/server";
import { endSub, SubPlacementError } from "@/lib/subPlacements";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  try {
    endSub(id, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SubPlacementError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}
