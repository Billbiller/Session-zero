import { describe, it, expect } from "vitest";
import {
  signUp,
  signIn,
  AuthError,
  createSession,
  getUserBySessionToken,
  destroySession,
} from "@/lib/auth";
import { isSiteAdmin } from "@/lib/access";

describe("signUp", () => {
  it("creates a new account", () => {
    const user = signUp("Alice", "alice@example.com", "correcthorse1");
    expect(user.display_name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");
    expect((user as unknown as Record<string, unknown>).password_hash).toBeUndefined();
  });

  it("normalizes email casing/whitespace", () => {
    const user = signUp("Bob", "  Bob@Example.com ", "correcthorse1");
    expect(user.email).toBe("bob@example.com");
  });

  it("rejects a duplicate email", () => {
    signUp("Carl", "carl@example.com", "correcthorse1");
    expect(() => signUp("Carlos", "carl@example.com", "correcthorse1")).toThrow(AuthError);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(() => signUp("Dana", "dana@example.com", "short")).toThrow(AuthError);
  });

  it("rejects a blank display name", () => {
    expect(() => signUp("   ", "blank@example.com", "correcthorse1")).toThrow(AuthError);
  });
});

describe("signIn", () => {
  it("succeeds with the correct password", () => {
    signUp("Eve", "eve@example.com", "correcthorse1");
    const user = signIn("eve@example.com", "correcthorse1");
    expect(user.email).toBe("eve@example.com");
  });

  it("is case/whitespace-insensitive on email", () => {
    signUp("Frank", "frank@example.com", "correcthorse1");
    const user = signIn("  Frank@Example.com ", "correcthorse1");
    expect(user.email).toBe("frank@example.com");
  });

  it("rejects an unknown email", () => {
    expect(() => signIn("nobody@example.com", "whatever1")).toThrow(AuthError);
  });

  it("rejects the wrong password", () => {
    signUp("Grace", "grace@example.com", "correcthorse1");
    expect(() => signIn("grace@example.com", "wrongpassword")).toThrow(AuthError);
  });
});

describe("ADMIN_EMAIL (backlog #48)", () => {
  // This is the only way to become a site admin -- see lib/auth.ts's
  // isAdminEmail() doc comment: there's no UI to grant it, so a fresh
  // account becomes an admin only if it's created while ADMIN_EMAIL
  // happens to match. Each test restores whatever value (or absence)
  // ADMIN_EMAIL had before it, since this file's tests share one process
  // and a stray leftover value would silently admin-ify later signups.
  function withAdminEmail(value: string | undefined, fn: () => void) {
    const original = process.env.ADMIN_EMAIL;
    if (value === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = value;
    try {
      fn();
    } finally {
      if (original === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = original;
    }
  }

  it("grants is_admin at signup when the email matches ADMIN_EMAIL, normalized the same way as sign-in", () => {
    withAdminEmail("  Admin@Example.com ", () => {
      const admin = signUp("Admin", "admin@example.com", "correcthorse1");
      expect(isSiteAdmin(admin.id)).toBe(true);
    });
  });

  it("does not grant is_admin to an account whose email doesn't match ADMIN_EMAIL", () => {
    withAdminEmail("admin2@example.com", () => {
      const user = signUp("NotAdmin", "notadmin2@example.com", "correcthorse1");
      expect(isSiteAdmin(user.id)).toBe(false);
    });
  });

  it("grants is_admin to nobody when ADMIN_EMAIL is unset", () => {
    withAdminEmail(undefined, () => {
      const user = signUp("Plain", "plain3@example.com", "correcthorse1");
      expect(isSiteAdmin(user.id)).toBe(false);
    });
  });

  it("isSiteAdmin is false for a stranger and for a signed-out (null) user id", () => {
    const user = signUp("Regular", "regular4@example.com", "correcthorse1");
    expect(isSiteAdmin(user.id)).toBe(false);
    expect(isSiteAdmin(null)).toBe(false);
    expect(isSiteAdmin("nonexistent-user-id")).toBe(false);
  });
});

describe("sessions", () => {
  it("creates and resolves a session token", () => {
    const user = signUp("Heidi", "heidi@example.com", "correcthorse1");
    const token = createSession(user.id);
    const resolved = getUserBySessionToken(token);
    expect(resolved?.id).toBe(user.id);
  });

  it("returns null for an unknown or missing token", () => {
    expect(getUserBySessionToken("nope")).toBeNull();
    expect(getUserBySessionToken(undefined)).toBeNull();
  });

  it("destroys a session so it can no longer resolve", () => {
    const user = signUp("Ivan", "ivan@example.com", "correcthorse1");
    const token = createSession(user.id);
    destroySession(token);
    expect(getUserBySessionToken(token)).toBeNull();
  });
});
