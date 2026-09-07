import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest, leaveCampaign } from "@/lib/memberships";
import { createEntry } from "@/lib/sessionLog";
import { createCharacter } from "@/lib/characters";
import { getUserStats } from "@/lib/stats";

function makeUser(emailPrefix: string) {
  return signUp("User " + emailPrefix, `${emailPrefix}@example.com`, "testpassword123");
}

describe("stats", () => {
  it("reports all-zero/empty/null stats for a brand-new user", () => {
    const user = makeUser("stats-fresh1");
    const stats = getUserStats(user.id);
    expect(stats).toEqual({
      campaignsAsDm: 0,
      campaignsAsPlayer: 0,
      sessionsRun: 0,
      sessionsPlayed: 0,
      charactersCreated: 0,
      systemsPlayed: [],
      mostPlayedSystem: null,
      longestCampaign: null,
    });
  });

  it("counts campaigns DMed and session log entries authored as sessionsRun", () => {
    const dm = makeUser("stats-dm2");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "5e",
      capacity: 4,
    });
    createEntry(campaign.id, dm.id, "Session 1 recap");
    createEntry(campaign.id, dm.id, "Session 2 recap");

    const stats = getUserStats(dm.id);
    expect(stats.campaignsAsDm).toBe(1);
    expect(stats.campaignsAsPlayer).toBe(0);
    expect(stats.sessionsRun).toBe(2);
    expect(stats.sessionsPlayed).toBe(0);
  });

  it("counts campaigns played and session log entries as sessionsPlayed, even after leaving", () => {
    const dm = makeUser("stats-dm3");
    const player = makeUser("stats-player3");
    const campaign = createCampaign({
      dmId: dm.id,
      title: "T",
      description: "",
      system: "5e",
      capacity: 4,
    });
    const membership = requestJoin(campaign.id, player.id);
    approveRequest(membership.id, dm.id);
    createEntry(campaign.id, dm.id, "Session 1 recap");
    leaveCampaign(campaign.id, player.id);
    createEntry(campaign.id, dm.id, "Session 2 recap (after player left)");

    const stats = getUserStats(player.id);
    expect(stats.campaignsAsPlayer).toBe(1);
    // Both entries count: a left member's stats still reflect the sessions
    // they were part of the campaign for, matching the ratings feature's
    // own "still allows rating after leaving" precedent.
    expect(stats.sessionsPlayed).toBe(2);
  });

  it("counts characters created", () => {
    const user = makeUser("stats-char4");
    createCharacter(user.id, { name: "Aria", archetype: "Bard", bio: "", backstory: "" });
    createCharacter(user.id, { name: "Boros", archetype: "Fighter", bio: "", backstory: "" });
    expect(getUserStats(user.id).charactersCreated).toBe(2);
  });

  it("derives distinct systems played and the most-played system across DM + player roles", () => {
    const dm = makeUser("stats-sys5");
    const player = makeUser("stats-sys5-player");
    const c1 = createCampaign({ dmId: dm.id, title: "A", description: "", system: "5e", capacity: 4 });
    const c2 = createCampaign({ dmId: dm.id, title: "B", description: "", system: "5e", capacity: 4 });
    const c3 = createCampaign({ dmId: dm.id, title: "C", description: "", system: "Pathfinder", capacity: 4 });
    approveRequest(requestJoin(c1.id, player.id).id, dm.id);

    const dmStats = getUserStats(dm.id);
    expect(dmStats.systemsPlayed.sort()).toEqual(["5e", "Pathfinder"].sort());
    expect(dmStats.mostPlayedSystem).toBe("5e");

    const playerStats = getUserStats(player.id);
    expect(playerStats.systemsPlayed).toEqual(["5e"]);
    expect(playerStats.mostPlayedSystem).toBe("5e");

    void c2;
    void c3;
  });

  it("picks the campaign with the most session log entries as the longest campaign", () => {
    const dm = makeUser("stats-longest6");
    const short = createCampaign({ dmId: dm.id, title: "Short", description: "", system: "5e", capacity: 4 });
    const long = createCampaign({ dmId: dm.id, title: "Long", description: "", system: "5e", capacity: 4 });
    createEntry(short.id, dm.id, "Only session");
    createEntry(long.id, dm.id, "Session 1");
    createEntry(long.id, dm.id, "Session 2");
    createEntry(long.id, dm.id, "Session 3");

    const stats = getUserStats(dm.id);
    expect(stats.longestCampaign).toEqual({ id: long.id, title: "Long", sessionCount: 3 });
  });
});
