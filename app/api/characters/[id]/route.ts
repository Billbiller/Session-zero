import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  updateCharacter,
  deleteCharacter,
  CharacterError,
  CHARACTER_AVATARS,
  CHARACTER_STATUSES,
} from "@/lib/characters";
import { ABILITY_SCORES_5E, SKILLS_5E } from "@/lib/types";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";


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
  name: z.string().trim().min(1).max(100).optional(),
  archetype: z.string().max(150).optional(),
  bio: z.string().max(1000).optional(),
  backstory: z.string().max(4000).optional(),
  avatarEmoji: z.enum(CHARACTER_AVATARS).optional(),
  // undefined = leave the campaign link unchanged; null = unlink; a
  // campaign id = link/re-link (access-checked in lib/characters.ts).
  campaignId: z.string().min(1).nullable().optional(),
  status: z.enum(CHARACTER_STATUSES).optional(),
  epilogue: z.string().max(2000).optional(),
  // undefined = leave the portrait unchanged; null = remove it; a data:
  // URL = set/replace it. Shape/size re-validated in lib/characters.ts.
  portraitDataUrl: z.string().max(300000).nullable().optional(),
  sheet5e: sheet5eSchema,
});

export async function PATCH(
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
    const character = updateCharacter(id, auth.user.id, parsed.data);
    return NextResponse.json({ character });
  } catch (err) {
    if (err instanceof CharacterError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  try {
    deleteCharacter(id, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CharacterError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}
