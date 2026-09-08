import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest, declineRequest, leaveCampaign } from "@/lib/memberships";
import { createCharacter } from "@/lib/characters";
import { sendMessage } from "@/lib/messages";
import { sendCampaignMessage } from "@/lib/campaignMessages";
import { rateCampaignParticipant } from "@/lib/ratings";
import { rateCampaign } from "@/lib/campaignRatings";
import { createEntry, toggleKudos } from "@/lib/sessionLog";
import { follow } from "@/lib/follows";
import { createThread, createReply, reportThread } from "@/lib/boards";
import { createSubRequest, volunteerForSubRequest } from "@/lib/subRequests";
import { createPlacement, ownerReview, dmReview } from "@/lib/subPlacements";
import { updateSchedule } from "@/lib/schedule";
import { setRsvp } from "@/lib/sessionRsvps";
import { setEntryAttendance } from "@/lib/attendance";
import { addCampaignResource } from "@/lib/campaignResources";
import { addInitiativeEntry } from "@/lib/initiativeTracker";
import { addNpcNote } from "@/lib/npcNotes";
import { getUserStats } from "@/lib/stats";
import { getAccountExport, AccountExportError } from "@/lib/accountExport";

function makeUser(prefix: string, label: string) {
  return signUp(label, `${prefix}-${label.toLowerCase()}@example.com`, "testpassword123");
}

/** Builds one rich, cross-linked scenario touching nearly every table this
 * app has -- a DM, a player, and a volunteer -- so most of the tests below
 * can each just assert on the one slice of the export they care about
 * rather than re-deriving the whole scenario from scratch. Every user
 * involved is created fresh with a unique prefix per call, matching this
 * codebase's own per-test-fixture-isolation convention (all tests in this
 * file share one SQLite DB per Vitest's per-file module isolation). */
function buildScenario(prefix: string) {
  const dm = makeUser(prefix, "DM");
  const player = makeUser(prefix, "Player");
  const volunteer = makeUser(prefix, "Volunteer");

  const campaign = createCampaign({
    dmId: dm.id,
    title: `${prefix} Campaign`,
    description: "",
    system: "5e",
    capacity: 4,
  });

  // Membership status coverage: approved (player, on the main campaign),
  // declined (player, on a second campaign), and left (player, on a
  // third) -- so the export's `memberships` section isn't just testing
  // the happy path.
  approveRequest(requestJoin(campaign.id, player.id).id, dm.id);
  const declinedCampaign = createCampaign({
    dmId: dm.id,
    title: `${prefix} Declined Table`,
    description: "",
    system: "5e",
    capacity: 4,
  });
  declineRequest(requestJoin(declinedCampaign.id, player.id).id, dm.id);
  const leftCampaign = createCampaign({
    dmId: dm.id,
    title: `${prefix} Left Table`,
    description: "",
    system: "5e",
    capacity: 4,
  });
  approveRequest(requestJoin(leftCampaign.id, player.id).id, dm.id);
  leaveCampaign(leftCampaign.id, player.id);

  const character = createCharacter(player.id, {
    name: `${prefix} Hero`,
    campaignId: campaign.id,
  });

  const subRequest = createSubRequest(campaign.id, player.id, "need a sub", character.id);
  volunteerForSubRequest(subRequest.id, volunteer.id, "I can help!");
  const placement = createPlacement(subRequest.id, player.id, volunteer.id);
  ownerReview(placement.id, player.id, { approve: true });
  dmReview(placement.id, dm.id, true);

  sendMessage(player.id, dm.id, "Hey DM, question about session 3.");
  sendMessage(dm.id, player.id, "Sure, what's up?");

  sendCampaignMessage(campaign.id, player.id, "Excited for tonight!");

  const entry = createEntry(campaign.id, dm.id, "The party stormed the keep.");
  toggleKudos(entry.id, player.id);

  rateCampaignParticipant(campaign.id, player.id, dm.id, {
    stars: 5,
    tags: ["Great narrator"],
  });
  rateCampaignParticipant(campaign.id, dm.id, player.id, {
    stars: 4,
    tags: ["On time"],
  });
  rateCampaign(campaign.id, player.id, { stars: 5, tags: ["Well organized"] });

  follow(player.id, dm.id);

  const thread = createThread("new-player-questions", player.id, {
    title: `${prefix} thread`,
    body: "How does initiative work?",
  });
  createReply(thread.id, volunteer.id, "Roll a d20 plus your Dex modifier.");
  reportThread(thread.id, volunteer.id, "spam");

  updateSchedule(campaign.id, dm.id, "2030-01-01T00:00:00.000Z");
  setRsvp(campaign.id, player.id, "confirmed");
  setEntryAttendance(entry.id, dm.id, [{ userId: player.id, attended: true }]);

  addCampaignResource(campaign.id, player.id, {
    name: "Battle map",
    description: "The keep's ground floor",
    dataUrl: "data:image/png;base64,aGVsbG8=",
  });

  addInitiativeEntry(campaign.id, dm.id, { name: "Goblin", initiative: 14 });
  addNpcNote(campaign.id, dm.id, { name: "Innkeeper Rosa", notes: "Knows the mayor" });

  return { dm, player, volunteer, campaign, declinedCampaign, leftCampaign, character, thread, entry };
}

describe("getAccountExport", () => {
  it("returns a fully-shaped, all-empty export for a brand-new user", () => {
    const user = makeUser("fresh1", "Solo");
    const data = getAccountExport(user.id);
    expect(data.account).toEqual({
      id: user.id,
      displayName: "Solo",
      email: `fresh1-solo@example.com`,
      isAdmin: false,
      createdAt: user.created_at,
    });
    expect(data.profile.user_id).toBe(user.id);
    expect(data.characters).toEqual([]);
    expect(data.campaignsAsDm).toEqual([]);
    expect(data.memberships).toEqual([]);
    expect(data.subRequestsPosted).toEqual([]);
    expect(data.subVolunteered).toEqual([]);
    expect(data.subPlacements).toEqual([]);
    expect(data.directMessagesSent).toEqual([]);
    expect(data.directMessagesReceived).toEqual([]);
    expect(data.campaignMessagesSent).toEqual([]);
    expect(data.ratingsGiven).toEqual([]);
    expect(data.ratingsReceived).toEqual([]);
    expect(data.campaignRatingsGiven).toEqual([]);
    expect(data.sessionLogEntriesAuthored).toEqual([]);
    expect(data.sessionLogKudosGiven).toEqual([]);
    expect(data.notifications).toEqual([]);
    expect(data.following).toEqual([]);
    expect(data.followers).toEqual([]);
    expect(data.boardThreadsAuthored).toEqual([]);
    expect(data.boardRepliesAuthored).toEqual([]);
    expect(data.boardReportsFiled).toEqual([]);
    expect(data.feedEvents).toEqual([]);
    expect(data.sessionRsvps).toEqual([]);
    expect(data.sessionLogAttendanceRecorded).toEqual([]);
    expect(data.campaignResourcesUploaded).toEqual([]);
    expect(data.initiativeEntriesAsDm).toEqual([]);
    expect(data.npcNotesAsDm).toEqual([]);
    expect(data.availabilitySlots).toEqual([]);
    expect(data.stats).toEqual(getUserStats(user.id));
  });

  it("never includes the password hash on the account object", () => {
    const user = makeUser("nohash2", "Guarded");
    const data = getAccountExport(user.id);
    expect(Object.keys(data.account)).not.toContain("password_hash");
    expect(JSON.stringify(data)).not.toContain("password_hash");
  });

  it("throws AccountExportError for an unknown user id", () => {
    expect(() => getAccountExport("does-not-exist")).toThrow(AccountExportError);
  });

  it("includes every campaign a user DMs, in full", () => {
    const { dm, campaign, declinedCampaign, leftCampaign } = buildScenario("dm-campaigns3");
    const data = getAccountExport(dm.id);
    const titles = data.campaignsAsDm.map((c) => c.title).sort();
    expect(titles).toEqual(
      [campaign.title, declinedCampaign.title, leftCampaign.title].sort()
    );
    expect(data.campaignsAsDm.find((c) => c.id === campaign.id)?.system).toBe("5e");
  });

  it("includes every membership status (approved, declined, left), enriched with the campaign title", () => {
    const { player, campaign, declinedCampaign, leftCampaign } = buildScenario("memberships4");
    const data = getAccountExport(player.id);
    expect(data.memberships).toHaveLength(3);
    const byCampaign = new Map(data.memberships.map((m) => [m.campaign_id, m]));
    expect(byCampaign.get(campaign.id)?.status).toBe("approved");
    expect(byCampaign.get(campaign.id)?.campaignTitle).toBe(campaign.title);
    expect(byCampaign.get(declinedCampaign.id)?.status).toBe("declined");
    expect(byCampaign.get(leftCampaign.id)?.status).toBe("left");
  });

  it("includes characters and the DM-only initiative/NPC prep tools for campaigns they DM", () => {
    const { dm, player, campaign, character } = buildScenario("chars5");
    const playerData = getAccountExport(player.id);
    expect(playerData.characters).toHaveLength(1);
    expect(playerData.characters[0].id).toBe(character.id);
    expect(playerData.initiativeEntriesAsDm).toEqual([]);
    expect(playerData.npcNotesAsDm).toEqual([]);

    const dmData = getAccountExport(dm.id);
    expect(dmData.characters).toEqual([]);
    expect(dmData.initiativeEntriesAsDm).toHaveLength(1);
    expect(dmData.initiativeEntriesAsDm[0]).toMatchObject({ name: "Goblin", campaign_id: campaign.id });
    expect(dmData.npcNotesAsDm).toHaveLength(1);
    expect(dmData.npcNotesAsDm[0]).toMatchObject({ name: "Innkeeper Rosa" });
  });

  it("includes sub requests posted, volunteered-for, and placements from both the owner and volunteer side", () => {
    const { player, volunteer } = buildScenario("subs6");
    const playerData = getAccountExport(player.id);
    expect(playerData.subRequestsPosted).toHaveLength(1);
    expect(playerData.subPlacements).toHaveLength(1);
    expect(playerData.subPlacements[0].status).toBe("confirmed");
    expect(playerData.subVolunteered).toEqual([]);

    const volunteerData = getAccountExport(volunteer.id);
    expect(volunteerData.subVolunteered).toHaveLength(1);
    expect(volunteerData.subPlacements).toHaveLength(1);
    expect(volunteerData.subRequestsPosted).toEqual([]);
  });

  it("includes direct messages sent/received, isolated from an unrelated user", () => {
    const { dm, player } = buildScenario("dms7");
    const stranger = makeUser("dms7", "Stranger");

    const playerData = getAccountExport(player.id);
    expect(playerData.directMessagesSent).toHaveLength(1);
    expect(playerData.directMessagesSent[0].body).toContain("session 3");
    expect(playerData.directMessagesReceived).toHaveLength(1);
    expect(playerData.directMessagesReceived[0].sender_id).toBe(dm.id);

    const strangerData = getAccountExport(stranger.id);
    expect(strangerData.directMessagesSent).toEqual([]);
    expect(strangerData.directMessagesReceived).toEqual([]);
  });

  it("includes campaign table-chat messages sent", () => {
    const { player } = buildScenario("chat8");
    const data = getAccountExport(player.id);
    expect(data.campaignMessagesSent).toHaveLength(1);
    expect(data.campaignMessagesSent[0].body).toBe("Excited for tonight!");
  });

  it("includes ratings given and received, with tags parsed as real arrays", () => {
    const { dm, player } = buildScenario("ratings9");
    const playerData = getAccountExport(player.id);
    expect(playerData.ratingsGiven).toHaveLength(1);
    expect(playerData.ratingsGiven[0]).toMatchObject({ ratee_id: dm.id, stars: 5, tags: ["Great narrator"] });
    expect(playerData.ratingsReceived).toHaveLength(1);
    expect(playerData.ratingsReceived[0]).toMatchObject({ rater_id: dm.id, stars: 4, tags: ["On time"] });
    expect(playerData.campaignRatingsGiven).toHaveLength(1);
    expect(playerData.campaignRatingsGiven[0]).toMatchObject({ stars: 5, tags: ["Well organized"] });
  });

  it("includes session log entries authored (DM) and kudos given (player)", () => {
    const { dm, player, entry } = buildScenario("log10");
    const dmData = getAccountExport(dm.id);
    expect(dmData.sessionLogEntriesAuthored).toHaveLength(1);
    expect(dmData.sessionLogEntriesAuthored[0].id).toBe(entry.id);

    const playerData = getAccountExport(player.id);
    expect(playerData.sessionLogKudosGiven).toHaveLength(1);
    expect(playerData.sessionLogKudosGiven[0].entryId).toBe(entry.id);
  });

  it("includes notifications generated by this user's own activity", () => {
    const { dm, player } = buildScenario("notif11");
    expect(getAccountExport(dm.id).notifications.length).toBeGreaterThan(0);
    expect(getAccountExport(player.id).notifications.length).toBeGreaterThan(0);
  });

  it("includes following and followers, each enriched with a display name", () => {
    const { dm, player } = buildScenario("follow12");
    const playerData = getAccountExport(player.id);
    expect(playerData.following).toEqual([
      { userId: dm.id, displayName: "DM", since: expect.any(String) },
    ]);
    expect(playerData.followers).toEqual([]);

    const dmData = getAccountExport(dm.id);
    expect(dmData.followers).toEqual([
      { userId: player.id, displayName: "Player", since: expect.any(String) },
    ]);
    expect(dmData.following).toEqual([]);
  });

  it("includes board threads/replies authored and reports filed", () => {
    const { player, volunteer, thread } = buildScenario("boards13");
    const playerData = getAccountExport(player.id);
    expect(playerData.boardThreadsAuthored).toHaveLength(1);
    expect(playerData.boardThreadsAuthored[0].id).toBe(thread.id);

    const volunteerData = getAccountExport(volunteer.id);
    expect(volunteerData.boardRepliesAuthored).toHaveLength(1);
    expect(volunteerData.boardReportsFiled).toHaveLength(1);
    expect(volunteerData.boardReportsFiled[0].thread_id).toBe(thread.id);
  });

  it("includes session RSVPs and DM-recorded attendance about the user", () => {
    const { player } = buildScenario("rsvp14");
    const data = getAccountExport(player.id);
    expect(data.sessionRsvps).toHaveLength(1);
    expect(data.sessionRsvps[0].response).toBe("confirmed");
    expect(data.sessionLogAttendanceRecorded).toHaveLength(1);
    expect(data.sessionLogAttendanceRecorded[0].attended).toBe(1);
  });

  it("includes campaign resources this user uploaded, with the actual file data", () => {
    const { player } = buildScenario("resources15");
    const data = getAccountExport(player.id);
    expect(data.campaignResourcesUploaded).toHaveLength(1);
    expect(data.campaignResourcesUploaded[0]).toMatchObject({
      name: "Battle map",
      data_url: "data:image/png;base64,aGVsbG8=",
    });
  });

  it("matches getUserStats() for the stats section", () => {
    const { dm } = buildScenario("stats16");
    const data = getAccountExport(dm.id);
    expect(data.stats).toEqual(getUserStats(dm.id));
    expect(data.stats.campaignsAsDm).toBeGreaterThan(0);
  });
});
