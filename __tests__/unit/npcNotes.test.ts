import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest } from "@/lib/memberships";
import {
  listNpcNotes,
  addNpcNote,
  updateNpcNote,
  deleteNpcNote,
  NpcNoteError,
} from "@/lib/npcNotes";

function setup(emailPrefix: string) {
  const dm = signUp("DM", `${emailPrefix}-dm@example.com`, "testpassword123");
  const campaign = createCampaign({
    dmId: dm.id,
    title: "The Sunken Keep",
    description: "",
    system: "S",
    capacity: 4,
  });
  const player = signUp("Player", `${emailPrefix}-p@example.com`, "testpassword123");
  const m = requestJoin(campaign.id, player.id);
  approveRequest(m.id, dm.id);
  return { dm, campaign, player };
}

describe("NPC quick-notes (backlog #33)", () => {
  it("lets the DM add NPCs, trimmed, listed oldest-first", () => {
    const { dm, campaign } = setup("npc1");
    addNpcNote(campaign.id, dm.id, { name: "  Baroness Vex  ", notes: "  Wants the amulet.  " });
    addNpcNote(campaign.id, dm.id, { name: "Old Tomm" });

    const npcs = listNpcNotes(campaign.id);
    expect(npcs.map((n) => n.name)).toEqual(["Baroness Vex", "Old Tomm"]);
    expect(npcs[0].notes).toBe("Wants the amulet.");
    expect(npcs[1].notes).toBe("");
  });

  it("rejects adding from an approved player (not the DM)", () => {
    const { campaign, player } = setup("npc2");
    expect(() => addNpcNote(campaign.id, player.id, { name: "Sneaky" })).toThrow(NpcNoteError);
  });

  it("rejects adding from a complete stranger", () => {
    const { campaign } = setup("npc3");
    const stranger = signUp("Stranger", "npc3-s@example.com", "testpassword123");
    expect(() => addNpcNote(campaign.id, stranger.id, { name: "Ghost" })).toThrow(NpcNoteError);
  });

  it("rejects a blank name", () => {
    const { dm, campaign } = setup("npc4");
    expect(() => addNpcNote(campaign.id, dm.id, { name: "   " })).toThrow(NpcNoteError);
  });

  it("rejects an over-length name or notes", () => {
    const { dm, campaign } = setup("npc5");
    expect(() => addNpcNote(campaign.id, dm.id, { name: "x".repeat(101) })).toThrow(NpcNoteError);
    expect(() =>
      addNpcNote(campaign.id, dm.id, { name: "Ok", notes: "x".repeat(2001) })
    ).toThrow(NpcNoteError);
  });

  it("updates an NPC's name and/or notes independently", () => {
    const { dm, campaign } = setup("npc6");
    const npc = addNpcNote(campaign.id, dm.id, { name: "Old Tomm", notes: "Runs the tavern." });

    const renamed = updateNpcNote(npc.id, dm.id, { name: "Old Tomm the Wise" });
    expect(renamed.name).toBe("Old Tomm the Wise");
    expect(renamed.notes).toBe("Runs the tavern.");

    const renoted = updateNpcNote(npc.id, dm.id, { notes: "Secretly a spy." });
    expect(renoted.name).toBe("Old Tomm the Wise");
    expect(renoted.notes).toBe("Secretly a spy.");
  });

  it("rejects an update from a non-DM and from an unknown NPC id", () => {
    const { dm, campaign, player } = setup("npc7");
    const npc = addNpcNote(campaign.id, dm.id, { name: "Old Tomm" });
    expect(() => updateNpcNote(npc.id, player.id, { name: "Hacked" })).toThrow(NpcNoteError);
    expect(() => updateNpcNote("nonexistent", dm.id, { name: "Hacked" })).toThrow(NpcNoteError);
  });

  it("deletes an NPC", () => {
    const { dm, campaign } = setup("npc8");
    const npc = addNpcNote(campaign.id, dm.id, { name: "Old Tomm" });
    deleteNpcNote(npc.id, dm.id);
    expect(listNpcNotes(campaign.id)).toEqual([]);
  });

  it("rejects deleting from a non-DM and deleting an unknown NPC", () => {
    const { dm, campaign, player } = setup("npc9");
    const npc = addNpcNote(campaign.id, dm.id, { name: "Old Tomm" });
    expect(() => deleteNpcNote(npc.id, player.id)).toThrow(NpcNoteError);
    expect(() => deleteNpcNote("nonexistent", dm.id)).toThrow(NpcNoteError);
  });

  it("isolates NPC lists per campaign", () => {
    const { dm, campaign } = setup("npc10a");
    const other = setup("npc10b");
    addNpcNote(campaign.id, dm.id, { name: "A" });
    addNpcNote(other.campaign.id, other.dm.id, { name: "B" });
    expect(listNpcNotes(campaign.id).map((n) => n.name)).toEqual(["A"]);
    expect(listNpcNotes(other.campaign.id).map((n) => n.name)).toEqual(["B"]);
  });
});
