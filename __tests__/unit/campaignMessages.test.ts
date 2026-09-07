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
