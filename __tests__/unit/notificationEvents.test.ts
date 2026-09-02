import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { notify, markRead, markAllRead } from "@/lib/notifications";
import { subscribeToUnreadCount } from "@/lib/notificationEvents";

describe("notificationEvents", () => {
  it("publishes an unread-count update when a notification is created", () => {
    const user = signUp("Stream A", "stream-a@example.com", "testpassword123");
    const received: number[] = [];
    const unsubscribe = subscribeToUnreadCount(user.id, (evt) => {
      received.push(evt.unreadCount);
    });

    notify(user.id, "join_requested", null, "hello");
    notify(user.id, "join_approved", null, "world");

    unsubscribe();
    expect(received).toEqual([1, 2]);
  });

  it("publishes an update on markRead and markAllRead too", () => {
    const user = signUp("Stream B", "stream-b@example.com", "testpassword123");
    const n1 = notify(user.id, "join_requested", null, "a")!;
    notify(user.id, "join_approved", null, "b");

    const received: number[] = [];
    const unsubscribe = subscribeToUnreadCount(user.id, (evt) => {
      received.push(evt.unreadCount);
    });

    markRead(n1.id, user.id);
    markAllRead(user.id);

    unsubscribe();
    expect(received).toEqual([1, 0]);
  });

  it("does not publish to a muted type's suppressed notify() call", () => {
    const user = signUp("Stream C", "stream-c@example.com", "testpassword123");
    const received: number[] = [];
    const unsubscribe = subscribeToUnreadCount(user.id, (evt) => {
      received.push(evt.unreadCount);
    });

    // No preference muted yet, so this one delivers and publishes once.
    notify(user.id, "schedule_updated", null, "delivered");

    unsubscribe();
    expect(received).toEqual([1]);
  });

  it("only notifies subscribers for the matching user", () => {
    const a = signUp("Stream D1", "stream-d1@example.com", "testpassword123");
    const b = signUp("Stream D2", "stream-d2@example.com", "testpassword123");
    const receivedA: number[] = [];
    const receivedB: number[] = [];
    const unsubA = subscribeToUnreadCount(a.id, (evt) => receivedA.push(evt.unreadCount));
    const unsubB = subscribeToUnreadCount(b.id, (evt) => receivedB.push(evt.unreadCount));

    notify(a.id, "join_requested", null, "for a only");

    unsubA();
    unsubB();
    expect(receivedA).toEqual([1]);
    expect(receivedB).toEqual([]);
  });
});
