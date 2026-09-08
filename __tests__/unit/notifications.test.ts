import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import {
  notify,
  notifyMany,
  getUnreadCount,
  listNotifications,
  markRead,
  markAllRead,
} from "@/lib/notifications";
import { setPreference } from "@/lib/notificationPreferences";
import { createThread } from "@/lib/boards";

describe("notifications", () => {
  it("creates a notification and counts it as unread", () => {
    const user = signUp("Alice", "n1@example.com", "testpassword123");
    notify(user.id, "join_requested", null, "hello");
    expect(getUnreadCount(user.id)).toBe(1);
  });

  it("marks a single notification read", () => {
    const user = signUp("Bob", "n2@example.com", "testpassword123");
    const n = notify(user.id, "join_requested", null, "hello")!;
    markRead(n.id, user.id);
    expect(getUnreadCount(user.id)).toBe(0);
  });

  it("marks all notifications read", () => {
    const user = signUp("Carl", "n3@example.com", "testpassword123");
    notify(user.id, "join_requested", null, "a");
    notify(user.id, "join_approved", null, "b");
    markAllRead(user.id);
    expect(getUnreadCount(user.id)).toBe(0);
  });

  it("fans a notification out to many users", () => {
    const a = signUp("A", "n4a@example.com", "testpassword123");
    const b = signUp("B", "n4b@example.com", "testpassword123");
    notifyMany([a.id, b.id], "schedule_updated", null, "hi");
    expect(getUnreadCount(a.id)).toBe(1);
    expect(getUnreadCount(b.id)).toBe(1);
  });

  it("paginates and orders notifications newest first", () => {
    const user = signUp("Dana", "n5@example.com", "testpassword123");
    notify(user.id, "join_requested", null, "first");
    notify(user.id, "join_approved", null, "second");
    const { items, total } = listNotifications(user.id, { page: 1, pageSize: 1 });
    expect(total).toBe(2);
    expect(items).toHaveLength(1);
    expect(items[0].message).toBe("second");
  });

  it("suppresses creation entirely for a muted type (nothing is written)", () => {
    const user = signUp("Eve", "n6@example.com", "testpassword123");
    setPreference(user.id, "party_notes_updated", false);
    const result = notify(user.id, "party_notes_updated", null, "muted");
    expect(result).toBeNull();
    expect(getUnreadCount(user.id)).toBe(0);
    expect(listNotifications(user.id).total).toBe(0);
  });

  it("still delivers an unmuted type to the same user", () => {
    const user = signUp("Frank", "n7@example.com", "testpassword123");
    setPreference(user.id, "party_notes_updated", false);
    const result = notify(user.id, "schedule_updated", null, "not muted");
    expect(result).not.toBeNull();
    expect(getUnreadCount(user.id)).toBe(1);
  });

  it("accepts an optional relatedThreadId (backlog #43), defaulting to null when omitted", () => {
    const user = signUp("Gina", "n8@example.com", "testpassword123");
    const withoutThread = notify(user.id, "join_requested", null, "no thread here");
    expect(withoutThread!.related_thread_id).toBeNull();
    // related_thread_id is a real FK to board_threads(id) (foreign_keys is
    // ON), so this needs an actual thread row to point at -- lib/boards.ts's
    // own tests cover the full notify-on-reply flow; this test just checks
    // notify() itself plumbs the argument through correctly.
    const thread = createThread("new-player-questions", user.id, {
      title: "T",
      body: "B",
    });
    const withThread = notify(
      user.id,
      "board_reply",
      null,
      "someone replied",
      null,
      thread.id
    );
    expect(withThread!.related_thread_id).toBe(thread.id);
  });
});
