import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  updateCharacter,
  deleteCharacter,
  CharacterError,
  CHARACTER_AVATARS,
} from "@/lib/characters";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  archetype: z.string().max(150).optional(),
  bio: z.string().max(1000).optional(),
  backstory: z.string().max(4000).optional(),
  avatarEmoji: z.enum(CHARACTER_AVATARS).optional(),
  // undefined = leave the campaign link unchanged; null = unlink; a
  // campaign id = link/re-link (access-checked in lib/characters.ts).
  campaignId: z.string().min(1).nullable().optional(),
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
