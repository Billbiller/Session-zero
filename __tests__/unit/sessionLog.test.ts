import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import {
  createEntry,
  updateEntry,
  deleteEntry,
  listEntries,
  listEntriesWithKudos,
  toggleKudos,
  SessionLogError,
} from "@/lib/sessionLog";
import { listNotifications } from "@/lib/notifications";

function setup(emailPrefix: string) {
  const dm = signUp("DM", `${emailPrefix}-dm@example.com`, "testpassword123");
  const campaign = createCampaign({
    dmId: dm.id,
    title: "T",
    description: "",
    system: "S",
    capacity: 4,
  });
  const player = signUp("Player", `${emailPrefix}-p@example.com`, "testpassword123");
  const m = requestJoin(campaign.id, player.id);
  approveRequest(m.id, dm.id);
  return { dm, campaign, player };
}

describe("sessionLog", () => {
  it("lets the DM post an entry", () => {
    const { dm, campaign } = setup("sl1");
    const entry = createEntry(campaign.id, dm.id, "The party arrives in Barovia.");
    expect(listEntries(campaign.id)).toHaveLength(1);
    expect(entry.content).toBe("The party arrives in Barovia.");
  });

  it("rejects a post from a non-DM player", () => {
    const { campaign, player } = setup("sl2");
    expect(() => createEntry(campaign.id, player.id, "I post too!")).toThrow(SessionLogError);
  });

  it("notifies the rest of the active party when the DM posts", () => {
    const { dm, campaign, player } = setup("sl3");
    createEntry(campaign.id, dm.id, "Session recap");
    expect(
      listNotifications(player.id).items.some((n) => n.type === "session_log_posted")
    ).toBe(true);
  });

  it("lets the DM edit and delete their entry", () => {
    const { dm, campaign } = setup("sl4");
    const entry = createEntry(campaign.id, dm.id, "Draft");
    const edited = updateEntry(entry.id, dm.id, "Final");
    expect(edited.content).toBe("Final");
    deleteEntry(entry.id, dm.id);
    expect(listEntries(campaign.id)).toHaveLength(0);
  });

  it("rejects edit/delete from a non-DM", () => {
    const { dm, campaign, player } = setup("sl5");
    const entry = createEntry(campaign.id, dm.id, "Draft");
    expect(() => updateEntry(entry.id, player.id, "Hijacked")).toThrow(SessionLogError);
    expect(() => deleteEntry(entry.id, player.id)).toThrow(SessionLogError);
  });

  it("lists entries newest first", () => {
    const { dm, campaign } = setup("sl6");
    createEntry(campaign.id, dm.id, "First");
    createEntry(campaign.id, dm.id, "Second");
    const entries = listEntries(campaign.id);
    expect(entries[0].content).toBe("Second");
  });

  it("lets an active party member give and un-give kudos on an entry", () => {
    const { dm, campaign, player } = setup("sl7");
    const entry = createEntry(campaign.id, dm.id, "Session recap");

    const given = toggleKudos(entry.id, player.id);
    expect(given).toEqual({ count: 1, given: true });

    const withKudos = listEntriesWithKudos(campaign.id, player.id);
    expect(withKudos[0].kudosCount).toBe(1);
    expect(withKudos[0].viewerGaveKudos).toBe(true);

    const removed = toggleKudos(entry.id, player.id);
    expect(removed).toEqual({ count: 0, given: false });
    expect(listEntriesWithKudos(campaign.id, player.id)[0].kudosCount).toBe(0);
  });

  it("reports viewerGaveKudos as false for someone who hasn't reacted, without affecting the count", () => {
    const { dm, campaign, player } = setup("sl8");
    const entry = createEntry(campaign.id, dm.id, "Session recap");
    toggleKudos(entry.id, dm.id);

    const fromPlayer = listEntriesWithKudos(campaign.id, player.id);
    expect(fromPlayer[0].kudosCount).toBe(1);
    expect(fromPlayer[0].viewerGaveKudos).toBe(false);
  });

  it("notifies the entry's author when someone else gives kudos, but not on self-kudos or un-giving", () => {
    const { dm, campaign, player } = setup("sl9");
    const entry = createEntry(campaign.id, dm.id, "Session recap");

    toggleKudos(entry.id, dm.id); // self-kudos: no notification
    expect(
      listNotifications(dm.id).items.some((n) => n.type === "session_log_kudos")
    ).toBe(false);

    toggleKudos(entry.id, player.id); // fresh kudos from someone else: notifies
    expect(
      listNotifications(dm.id).items.some((n) => n.type === "session_log_kudos")
    ).toBe(true);

    const notifCountAfterGiving = listNotifications(dm.id).items.filter(
      (n) => n.type === "session_log_kudos"
    ).length;
    toggleKudos(entry.id, player.id); // un-giving: no new notification
    expect(
      listNotifications(dm.id).items.filter((n) => n.type === "session_log_kudos").length
    ).toBe(notifCountAfterGiving);
  });

  it("rejects kudos from someone with no relationship to the campaign", () => {
    const { dm, campaign } = setup("sl10");
    const entry = createEntry(campaign.id, dm.id, "Session recap");
    const stranger = signUp("Stranger", "sl10-stranger@example.com", "testpassword123");
    expect(() => toggleKudos(entry.id, stranger.id)).toThrow(SessionLogError);
  });
});
