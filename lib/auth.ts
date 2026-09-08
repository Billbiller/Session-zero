import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import db from "./db";
import type { User } from "./types";

export const SESSION_COOKIE_NAME = "sz_session";

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export class AuthError extends Error {}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getUserByEmail(email: string): (User & { password_hash: string }) | null {
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizeEmail(email)) as (User & { password_hash: string }) | undefined;
  return row ?? null;
}

// Backlog #48: the only way to become a site admin -- there's no UI to
// grant/revoke it, and no human is available in this sandbox to configure
// one by hand. Following the exact SQLITE_DB_PATH env-var convention
// already established in lib/db.ts: whoever signs up with an email
// matching ADMIN_EMAIL (compared the same normalized way as every other
// email in this file) becomes an admin automatically, at account
// creation only -- this does not retroactively promote an
// already-existing account if ADMIN_EMAIL is set later. Since this env
// var is unset in this sandbox, nobody actually becomes an admin by
// running the test suite or a smoke test here; the real owner would need
// ADMIN_EMAIL set in whatever hosting environment backlog #3 eventually
// picks for this to take effect for real. See claude/progress.md's dated
// session log entry for the full reasoning.
function isAdminEmail(email: string): boolean {
  const configured = process.env.ADMIN_EMAIL;
  if (!configured) return false;
  return normalizeEmail(configured) === normalizeEmail(email);
}

/** Creates a brand-new account. Throws AuthError if the email is already taken. */
export function signUp(displayName: string, email: string, password: string): User {
  const trimmedName = displayName.trim();
  if (!trimmedName) throw new AuthError("Display name is required.");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (getUserByEmail(email)) {
    throw new AuthError("An account with this email already exists. Try signing in instead.");
  }
  const id = uuidv4();
  const created_at = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, display_name, email, password_hash, is_admin, created_at)
     VALUES (@id, @display_name, @email, @password_hash, @is_admin, @created_at)`
  ).run({
    id,
    display_name: trimmedName,
    email: normalizeEmail(email),
    password_hash: bcrypt.hashSync(password, BCRYPT_ROUNDS),
    is_admin: isAdminEmail(email) ? 1 : 0,
    created_at,
  });
  return { id, display_name: trimmedName, email: normalizeEmail(email), created_at };
}

/** Verifies credentials for an existing account. Throws AuthError on any mismatch. */
export function signIn(email: string, password: string): User {
  const user = getUserByEmail(email);
  if (!user) {
    throw new AuthError("No account found with that email. Try creating one instead.");
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    throw new AuthError("Incorrect password.");
  }
  return {
    id: user.id,
    display_name: user.display_name,
    email: user.email,
    created_at: user.created_at,
  };
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
      `SELECT users.id, users.display_name, users.email, users.created_at FROM sessions
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
  const row = db
    .prepare("SELECT id, display_name, email, created_at FROM users WHERE id = ?")
    .get(userId) as User | undefined;
  return row ?? null;
}
