import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCharacter,
  listCharactersForUser,
  CharacterError,
  CHARACTER_AVATARS,
  CHARACTER_STATUSES,
} from "@/lib/characters";
import { ABILITY_SCORES_5E, SKILLS_5E } from "@/lib/types";
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


// Backlog #56: full shape/range validation for a 5e stat block, mirroring
// lib/sheet5e.ts's validateSheet5e() rule-for-rule -- defense in depth,
// matching this app's existing double-validation convention (see
// portraitDataUrl's own comment above). The 5e-only-if-linked gate itself
// is enforced in lib/characters.ts, not here, since it needs to check
// against whatever campaignId this same request resolves to.
const sheet5eSchema = z
  .object({
    abilityScores: z.object({
      str: z.number().int().min(1).max(30),
      dex: z.number().int().min(1).max(30),
      con: z.number().int().min(1).max(30),
      int: z.number().int().min(1).max(30),
      wis: z.number().int().min(1).max(30),
      cha: z.number().int().min(1).max(30),
    }),
    proficiencyBonus: z.number().int().min(2).max(6),
    savingThrowProficiencies: z.array(z.enum(ABILITY_SCORES_5E)),
    skillProficiencies: z.array(z.enum(SKILLS_5E)),
    armorClass: z.number().int().min(0).max(40),
    hitPointsMax: z.number().int().min(0),
    hitPointsCurrent: z.number().int().min(0),
    hitDice: z.string().max(20),
    equipment: z.string().max(2000),
    spellSlots: z.array(z.number().int().min(0).max(20)).length(9),
  })
  .nullable()
  .optional();

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
  sheet5e: sheet5eSchema,
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
