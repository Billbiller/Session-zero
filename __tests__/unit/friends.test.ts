import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";
import { setPreference } from "@/lib/notificationPreferences";
import { upsertProfile, getProfile } from "@/lib/profiles";
import {
  sendFriendRequest,
  acceptFriendRequest,
  cancelOrRemoveFriendship,
  areFriends,
  getFriendshipStatus,
  listFriends,
  listPendingReceived,
  listPendingSent,
  friendCount,
  FriendError,
} from "@/lib/friends";

describe("friends (backlog #59)", () => {
  it("sends a pending friend request", () => {
    const a = signUp("Alice", "fr-a1@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b1@example.com", "testpassword123");
    const request = sendFriendRequest(a.id, b.id);
    expect(request.requester_id).toBe(a.id);
    expect(request.addressee_id).toBe(b.id);
    expect(request.status).toBe("pending");
    expect(areFriends(a.id, b.id)).toBe(false);
  });

  it("rejects sending yourself a friend request", () => {
    const a = signUp("Alice", "fr-a2@example.com", "testpassword123");
    expect(() => sendFriendRequest(a.id, a.id)).toThrow(FriendError);
  });

  it("rejects a request to a nonexistent user", () => {
    const a = signUp("Alice", "fr-a3@example.com", "testpassword123");
    expect(() => sendFriendRequest(a.id, "does-not-exist")).toThrow(FriendError);
  });

  it("rejects a duplicate request while one is already pending", () => {
    const a = signUp("Alice", "fr-a4@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b4@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    expect(() => sendFriendRequest(a.id, b.id)).toThrow(FriendError);
    // The reverse direction is blocked too -- there's at most one
    // relationship row between any two users, regardless of direction.
    expect(() => sendFriendRequest(b.id, a.id)).toThrow(FriendError);
  });

  it("rejects a new request once the two are already friends", () => {
    const a = signUp("Alice", "fr-a5@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b5@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    acceptFriendRequest(b.id, a.id);
    expect(() => sendFriendRequest(a.id, b.id)).toThrow(FriendError);
    expect(() => sendFriendRequest(b.id, a.id)).toThrow(FriendError);
  });

  it("notifies the addressee with a friend_request notification carrying the requester as related_user_id", () => {
    const a = signUp("Alice", "fr-a6@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b6@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    const { items } = listNotifications(b.id);
    const notification = items.find((n) => n.type === "friend_request");
    expect(notification).toBeTruthy();
    expect(notification!.related_user_id).toBe(a.id);
    expect(notification!.message).toContain("Alice");
  });

  it("doesn't notify the addressee when they've muted friend_request", () => {
    const a = signUp("Alice", "fr-a7@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b7@example.com", "testpassword123");
    setPreference(b.id, "friend_request", false);
    sendFriendRequest(a.id, b.id);
    const { items } = listNotifications(b.id);
    expect(items.find((n) => n.type === "friend_request")).toBeUndefined();
  });

  it("accepts a pending request, making both users friends", () => {
    const a = signUp("Alice", "fr-a8@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b8@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    const accepted = acceptFriendRequest(b.id, a.id);
    expect(accepted.status).toBe("accepted");
    expect(areFriends(a.id, b.id)).toBe(true);
    expect(areFriends(b.id, a.id)).toBe(true);
  });

  it("notifies the original requester with a friend_request_accepted notification", () => {
    const a = signUp("Alice", "fr-a9@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b9@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    acceptFriendRequest(b.id, a.id);
    const { items } = listNotifications(a.id);
    const notification = items.find((n) => n.type === "friend_request_accepted");
    expect(notification).toBeTruthy();
    expect(notification!.related_user_id).toBe(b.id);
    expect(notification!.message).toContain("Bob");
  });

  it("rejects accepting when there's no pending request from that user", () => {
    const a = signUp("Alice", "fr-a10@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b10@example.com", "testpassword123");
    expect(() => acceptFriendRequest(b.id, a.id)).toThrow(FriendError);
  });

  it("only the addressee can accept -- the requester calling accept on their own sent request fails", () => {
    const a = signUp("Alice", "fr-a11@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b11@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    expect(() => acceptFriendRequest(a.id, b.id)).toThrow(FriendError);
  });

  it("lets the requester cancel their own pending request", () => {
    const a = signUp("Alice", "fr-a12@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b12@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    cancelOrRemoveFriendship(a.id, b.id);
    expect(getFriendshipStatus(a.id, b.id)).toBe("none");
    // Cancelling frees things up for a fresh request later.
    expect(() => sendFriendRequest(a.id, b.id)).not.toThrow();
  });

  it("lets the addressee decline a pending request", () => {
    const a = signUp("Alice", "fr-a13@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b13@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    cancelOrRemoveFriendship(b.id, a.id);
    expect(getFriendshipStatus(a.id, b.id)).toBe("none");
  });

  it("lets either side unfriend an accepted friendship", () => {
    const a = signUp("Alice", "fr-a14@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b14@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    acceptFriendRequest(b.id, a.id);
    cancelOrRemoveFriendship(b.id, a.id);
    expect(areFriends(a.id, b.id)).toBe(false);
    // A fresh request can be sent again after unfriending.
    expect(() => sendFriendRequest(b.id, a.id)).not.toThrow();
  });

  it("removing a relationship that doesn't exist is a silent no-op", () => {
    const a = signUp("Alice", "fr-a15@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b15@example.com", "testpassword123");
    expect(() => cancelOrRemoveFriendship(a.id, b.id)).not.toThrow();
  });

  describe("getFriendshipStatus (viewer-relative)", () => {
    it("is 'self' when viewing your own id", () => {
      const a = signUp("Alice", "fr-a16@example.com", "testpassword123");
      expect(getFriendshipStatus(a.id, a.id)).toBe("self");
    });

    it("is 'none' with no relationship", () => {
      const a = signUp("Alice", "fr-a17@example.com", "testpassword123");
      const b = signUp("Bob", "fr-b17@example.com", "testpassword123");
      expect(getFriendshipStatus(a.id, b.id)).toBe("none");
    });

    it("is 'request_sent' for the requester and 'request_received' for the addressee", () => {
      const a = signUp("Alice", "fr-a18@example.com", "testpassword123");
      const b = signUp("Bob", "fr-b18@example.com", "testpassword123");
      sendFriendRequest(a.id, b.id);
      expect(getFriendshipStatus(a.id, b.id)).toBe("request_sent");
      expect(getFriendshipStatus(b.id, a.id)).toBe("request_received");
    });

    it("is 'friends' for both sides once accepted", () => {
      const a = signUp("Alice", "fr-a19@example.com", "testpassword123");
      const b = signUp("Bob", "fr-b19@example.com", "testpassword123");
      sendFriendRequest(a.id, b.id);
      acceptFriendRequest(b.id, a.id);
      expect(getFriendshipStatus(a.id, b.id)).toBe("friends");
      expect(getFriendshipStatus(b.id, a.id)).toBe("friends");
    });
  });

  it("listFriends returns the other user regardless of who originally sent the request, most-recently-accepted first", () => {
    const a = signUp("Alice", "fr-a20@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b20@example.com", "testpassword123");
    const c = signUp("Carl", "fr-c20@example.com", "testpassword123");

    sendFriendRequest(a.id, b.id);
    acceptFriendRequest(b.id, a.id);
    sendFriendRequest(c.id, a.id); // Carl sends *to* Alice this time.
    acceptFriendRequest(a.id, c.id);

    const aFriends = listFriends(a.id);
    expect(aFriends.map((f) => f.id)).toEqual([c.id, b.id]);
    expect(aFriends.every((f) => f.display_name)).toBe(true);

    expect(listFriends(b.id).map((f) => f.id)).toEqual([a.id]);
    expect(listFriends(c.id).map((f) => f.id)).toEqual([a.id]);
  });

  it("isolates friends lists per user (a stranger's friends don't leak in)", () => {
    const a = signUp("Alice", "fr-a21@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b21@example.com", "testpassword123");
    const stranger = signUp("Stranger", "fr-s21@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    acceptFriendRequest(b.id, a.id);
    expect(listFriends(stranger.id)).toEqual([]);
  });

  it("listPendingReceived/listPendingSent split correctly by direction", () => {
    const a = signUp("Alice", "fr-a22@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b22@example.com", "testpassword123");
    const c = signUp("Carl", "fr-c22@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    sendFriendRequest(c.id, a.id);

    expect(listPendingSent(a.id).map((p) => p.id)).toEqual([b.id]);
    expect(listPendingReceived(a.id).map((p) => p.id)).toEqual([c.id]);
    expect(listPendingReceived(b.id).map((p) => p.id)).toEqual([a.id]);
    expect(listPendingSent(c.id).map((p) => p.id)).toEqual([a.id]);

    // An accepted friendship no longer shows up as pending on either side.
    acceptFriendRequest(b.id, a.id);
    expect(listPendingSent(a.id)).toEqual([]);
    expect(listPendingReceived(b.id)).toEqual([]);
  });

  it("friendCount reflects only accepted friendships, not pending requests", () => {
    const a = signUp("Alice", "fr-a23@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b23@example.com", "testpassword123");
    const c = signUp("Carl", "fr-c23@example.com", "testpassword123");
    sendFriendRequest(a.id, b.id);
    expect(friendCount(a.id)).toBe(0);
    acceptFriendRequest(b.id, a.id);
    expect(friendCount(a.id)).toBe(1);
    expect(friendCount(b.id)).toBe(1);
    sendFriendRequest(c.id, a.id);
    expect(friendCount(a.id)).toBe(1);
  });

  // Backlog #59's own "gate some profile content to friends-only" scope --
  // exercised at the lib level here (the /players/[id] page itself reads
  // areFriends() directly, see app/players/[id]/page.tsx).
  it("areFriends is the gate a friends-only profile field would check", () => {
    const a = signUp("Alice", "fr-a24@example.com", "testpassword123");
    const b = signUp("Bob", "fr-b24@example.com", "testpassword123");
    upsertProfile(b.id, { location: "Austin, TX" });
    expect(areFriends(a.id, b.id)).toBe(false);
    sendFriendRequest(a.id, b.id);
    acceptFriendRequest(b.id, a.id);
    expect(areFriends(a.id, b.id)).toBe(true);
    expect(getProfile(b.id).location).toBe("Austin, TX");
  });
});
