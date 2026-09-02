import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, getUserBySessionToken } from "./auth";
import type { User } from "./types";

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return getUserBySessionToken(token);
}
