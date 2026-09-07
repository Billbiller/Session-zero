import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCharacter,
  listCharactersForUser,
  CharacterError,
  CHARACTER_AVATARS,
  CHARACTER_STATUSES,
} from "@/lib/characters";
import { getCampaign } from "@/lib/campaigns";
import { getUserById } from "@/lib/auth";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  // Enrich with the linked campaign's current title (if any) so the
  // profile page can show/link to it without needing a separate lookup,
  // and so it's accurate even for a campaign the user has since left.
  const characters = listCharactersForUser(auth.user.id).map((c) => ({
    ...c,
    campaignTitle: c.campaign_id ? (getCampaign(c.campaign_id)?.title ?? null) : null,
    // Who's currently piloting this character in the owner's place, if
    // anyone (backlog #20 phase 2) -- resolved here for the same reason
    // campaignTitle is: the profile page shouldn't need a separate lookup.
    pilotName: c.temp_pilot_user_id
      ? (getUserById(c.temp_pilot_user_id)?.display_name ?? null)
      : null,
  }));
  return NextResponse.json({ characters });
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  archetype: z.string().max(150).optional(),
  bio: z.string().max(1000).optional(),
  backstory: z.string().max(4000).optional(),
  avatarEmoji: z.enum(CHARACTER_AVATARS).optional(),
  // A campaign to link this character to (must be one the creator has
  // DM/active-member access to — enforced in lib/characters.ts, not here).
  campaignId: z.string().min(1).nullable().optional(),
  status: z.enum(CHARACTER_STATUSES).optional(),
  epilogue: z.string().max(2000).optional(),
  // Shape/size validated again in lib/characters.ts (the source of truth);
  // this cap just rejects an obviously-oversized payload before it's parsed.
  portraitDataUrl: z.string().max(300000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const character = createCharacter(auth.user.id, parsed.data);
    return NextResponse.json({ character }, { status: 201 });
  } catch (err) {
    if (err instanceof CharacterError) return errorResponse(err);
    return errorResponse(err, 500);
  }
}
