import { describe, it, expect } from "vitest";
import {
  signUp,
  signIn,
  AuthError,
  createSession,
  getUserBySessionToken,
  destroySession,
} from "@/lib/auth";

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
