import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import { sendCampaignMessage, markCampaignChatRead } from "@/lib/campaignMessages";
import { subscribeToUnreadCampaignChatCount } from "@/lib/campaignChatEvents";

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
  const m = requestJoin(campaign.id, p1.id);
  approveRequest(m.id, dm.id);
  return { dm, campaign, p1 };
}

describe("campaignChatEvents (backlog #45)", () => {
  it("publishes an unread-table-chat-count update to other active party members when a message is sent", () => {
    const { dm, campaign, p1 } = setupParty("cce1");
    const received: number[] = [];
    const unsubscribe = subscribeToUnreadCampaignChatCount(dm.id, (evt) => {
      received.push(evt.unreadCount);
    });

    sendCampaignMessage(campaign.id, p1.id, "hello");
    sendCampaignMessage(campaign.id, p1.id, "hello again");

    unsubscribe();
    expect(received).toEqual([1, 2]);
  });

  it("also publishes to the sender's own channel via the internal mark-read-on-send call, holding at zero", () => {
    const { campaign, p1 } = setupParty("cce2");
    const received: number[] = [];
    const unsubscribe = subscribeToUnreadCampaignChatCount(p1.id, (evt) => {
      received.push(evt.unreadCount);
    });

    sendCampaignMessage(campaign.id, p1.id, "hello");

    unsubscribe();
    // sendCampaignMessage() calls markCampaignChatRead() for the sender
    // internally (so their own message never shows as unread to them),
    // which publishes their fresh total -- still 0, since they have no
    // other campaigns and their own message doesn't count as unread for
    // themselves.
    expect(received).toEqual([0]);
  });

  it("publishes an update on markCampaignChatRead", () => {
    const { dm, campaign, p1 } = setupParty("cce3");
    sendCampaignMessage(campaign.id, p1.id, "one");
    sendCampaignMessage(campaign.id, p1.id, "two");

    const received: number[] = [];
    const unsubscribe = subscribeToUnreadCampaignChatCount(dm.id, (evt) => {
      received.push(evt.unreadCount);
    });

    markCampaignChatRead(campaign.id, dm.id);

    unsubscribe();
    expect(received).toEqual([0]);
  });

  it("only notifies subscribers for the matching user", () => {
    const { dm, campaign, p1 } = setupParty("cce4");
    const stranger = signUp("Stranger", "cce4-s@example.com", "testpassword123");
    const receivedDm: number[] = [];
    const receivedStranger: number[] = [];
    const unsubDm = subscribeToUnreadCampaignChatCount(dm.id, (evt) =>
      receivedDm.push(evt.unreadCount)
    );
    const unsubStranger = subscribeToUnreadCampaignChatCount(stranger.id, (evt) =>
      receivedStranger.push(evt.unreadCount)
    );

    sendCampaignMessage(campaign.id, p1.id, "for the party only");

    unsubDm();
    unsubStranger();
    expect(receivedDm).toEqual([1]);
    expect(receivedStranger).toEqual([]);
  });
});
