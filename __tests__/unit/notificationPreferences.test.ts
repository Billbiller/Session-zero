import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { getPreferences, isEnabled, setPreference } from "@/lib/notificationPreferences";
import { NOTIFICATION_TYPES } from "@/lib/types";

describe("notificationPreferences", () => {
  it("defaults every type to enabled for a brand-new user with no rows", () => {
    const user = signUp("Alice", "np1@example.com", "testpassword123");
    const prefs = getPreferences(user.id);
    for (const type of NOTIFICATION_TYPES) {
      expect(prefs[type]).toBe(true);
    }
    expect(isEnabled(user.id, "join_requested")).toBe(true);
  });

  it("lets a user mute a single type without affecting others", () => {
    const user = signUp("Bob", "np2@example.com", "testpassword123");
    setPreference(user.id, "party_notes_updated", false);
    const prefs = getPreferences(user.id);
    expect(prefs.party_notes_updated).toBe(false);
    expect(prefs.join_requested).toBe(true);
    expect(isEnabled(user.id, "party_notes_updated")).toBe(false);
  });

  it("lets a user re-enable a previously muted type", () => {
    const user = signUp("Carl", "np3@example.com", "testpassword123");
    setPreference(user.id, "session_log_posted", false);
    setPreference(user.id, "session_log_posted", true);
    expect(isEnabled(user.id, "session_log_posted")).toBe(true);
  });

  it("does not affect preferences of a different user", () => {
    const a = signUp("A", "np4a@example.com", "testpassword123");
    const b = signUp("B", "np4b@example.com", "testpassword123");
    setPreference(a.id, "campaign_cancelled", false);
    expect(isEnabled(a.id, "campaign_cancelled")).toBe(false);
    expect(isEnabled(b.id, "campaign_cancelled")).toBe(true);
  });
});
