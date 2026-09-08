import { NextRequest, NextResponse } from "next/server";
import { getCharacter } from "@/lib/characters";
import { getUserById } from "@/lib/auth";
import { getCampaign } from "@/lib/campaigns";
import { buildCharacterSheetText } from "@/lib/characterExport";

export const dynamic = "force-dynamic";

// Downloads a plain-text character sheet. No auth required and no
// hasPrivateAccess-style check -- a character's own fields (name,
// archetype, bio, backstory, status, epilogue) are already fully public
// via /players/[id] (see CharacterSummary), so this route just re-formats
// the same already-public data as a downloadable file, matching the
// text/calendar download precedent set by
// app/api/campaigns/[id]/calendar/route.ts.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const character = getCharacter(id);
  if (!character) {
    return NextResponse.json({ error: "Character not found." }, { status: 404 });
  }

  const owner = getUserById(character.user_id);
  const campaign = character.campaign_id ? getCampaign(character.campaign_id) : null;

  const text = buildCharacterSheetText({
    ownerName: owner?.display_name ?? "Unknown player",
    character,
    linkedCampaignTitle: campaign?.title ?? null,
  });

  const safeName = character.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const filename = `${safeName || "character"}.txt`;

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
