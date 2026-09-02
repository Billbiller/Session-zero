import { describe, it, expect } from "vitest";
import {
  findOrCreateUser,
  createSession,
  getUserBySessionToken,
  destroySession,
} from "@/lib/auth";

describe("auth", () => {
  it("creates a new user on first sign-in", () => {
    const user = findOrCreateUser("Alice", "alice@example.com");
    expect(user.display_name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");
  });

  it("normalizes email casing/whitespace and reuses the same user", () => {
    const first = findOrCreateUser("Bob", "  Bob@Example.com ");
    const second = findOrCreateUser("Bob", "bob@example.com");
    expect(second.id).toBe(first.id);
  });

  it("updates display name if it changes on a later sign-in", () => {
    const first = findOrCreateUser("Carl", "carl@example.com");
    const second = findOrCreateUser("Carlos", "carl@example.com");
    expect(second.id).toBe(first.id);
    expect(second.display_name).toBe("Carlos");
  });

  it("creates and resolves a session token", () => {
    const user = findOrCreateUser("Dana", "dana@example.com");
    const token = createSession(user.id);
    const resolved = getUserBySessionToken(token);
    expect(resolved?.id).toBe(user.id);
  });

  it("returns null for an unknown or missing token", () => {
    expect(getUserBySessionToken("nope")).toBeNull();
    expect(getUserBySessionToken(undefined)).toBeNull();
  });

  it("destroys a session so it can no longer resolve", () => {
    const user = findOrCreateUser("Eve", "eve@example.com");
    const token = createSession(user.id);
    destroySession(token);
    expect(getUserBySessionToken(token)).toBeNull();
  });
});
