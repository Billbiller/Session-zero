import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";
import { setPreference } from "@/lib/notificationPreferences";
import {
  sendMessage,
  listConversations,
  getConversation,
  markConversationRead,
  MessageError,
} from "@/lib/messages";

describe("direct messaging (backlog #31)", () => {
  it("sends a message and persists it", () => {
    const a = signUp("Alice", "msg-a1@example.com", "testpassword123");
    const b = signUp("Bob", "msg-b1@example.com", "testpassword123");
    const message = sendMessage(a.id, b.id, "  Hey, want to join my table?  ");
    expect(message.sender_id).toBe(a.id);
    expect(message.recipient_id).toBe(b.id);
    // Trimmed, same convention as every other free-text field in this app.
    expect(message.body).toBe("Hey, want to join my table?");
    expect(message.read).toBe(0);
  });

  it("rejects messaging yourself", () => {
    const a = signUp("Alice", "msg-a2@example.com", "testpassword123");
    expect(() => sendMessage(a.id, a.id, "hi")).toThrow(MessageError);
  });

  it("rejects a message to a nonexistent recipient", () => {
    const a = signUp("Alice", "msg-a3@example.com", "testpassword123");
    expect(() => sendMessage(a.id, "does-not-exist", "hi")).toThrow(MessageError);
  });

  it("rejects an empty or whitespace-only message", () => {
    const a = signUp("Alice", "msg-a4@example.com", "testpassword123");
    const b = signUp("Bob", "msg-b4@example.com", "testpassword123");
    expect(() => sendMessage(a.id, b.id, "")).toThrow(MessageError);
    expect(() => sendMessage(a.id, b.id, "   ")).toThrow(MessageError);
  });

  it("rejects an over-length message", () => {
    const a = signUp("Alice", "msg-a5@example.com", "testpassword123");
    const b = signUp("Bob", "msg-b5@example.com", "testpassword123");
    expect(() => sendMessage(a.id, b.id, "x".repeat(4001))).toThrow(MessageError);
  });

  it("notifies the recipient with a message_received notification carrying the sender as related_user_id", () => {
    const a = signUp("Alice", "msg-a6@example.com", "testpassword123");
    const b = signUp("Bob", "msg-b6@example.com", "testpassword123");
    sendMessage(a.id, b.id, "hello there");
    const { items } = listNotifications(b.id);
    const notification = items.find((n) => n.type === "message_received");
    expect(notification).toBeTruthy();
    expect(notification!.related_user_id).toBe(a.id);
    expect(notification!.message).toContain("Alice");
  });

  it("doesn't notify the recipient when they've muted message_received", () => {
    const a = signUp("Alice", "msg-a7@example.com", "testpassword123");
    const b = signUp("Bob", "msg-b7@example.com", "testpassword123");
    setPreference(b.id, "message_received", false);
    sendMessage(a.id, b.id, "hello there");
    const { items } = listNotifications(b.id);
    expect(items.find((n) => n.type === "message_received")).toBeUndefined();
  });

  it("returns the full thread between two users in chronological order, from either side", () => {
    const a = signUp("Alice", "msg-a8@example.com", "testpassword123");
    const b = signUp("Bob", "msg-b8@example.com", "testpassword123");
    sendMessage(a.id, b.id, "first");
    sendMessage(b.id, a.id, "second");
    sendMessage(a.id, b.id, "third");
    const fromA = getConversation(a.id, b.id).map((m) => m.body);
    const fromB = getConversation(b.id, a.id).map((m) => m.body);
    expect(fromA).toEqual(["first", "second", "third"]);
    expect(fromB).toEqual(["first", "second", "third"]);
  });

  it("lists conversations most-recently-active first, with per-conversation unread counts", () => {
    const a = signUp("Alice", "msg-a9@example.com", "testpassword123");
    const b = signUp("Bob", "msg-b9@example.com", "testpassword123");
    const c = signUp("Carl", "msg-c9@example.com", "testpassword123");

    sendMessage(a.id, b.id, "hi bob");
    sendMessage(a.id, c.id, "hi carl");
    sendMessage(b.id, a.id, "hi back"); // bumps the Bob conversation to most recent

    const conversations = listConversations(a.id);
    expect(conversations.map((c2) => c2.otherUserId)).toEqual([b.id, c.id]);

    const withBob = conversations.find((c2) => c2.otherUserId === b.id)!;
    expect(withBob.lastMessage.body).toBe("hi back");
    // Alice sent the last message in the Carl thread, so nothing is
    // unread on Alice's side of that conversation; Bob's reply IS unread
    // for Alice until she reads it.
    expect(withBob.unreadCount).toBe(1);
    const withCarl = conversations.find((c2) => c2.otherUserId === c.id)!;
    expect(withCarl.unreadCount).toBe(0);
  });

  it("isolates conversations per user (a stranger's conversations don't leak in)", () => {
    const a = signUp("Alice", "msg-a10@example.com", "testpassword123");
    const b = signUp("Bob", "msg-b10@example.com", "testpassword123");
    const stranger = signUp("Stranger", "msg-s10@example.com", "testpassword123");
    sendMessage(a.id, b.id, "hi");
    expect(listConversations(stranger.id)).toEqual([]);
  });

  it("marks a conversation's incoming messages read, independent of the other direction", () => {
    const a = signUp("Alice", "msg-a11@example.com", "testpassword123");
    const b = signUp("Bob", "msg-b11@example.com", "testpassword123");
    sendMessage(a.id, b.id, "one");
    sendMessage(a.id, b.id, "two");
    sendMessage(b.id, a.id, "reply");

    expect(listConversations(b.id)[0].unreadCount).toBe(2);
    markConversationRead(b.id, a.id);
    expect(listConversations(b.id)[0].unreadCount).toBe(0);
    // Marking Bob's inbox read doesn't touch Alice's own unread count for
    // Bob's reply.
    expect(listConversations(a.id)[0].unreadCount).toBe(1);
  });
});
