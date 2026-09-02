import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import { getNotes, updateNotes, PartyNotesError } from "@/lib/partyNotes";
import { listNotifications } from "@/lib/notifications";
import { setPreference } from "@/lib/notificationPreferences";

function setupParty(emailPrefix: string) {
  const dm = signUp("DM", `${emailPrefix}-dm@example.com`, "testpassword123");
  const campaign = createCampaign({
    dmId: dm.id,
    title: "T",
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

describe("partyNotes", () => {
  it("returns empty notes by default", () => {
    const { campaign } = setupParty("pn1");
    expect(getNotes(campaign.id).content).toBe("");
  });

  it("lets the DM and active members edit notes", () => {
    const { dm, campaign, p1 } = setupParty("pn2");
    updateNotes(campaign.id, dm.id, "DM's notes");
    expect(getNotes(campaign.id).content).toBe("DM's notes");
    updateNotes(campaign.id, p1.id, "Player's notes");
    expect(getNotes(campaign.id).content).toBe("Player's notes");
  });

  it("rejects edits from someone without private access", () => {
    const { campaign } = setupParty("pn3");
    const stranger = signUp("Stranger", "pn3-s@example.com", "testpassword123");
    expect(() => updateNotes(campaign.id, stranger.id, "hack")).toThrow(PartyNotesError);
  });

  it("notifies the rest of the active party (not the editor) on edit", () => {
    const { dm, campaign, p1, p2 } = setupParty("pn4");
    updateNotes(campaign.id, p1.id, "updated");

    expect(
      listNotifications(dm.id).items.some((n) => n.type === "party_notes_updated")
    ).toBe(true);
    expect(
      listNotifications(p2.id).items.some((n) => n.type === "party_notes_updated")
    ).toBe(true);
    expect(
      listNotifications(p1.id).items.some((n) => n.type === "party_notes_updated")
    ).toBe(false);
  });

  it("respects a muted party_notes_updated preference for one member", () => {
    const { dm, campaign, p1, p2 } = setupParty("pn5");
    setPreference(p2.id, "party_notes_updated", false);

    updateNotes(campaign.id, p1.id, "updated again");

    expect(
      listNotifications(p2.id).items.some((n) => n.type === "party_notes_updated")
    ).toBe(false);
    expect(
      listNotifications(dm.id).items.some((n) => n.type === "party_notes_updated")
    ).toBe(true);
  });
});
