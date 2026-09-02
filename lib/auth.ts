import { v4 as uuidv4 } from "uuid";
import db from "./db";
import type { User } from "./types";

export const SESSION_COOKIE_NAME = "sz_session";

export function findOrCreateUser(displayName: string, email: string): User {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizedEmail) as User | undefined;
  if (existing) {
    if (existing.display_name !== displayName.trim()) {
      db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(
        displayName.trim(),
        existing.id
      );
      existing.display_name = displayName.trim();
    }
    return existing;
  }
  const user: User = {
    id: uuidv4(),
    display_name: displayName.trim(),
    email: normalizedEmail,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO users (id, display_name, email, created_at) VALUES (@id, @display_name, @email, @created_at)"
  ).run(user);
  return user;
}

export function createSession(userId: string): string {
  const token = uuidv4();
  db.prepare(
    "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)"
  ).run(token, userId, new Date().toISOString());
  return token;
}

export function getUserBySessionToken(token: string | undefined | null): User | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    )
    .get(token) as User | undefined;
  return row ?? null;
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserById(userId: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as
    | User
    | undefined;
  return row ?? null;
}
