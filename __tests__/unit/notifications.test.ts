import { describe, it, expect } from "vitest";
import { findOrCreateUser } from "@/lib/auth";
import {
  notify,
  notifyMany,
  getUnreadCount,
  listNotifications,
  markRead,
  markAllRead,
} from "@/lib/notifications";
import { setPreference } from "@/lib/notificationPreferences";

describe("notifications", () => {
  it("creates a notification and counts it as unread", () => {
    const user = findOrCreateUser("Alice", "n1@example.com");
    notify(user.id, "join_requested", null, "hello");
    expect(getUnreadCount(user.id)).toBe(1);
  });

  it("marks a single notification read", () => {
    const user = findOrCreateUser("Bob", "n2@example.com");
    const n = notify(user.id, "join_requested", null, "hello")!;
    markRead(n.id, user.id);
    expect(getUnreadCount(user.id)).toBe(0);
  });

  it("marks all notifications read", () => {
    const user = findOrCreateUser("Carl", "n3@example.com");
    notify(user.id, "join_requested", null, "a");
    notify(user.id, "join_approved", null, "b");
    markAllRead(user.id);
    expect(getUnreadCount(user.id)).toBe(0);
  });

  it("fans a notification out to many users", () => {
    const a = findOrCreateUser("A", "n4a@example.com");
    const b = findOrCreateUser("B", "n4b@example.com");
    notifyMany([a.id, b.id], "schedule_updated", null, "hi");
    expect(getUnreadCount(a.id)).toBe(1);
    expect(getUnreadCount(b.id)).toBe(1);
  });

  it("paginates and orders notifications newest first", () => {
    const user = findOrCreateUser("Dana", "n5@example.com");
    notify(user.id, "join_requested", null, "first");
    notify(user.id, "join_approved", null, "second");
    const { items, total } = listNotifications(user.id, { page: 1, pageSize: 1 });
    expect(total).toBe(2);
    expect(items).toHaveLength(1);
    expect(items[0].message).toBe("second");
  });

  it("suppresses creation entirely for a muted type (nothing is written)", () => {
    const user = findOrCreateUser("Eve", "n6@example.com");
    setPreference(user.id, "party_notes_updated", false);
    const result = notify(user.id, "party_notes_updated", null, "muted");
    expect(result).toBeNull();
    expect(getUnreadCount(user.id)).toBe(0);
    expect(listNotifications(user.id).total).toBe(0);
  });

  it("still delivers an unmuted type to the same user", () => {
    const user = findOrCreateUser("Frank", "n7@example.com");
    setPreference(user.id, "party_notes_updated", false);
    const result = notify(user.id, "schedule_updated", null, "not muted");
    expect(result).not.toBeNull();
    expect(getUnreadCount(user.id)).toBe(1);
  });
});
