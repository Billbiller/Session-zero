import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPlacement, listPlacementsForRequest, SubPlacementError } from "@/lib/subPlacements";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// Public, matching the sub request itself -- placement status (pending
// review / confirmed / declined) is informational for the whole party,
// not restricted to the owner/DM. Only the review/cancel actions below
// are access-checked.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ placements: listPlacementsForRequest(id) });
  } catch (err) {
    if (err instanceof SubPlacementError) return errorResponse(err, 404);
    return errorResponse(err, 500);
  }
}

const bodySchema = z.object({ volunteerId: z.string().trim().min(1) });

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
    const placement = createPlacement(id, auth.user.id, parsed.data.volunteerId);
    return NextResponse.json({ placement }, { status: 201 });
  } catch (err) {
    if (err instanceof SubPlacementError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}
