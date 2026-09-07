import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns";
import { requestJoin, approveRequest, leaveCampaign } from "@/lib/memberships";
import { listNotifications } from "@/lib/notifications";
import { setPreference } from "@/lib/notificationPreferences";
import {
  listCampaignResources,
  addCampaignResource,
  updateCampaignResource,
  deleteCampaignResource,
  CampaignResourceError,
} from "@/lib/campaignResources";

const PNG_DATA_URL = "data:image/png;base64,aGVsbG8=";
const PDF_DATA_URL = "data:application/pdf;base64,aGVsbG8=";
const TEXT_DATA_URL = "data:text/plain;base64,aGVsbG8=";

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

describe("resource vault, phase 1 (backlog #34)", () => {
  it("lets the DM and active members upload, trimmed, listed oldest-first with uploader names", () => {
    const { dm, campaign, p1 } = setupParty("res1");
    addCampaignResource(campaign.id, dm.id, {
      name: "  Dungeon map  ",
      description: "  Level 1  ",
      dataUrl: PNG_DATA_URL,
    });
    addCampaignResource(campaign.id, p1.id, { name: "Character sheet", dataUrl: PDF_DATA_URL });

    const resources = listCampaignResources(campaign.id);
    expect(resources.map((r) => r.name)).toEqual(["Dungeon map", "Character sheet"]);
    expect(resources[0].description).toBe("Level 1");
    expect(resources[0].uploaderName).toBe("DM");
    expect(resources[1].uploaderName).toBe("P1");
  });

  it("defaults description to empty when omitted", () => {
    const { dm, campaign } = setupParty("res2");
    const resource = addCampaignResource(campaign.id, dm.id, { name: "Homebrew rules", dataUrl: TEXT_DATA_URL });
    expect(resource.description).toBe("");
  });

  it("stores the mime type extracted from the data URL", () => {
    const { dm, campaign } = setupParty("res3");
    const png = addCampaignResource(campaign.id, dm.id, { name: "A", dataUrl: PNG_DATA_URL });
    const pdf = addCampaignResource(campaign.id, dm.id, { name: "B", dataUrl: PDF_DATA_URL });
    const text = addCampaignResource(campaign.id, dm.id, { name: "C", dataUrl: TEXT_DATA_URL });
    expect(png.mime_type).toBe("image/png");
    expect(pdf.mime_type).toBe("application/pdf");
    expect(text.mime_type).toBe("text/plain");
  });

  it("rejects an upload from a complete stranger", () => {
    const { campaign } = setupParty("res4");
    const stranger = signUp("Stranger", "res4-s@example.com", "testpassword123");
    expect(() =>
      addCampaignResource(campaign.id, stranger.id, { name: "Sneaky", dataUrl: PNG_DATA_URL })
    ).toThrow(CampaignResourceError);
  });

  it("rejects an upload from a still-pending (not-yet-approved) requester", () => {
    const { campaign } = setupParty("res5");
    const pending = signUp("Pending", "res5-pending@example.com", "testpassword123");
    requestJoin(campaign.id, pending.id);
    expect(() =>
      addCampaignResource(campaign.id, pending.id, { name: "Nope", dataUrl: PNG_DATA_URL })
    ).toThrow(CampaignResourceError);
  });

  it("rejects an upload from a member who has since left", () => {
    const { campaign, p1 } = setupParty("res6");
    leaveCampaign(campaign.id, p1.id);
    expect(() =>
      addCampaignResource(campaign.id, p1.id, { name: "Nope", dataUrl: PNG_DATA_URL })
    ).toThrow(CampaignResourceError);
  });

  it("keeps a departed member's past upload visible in the vault's history", () => {
    const { campaign, p1 } = setupParty("res7");
    addCampaignResource(campaign.id, p1.id, { name: "Before I left", dataUrl: PNG_DATA_URL });
    leaveCampaign(campaign.id, p1.id);
    const resources = listCampaignResources(campaign.id);
    expect(resources.map((r) => r.name)).toContain("Before I left");
  });

  it("rejects a blank name", () => {
    const { dm, campaign } = setupParty("res8");
    expect(() =>
      addCampaignResource(campaign.id, dm.id, { name: "   ", dataUrl: PNG_DATA_URL })
    ).toThrow(CampaignResourceError);
  });

  it("rejects an over-length name or description", () => {
    const { dm, campaign } = setupParty("res9");
    expect(() =>
      addCampaignResource(campaign.id, dm.id, { name: "x".repeat(151), dataUrl: PNG_DATA_URL })
    ).toThrow(CampaignResourceError);
    expect(() =>
      addCampaignResource(campaign.id, dm.id, {
        name: "Ok",
        description: "x".repeat(1001),
        dataUrl: PNG_DATA_URL,
      })
    ).toThrow(CampaignResourceError);
  });

  it("rejects a data URL that isn't a recognized image/PDF/text shape", () => {
    const { dm, campaign } = setupParty("res10");
    expect(() =>
      addCampaignResource(campaign.id, dm.id, { name: "Bad", dataUrl: "not-a-data-url" })
    ).toThrow(CampaignResourceError);
    expect(() =>
      addCampaignResource(campaign.id, dm.id, {
        name: "Bad video",
        dataUrl: "data:video/mp4;base64,aGVsbG8=",
      })
    ).toThrow(CampaignResourceError);
  });

  it("rejects a data URL over the max length", () => {
    const { dm, campaign } = setupParty("res11");
    const tooLong = "data:image/png;base64," + "a".repeat(5_600_000);
    expect(() =>
      addCampaignResource(campaign.id, dm.id, { name: "TooBig", dataUrl: tooLong })
    ).toThrow(CampaignResourceError);
  });

  it("rejects an upload with no file", () => {
    const { dm, campaign } = setupParty("res12");
    expect(() =>
      addCampaignResource(campaign.id, dm.id, { name: "Empty", dataUrl: "" })
    ).toThrow(CampaignResourceError);
  });

  it("lets the uploader update their own resource's name/description", () => {
    const { p1, campaign } = setupParty("res13");
    const resource = addCampaignResource(campaign.id, p1.id, { name: "Map", dataUrl: PNG_DATA_URL });
    const updated = updateCampaignResource(resource.id, p1.id, {
      name: "Updated map",
      description: "v2",
    });
    expect(updated.name).toBe("Updated map");
    expect(updated.description).toBe("v2");
  });

  it("lets the DM update a resource uploaded by someone else", () => {
    const { dm, p1, campaign } = setupParty("res14");
    const resource = addCampaignResource(campaign.id, p1.id, { name: "Map", dataUrl: PNG_DATA_URL });
    const updated = updateCampaignResource(resource.id, dm.id, { name: "DM-edited map" });
    expect(updated.name).toBe("DM-edited map");
  });

  it("rejects an update from a different active member who isn't the uploader or DM", () => {
    const { p1, p2, campaign } = setupParty("res15");
    const resource = addCampaignResource(campaign.id, p1.id, { name: "Map", dataUrl: PNG_DATA_URL });
    expect(() => updateCampaignResource(resource.id, p2.id, { name: "Hacked" })).toThrow(
      CampaignResourceError
    );
  });

  it("rejects updating an unknown resource id", () => {
    const { dm } = setupParty("res16");
    expect(() => updateCampaignResource("nonexistent", dm.id, { name: "Hacked" })).toThrow(
      CampaignResourceError
    );
  });

  it("leaves an existing name/description untouched when omitted from an update", () => {
    const { p1, campaign } = setupParty("res17");
    const resource = addCampaignResource(campaign.id, p1.id, {
      name: "Map",
      description: "Original",
      dataUrl: PNG_DATA_URL,
    });
    const updated = updateCampaignResource(resource.id, p1.id, { name: "Renamed" });
    expect(updated.name).toBe("Renamed");
    expect(updated.description).toBe("Original");
  });

  it("lets the uploader delete their own resource, and the DM delete anyone's", () => {
    const { dm, p1, p2, campaign } = setupParty("res18");
    const own = addCampaignResource(campaign.id, p1.id, { name: "Mine", dataUrl: PNG_DATA_URL });
    deleteCampaignResource(own.id, p1.id);

    const other = addCampaignResource(campaign.id, p2.id, { name: "Theirs", dataUrl: PNG_DATA_URL });
    deleteCampaignResource(other.id, dm.id);

    expect(listCampaignResources(campaign.id)).toEqual([]);
  });

  it("rejects a delete from a different active member who isn't the uploader or DM", () => {
    const { p1, p2, campaign } = setupParty("res19");
    const resource = addCampaignResource(campaign.id, p1.id, { name: "Map", dataUrl: PNG_DATA_URL });
    expect(() => deleteCampaignResource(resource.id, p2.id)).toThrow(CampaignResourceError);
  });

  it("rejects deleting an unknown resource id", () => {
    const { dm } = setupParty("res20");
    expect(() => deleteCampaignResource("nonexistent", dm.id)).toThrow(CampaignResourceError);
  });

  it("isolates resource lists per campaign", () => {
    const { dm, campaign } = setupParty("res21a");
    const other = setupParty("res21b");
    addCampaignResource(campaign.id, dm.id, { name: "A", dataUrl: PNG_DATA_URL });
    addCampaignResource(other.campaign.id, other.dm.id, { name: "B", dataUrl: PNG_DATA_URL });
    expect(listCampaignResources(campaign.id).map((r) => r.name)).toEqual(["A"]);
    expect(listCampaignResources(other.campaign.id).map((r) => r.name)).toEqual(["B"]);
  });

  it("notifies the rest of the active party (not the uploader) on a new upload", () => {
    const { dm, p1, p2, campaign } = setupParty("res22");
    addCampaignResource(campaign.id, p1.id, { name: "Map", dataUrl: PNG_DATA_URL });

    const dmNotifications = listNotifications(dm.id).items.filter(
      (n) => n.type === "campaign_resource_uploaded"
    );
    const p2Notifications = listNotifications(p2.id).items.filter(
      (n) => n.type === "campaign_resource_uploaded"
    );
    const p1Notifications = listNotifications(p1.id).items.filter(
      (n) => n.type === "campaign_resource_uploaded"
    );
    expect(dmNotifications).toHaveLength(1);
    expect(p2Notifications).toHaveLength(1);
    expect(p1Notifications).toHaveLength(0);
  });

  it("respects a muted campaign_resource_uploaded preference", () => {
    const { dm, p1, campaign } = setupParty("res23");
    setPreference(dm.id, "campaign_resource_uploaded", false);
    addCampaignResource(campaign.id, p1.id, { name: "Map", dataUrl: PNG_DATA_URL });
    const dmNotifications = listNotifications(dm.id).items.filter(
      (n) => n.type === "campaign_resource_uploaded"
    );
    expect(dmNotifications).toHaveLength(0);
  });
});
