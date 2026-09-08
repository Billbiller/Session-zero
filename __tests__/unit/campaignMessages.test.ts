import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import { leaveCampaign } from "@/lib/memberships";
import { listNotifications } from "@/lib/notifications";
import { setPreference } from "@/lib/notificationPreferences";
import {
  sendCampaignMessage,
  listCampaignMessages,
  getUnreadCampaignMessageCount,
  markCampaignChatRead,
  getTotalUnreadCampaignMessageCountForUser,
  getUnreadCampaignMessageCountsForUser,
  CampaignMessageError,
} from "@/lib/campaignMessages";

function setupParty(emailPrefix: string) {
  const dm = signUp("DM", `${emailPrefix}-dm@example.com`, "testpassword123");
  const campaign = createCampaign({
    dmId: dm.id,
    title: "The Sunken Keep",
    description: "",
    system: "S",
    capacity: 4,
  });
  const p1 = signUp("P1", `${emailPrefix}-p1@example.com`, "testpassword123");
  const p2 = signUp("P2", `${emailPrefix}-p2@example.com`, "testpassword123");
  for (const p of [p1, p2]) {
    const m = requestJoin(campaign.id, p.id);
    approveRequest(m.id, dm.id);
  }
  return { dm, campaign, p1, p2 };
}

describe("table group chat (backlog #32)", () => {
  it("lets the DM and active members post, and returns messages oldest-first with sender names", () => {
    const { dm, campaign, p1 } = setupParty("cm1");
    sendCampaignMessage(campaign.id, dm.id, "  Welcome to the table!  ");
    sendCampaignMessage(campaign.id, p1.id, "Excited to start.");

    const messages = listCampaignMessages(campaign.id);
    expect(messages.map((m) => m.body)).toEqual(["Welcome to the table!", "Excited to start."]);
    expect(messages[0].senderName).toBe("DM");
    expect(messages[1].senderName).toBe("P1");
  });

  it("rejects a post from someone without private access", () => {
    const { campaign } = setupParty("cm2");
    const stranger = signUp("Stranger", "cm2-s@example.com", "testpassword123");
    expect(() => sendCampaignMessage(campaign.id, stranger.id, "hack")).toThrow(
      CampaignMessageError
    );
  });

  it("rejects a post from a pending (not-yet-approved) requester", () => {
    const dm = signUp("DM", "cm3-dm@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    const pending = signUp("Pending", "cm3-p@example.com", "testpassword123");
    requestJoin(campaign.id, pending.id);
    expect(() => sendCampaignMessage(campaign.id, pending.id, "let me in")).toThrow(
      CampaignMessageError
    );
  });

  it("rejects a post from a member who has since left", () => {
    const { campaign, p1 } = setupParty("cm4");
    leaveCampaign(campaign.id, p1.id);
    expect(() => sendCampaignMessage(campaign.id, p1.id, "bye")).toThrow(CampaignMessageError);
  });

  it("still shows a departed member's past messages in the thread's history", () => {
    const { campaign, p1 } = setupParty("cm5");
    sendCampaignMessage(campaign.id, p1.id, "before I left");
    leaveCampaign(campaign.id, p1.id);
    const messages = listCampaignMessages(campaign.id);
    expect(messages.map((m) => m.body)).toContain("before I left");
  });

  it("rejects an empty or whitespace-only message", () => {
    const { dm, campaign } = setupParty("cm6");
    expect(() => sendCampaignMessage(campaign.id, dm.id, "")).toThrow(CampaignMessageError);
    expect(() => sendCampaignMessage(campaign.id, dm.id, "   ")).toThrow(CampaignMessageError);
  });

  it("rejects an over-length message", () => {
    const { dm, campaign } = setupParty("cm7");
    expect(() => sendCampaignMessage(campaign.id, dm.id, "x".repeat(4001))).toThrow(
      CampaignMessageError
    );
  });

  it("notifies the rest of the active party (not the sender) with a campaign_chat_message notification", () => {
    const { dm, campaign, p1, p2 } = setupParty("cm8");
    sendCampaignMessage(campaign.id, p1.id, "hello table");

    expect(
      listNotifications(dm.id).items.some((n) => n.type === "campaign_chat_message")
    ).toBe(true);
    expect(
      listNotifications(p2.id).items.some((n) => n.type === "campaign_chat_message")
    ).toBe(true);
    expect(
      listNotifications(p1.id).items.some((n) => n.type === "campaign_chat_message")
    ).toBe(false);
  });

  it("respects a muted campaign_chat_message preference", () => {
    const { dm, campaign, p1, p2 } = setupParty("cm9");
    setPreference(p2.id, "campaign_chat_message", false);
    sendCampaignMessage(campaign.id, p1.id, "hello");
    expect(
      listNotifications(p2.id).items.some((n) => n.type === "campaign_chat_message")
    ).toBe(false);
    expect(
      listNotifications(dm.id).items.some((n) => n.type === "campaign_chat_message")
    ).toBe(true);
  });

  it("notifies only on the first unread message since a recipient's last visit, not every message", () => {
    const { dm, campaign, p1, p2 } = setupParty("cm10");
    sendCampaignMessage(campaign.id, p1.id, "one");
    sendCampaignMessage(campaign.id, p1.id, "two");
    sendCampaignMessage(campaign.id, p1.id, "three");

    const dmChatNotifs = listNotifications(dm.id).items.filter(
      (n) => n.type === "campaign_chat_message"
    );
    const p2ChatNotifs = listNotifications(p2.id).items.filter(
      (n) => n.type === "campaign_chat_message"
    );
    expect(dmChatNotifs).toHaveLength(1);
    expect(p2ChatNotifs).toHaveLength(1);
  });

  it("notifies again after the recipient catches up and a new message arrives", () => {
    const { dm, campaign, p1 } = setupParty("cm11");
    sendCampaignMessage(campaign.id, p1.id, "one");
    markCampaignChatRead(campaign.id, dm.id);
    sendCampaignMessage(campaign.id, p1.id, "two");

    const dmChatNotifs = listNotifications(dm.id).items.filter(
      (n) => n.type === "campaign_chat_message"
    );
    expect(dmChatNotifs).toHaveLength(2);
  });

  it("computes unread counts per user, excluding their own messages, and sending marks the sender caught-up", () => {
    const { dm, campaign, p1 } = setupParty("cm12");
    expect(getUnreadCampaignMessageCount(campaign.id, dm.id)).toBe(0);

    sendCampaignMessage(campaign.id, p1.id, "one");
    sendCampaignMessage(campaign.id, p1.id, "two");
    expect(getUnreadCampaignMessageCount(campaign.id, dm.id)).toBe(2);
    // The sender never sees their own messages as unread for themselves.
    expect(getUnreadCampaignMessageCount(campaign.id, p1.id)).toBe(0);

    markCampaignChatRead(campaign.id, dm.id);
    expect(getUnreadCampaignMessageCount(campaign.id, dm.id)).toBe(0);
  });

  it("isolates chat threads per campaign", () => {
    const { dm: dmA, campaign: campaignA } = setupParty("cm13a");
    const { campaign: campaignB } = setupParty("cm13b");
    sendCampaignMessage(campaignA.id, dmA.id, "campaign A only");
    expect(listCampaignMessages(campaignB.id)).toEqual([]);
  });
});

describe("total + per-campaign unread table-chat counts (backlog #45)", () => {
  it("returns 0 / an empty map for a user with no campaigns at all", () => {
    const loner = signUp("Loner", "cm14-loner@example.com", "testpassword123");
    expect(getTotalUnreadCampaignMessageCountForUser(loner.id)).toBe(0);
    expect(getUnreadCampaignMessageCountsForUser(loner.id)).toEqual({});
  });

  it("returns 0 / an empty map when a user's campaigns have no unread messages", () => {
    const { dm } = setupParty("cm15");
    expect(getTotalUnreadCampaignMessageCountForUser(dm.id)).toBe(0);
    expect(getUnreadCampaignMessageCountsForUser(dm.id)).toEqual({});
  });

  it("sums unread across every campaign a user has access to, both DMing and playing", () => {
    // U DMs campaign A and plays in campaign B (DM'd by someone else).
    const u = signUp("U", "cm16-u@example.com", "testpassword123");
    const campaignA = createCampaign({
      dmId: u.id,
      title: "A",
      description: "",
      system: "S",
      capacity: 4,
    });
    const otherDm = signUp("OtherDM", "cm16-odm@example.com", "testpassword123");
    const campaignB = createCampaign({
      dmId: otherDm.id,
      title: "B",
      description: "",
      system: "S",
      capacity: 4,
    });
    const mB = requestJoin(campaignB.id, u.id);
    approveRequest(mB.id, otherDm.id);

    const playerInA = signUp("PlayerInA", "cm16-pa@example.com", "testpassword123");
    const mA = requestJoin(campaignA.id, playerInA.id);
    approveRequest(mA.id, u.id);

    sendCampaignMessage(campaignA.id, playerInA.id, "hi from A");
    sendCampaignMessage(campaignA.id, playerInA.id, "hi again from A");
    sendCampaignMessage(campaignB.id, otherDm.id, "hi from B");

    expect(getTotalUnreadCampaignMessageCountForUser(u.id)).toBe(3);
    expect(getUnreadCampaignMessageCountsForUser(u.id)).toEqual({
      [campaignA.id]: 2,
      [campaignB.id]: 1,
    });
  });

  it("excludes a campaign from the per-campaign map once the user has caught up, without affecting another campaign's entry", () => {
    const u = signUp("U2", "cm17-u@example.com", "testpassword123");
    const campaignA = createCampaign({
      dmId: u.id,
      title: "A",
      description: "",
      system: "S",
      capacity: 4,
    });
    const otherDm = signUp("OtherDM2", "cm17-odm@example.com", "testpassword123");
    const campaignB = createCampaign({
      dmId: otherDm.id,
      title: "B",
      description: "",
      system: "S",
      capacity: 4,
    });
    const mB = requestJoin(campaignB.id, u.id);
    approveRequest(mB.id, otherDm.id);
    const playerInA = signUp("PlayerInA2", "cm17-pa@example.com", "testpassword123");
    const mA = requestJoin(campaignA.id, playerInA.id);
    approveRequest(mA.id, u.id);

    sendCampaignMessage(campaignA.id, playerInA.id, "hi from A");
    sendCampaignMessage(campaignB.id, otherDm.id, "hi from B");
    expect(getUnreadCampaignMessageCountsForUser(u.id)).toEqual({
      [campaignA.id]: 1,
      [campaignB.id]: 1,
    });

    markCampaignChatRead(campaignA.id, u.id);
    expect(getUnreadCampaignMessageCountsForUser(u.id)).toEqual({ [campaignB.id]: 1 });
    expect(getTotalUnreadCampaignMessageCountForUser(u.id)).toBe(1);
  });

  it("never counts the user's own sent messages toward their own aggregate total", () => {
    const { dm, campaign } = setupParty("cm18");
    sendCampaignMessage(campaign.id, dm.id, "my own message");
    expect(getTotalUnreadCampaignMessageCountForUser(dm.id)).toBe(0);
  });

  it("isolates aggregate counts per user -- one member's unread total doesn't leak into another's", () => {
    const dm = signUp("DM3", "cm19-dm@example.com", "testpassword123");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "S",
      capacity: 4,
    });
    const p1 = signUp("P1_3", "cm19-p1@example.com", "testpassword123");
    const p2 = signUp("P2_3", "cm19-p2@example.com", "testpassword123");
    for (const p of [p1, p2]) {
      const m = requestJoin(campaign.id, p.id);
      approveRequest(m.id, dm.id);
    }
    sendCampaignMessage(campaign.id, p1.id, "hello");
    markCampaignChatRead(campaign.id, p2.id); // p2 catches up immediately

    expect(getTotalUnreadCampaignMessageCountForUser(dm.id)).toBe(1);
    expect(getTotalUnreadCampaignMessageCountForUser(p2.id)).toBe(0);
  });
});
