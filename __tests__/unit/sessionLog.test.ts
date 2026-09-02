import { describe, it, expect } from "vitest";
import { findOrCreateUser } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import {
  createEntry,
  updateEntry,
  deleteEntry,
  listEntries,
  SessionLogError,
} from "@/lib/sessionLog";
import { listNotifications } from "@/lib/notifications";

function setup(emailPrefix: string) {
  const dm = findOrCreateUser("DM", `${emailPrefix}-dm@example.com`);
  const campaign = createCampaign({
    dmId: dm.id,
    title: "T",
    description: "",
    system: "S",
    capacity: 4,
  });
  const player = findOrCreateUser("Player", `${emailPrefix}-p@example.com`);
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
});
