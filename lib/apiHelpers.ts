import { NextResponse } from "next/server";
import { getCurrentUser } from "./currentUser";
import type { User } from "./types";

export async function requireUser(): Promise<
  { user: User } | { error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  return { user };
}

export function errorResponse(err: unknown, fallbackStatus = 400): NextResponse {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}
