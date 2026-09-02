import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { findOrCreateUser, createSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required."),
  email: z.string().trim().email("A valid email is required."),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const user = findOrCreateUser(parsed.data.displayName, parsed.data.email);
  const token = createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ user });
}
