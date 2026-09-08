import { NextRequest, NextResponse } from "next/server";
import { duplicateCampaign } from "@/lib/campaigns";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// Backlog #47: a DM-only "duplicate this campaign" action -- see
// lib/campaigns.ts's duplicateCampaign() doc comment for exactly what
// does and doesn't carry over. Returns the newly created campaign so the
// client can navigate straight to it.
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  try {
    const campaign = duplicateCampaign(id, auth.user.id);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
