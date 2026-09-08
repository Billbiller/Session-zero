import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { sendMessage, markConversationRead } from "@/lib/messages";
import { subscribeToUnreadMessageCount } from "@/lib/messageEvents";

describe("messageEvents (backlog #44)", () => {
  it("publishes an unread-message-count update to the recipient when a message is sent", () => {
    const a = signUp("Stream MA", "stream-ma@example.com", "testpassword123");
    const b = signUp("Stream MB", "stream-mb@example.com", "testpassword123");
    const received: number[] = [];
    const unsubscribe = subscribeToUnreadMessageCount(b.id, (evt) => {
      received.push(evt.unreadCount);
    });

    sendMessage(a.id, b.id, "hello");
    sendMessage(a.id, b.id, "hello again");

    unsubscribe();
    expect(received).toEqual([1, 2]);
  });

  it("does not publish anything to the sender's own channel on send", () => {
    const a = signUp("Stream MC", "stream-mc@example.com", "testpassword123");
    const b = signUp("Stream MD", "stream-md@example.com", "testpassword123");
    const receivedSender: number[] = [];
    const unsubscribe = subscribeToUnreadMessageCount(a.id, (evt) => {
      receivedSender.push(evt.unreadCount);
    });

    sendMessage(a.id, b.id, "hello");

    unsubscribe();
    expect(receivedSender).toEqual([]);
  });

  it("publishes an update on markConversationRead", () => {
    const a = signUp("Stream ME", "stream-me@example.com", "testpassword123");
    const b = signUp("Stream MF", "stream-mf@example.com", "testpassword123");
    sendMessage(a.id, b.id, "one");
    sendMessage(a.id, b.id, "two");

    const received: number[] = [];
    const unsubscribe = subscribeToUnreadMessageCount(b.id, (evt) => {
      received.push(evt.unreadCount);
    });

    markConversationRead(b.id, a.id);

    unsubscribe();
    expect(received).toEqual([0]);
  });

  it("only notifies subscribers for the matching user", () => {
    const a = signUp("Stream MG", "stream-mg@example.com", "testpassword123");
    const b = signUp("Stream MH", "stream-mh@example.com", "testpassword123");
    const c = signUp("Stream MI", "stream-mi@example.com", "testpassword123");
    const receivedB: number[] = [];
    const receivedC: number[] = [];
    const unsubB = subscribeToUnreadMessageCount(b.id, (evt) => receivedB.push(evt.unreadCount));
    const unsubC = subscribeToUnreadMessageCount(c.id, (evt) => receivedC.push(evt.unreadCount));

    sendMessage(a.id, b.id, "for b only");

    unsubB();
    unsubC();
    expect(receivedB).toEqual([1]);
    expect(receivedC).toEqual([]);
  });
});
