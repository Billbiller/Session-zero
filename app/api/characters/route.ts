import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCharacter,
  listCharactersForUser,
  CharacterError,
  CHARACTER_AVATARS,
} from "@/lib/characters";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ characters: listCharactersForUser(auth.user.id) });
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  archetype: z.string().max(150).optional(),
  bio: z.string().max(1000).optional(),
  backstory: z.string().max(4000).optional(),
  avatarEmoji: z.enum(CHARACTER_AVATARS).optional(),
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
