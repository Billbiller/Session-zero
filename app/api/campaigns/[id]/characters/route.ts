import { NextRequest, NextResponse } from "next/server";
import { listCharactersForCampaign } from "@/lib/characters";

export const dynamic = "force-dynamic";

// Read-only and public, matching the roster it sits next to on the campaign
// detail page — creating/editing a character always goes through the
// account-level /api/characters (and /api/characters/[id]) routes, which
// enforce the DM/active-member check before letting a campaign link stick.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  return NextResponse.json({ characters: listCharactersForCampaign(id) });
}
