import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign } from "./campaigns";
import { getUserById } from "./auth";
import { hasPrivateAccess, isDm } from "./access";
import { notify } from "./notifications";
import type { CampaignResource, CampaignResourceWithUploader } from "./types";

export class CampaignResourceError extends Error {}

const MAX_NAME = 150;
const MAX_DESCRIPTION = 1000;

// Backlog #34, phase 1: unlike character portraits (#26, images only,
// capped at ~200KB), a resource vault needs to hold maps, handouts, and
// homebrew notes as PDFs and plain text too, and those files are
// typically bigger than a small profile picture. Base64 inflates the
// *encoded* string to roughly 4/3 of the original file's byte size, so
// the cap below is expressed on the encoded data: URL length the same
// way lib/characters.ts's MAX_PORTRAIT_DATA_URL_LENGTH is.
//
// Chosen limit: a 4MB source file (~5.33M encoded chars, rounded up to a
// clean 5,600,000-character budget below). Reasoning: 4MB comfortably
// covers a decent-resolution map/handout scan or a many-page homebrew
// PDF while still keeping any single row (and this table can hold many
// rows per campaign, unlike the single portrait column per character)
// from meaningfully bloating the SQLite file — a campaign with a dozen
// resources at the cap is still well under 100MB, which is fine for the
// file-based (not in-memory) better-sqlite3 setup this app already uses.
// No server-side compression/transformation exists here either, matching
// the portrait feature's own "reject outright, don't transform" choice.
const MAX_RESOURCE_DATA_URL_LENGTH = 5_600_000;
const RESOURCE_DATA_URL_PATTERN =
  /^data:(image\/(png|jpeg|jpg|webp|gif)|application\/pdf|text\/plain);base64,/;

function extractMimeType(dataUrl: string): string {
  // The pattern above already validated the shape, so this always
  // matches when called after validateResourceDataUrl().
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match ? match[1] : "application/octet-stream";
}

/** Validates an uploaded resource's data: URL shape and size. Returns the
 * value unchanged — no server-side transformation, same "reject
 * outright" convention as lib/characters.ts's validatePortraitDataUrl().
 * Unlike a portrait, a resource is never optional/nullable — a vault
 * entry with no file wouldn't mean anything, so this is always required
 * on create (there's no "remove the file but keep the entry" concept;
 * removing a resource means deleting the whole entry). */
function validateResourceDataUrl(value: string): string {
  if (!value) {
    throw new CampaignResourceError("A file is required.");
  }
  if (value.length > MAX_RESOURCE_DATA_URL_LENGTH) {
    throw new CampaignResourceError(
      "That file is too large — please use a smaller file (roughly under 4MB)."
    );
  }
  if (!RESOURCE_DATA_URL_PATTERN.test(value)) {
    throw new CampaignResourceError(
      "Resources must be a PNG, JPEG, WEBP, or GIF image, a PDF, or a plain text file."
    );
  }
  return value;
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new CampaignResourceError("Name can't be empty.");
  if (trimmed.length > MAX_NAME) {
    throw new CampaignResourceError(`Name can't be longer than ${MAX_NAME} characters.`);
  }
  return trimmed;
}

function validateDescription(description: string | null | undefined): string {
  const trimmed = (description ?? "").trim();
  if (trimmed.length > MAX_DESCRIPTION) {
    throw new CampaignResourceError(
      `Description can't be longer than ${MAX_DESCRIPTION} characters.`
    );
  }
  return trimmed;
}

/** Every resource uploaded to a campaign's vault, oldest first (matches
 * this app's existing campaign-scoped-list convention, e.g.
 * lib/characters.ts's listCharactersForCampaign() and
 * lib/npcNotes.ts's listNpcNotes()), enriched with the uploader's
 * display name. Callers must check hasPrivateAccess themselves before
 * calling this — same convention as listCampaignMessages()/getNotes(),
 * where the access check lives at the call site (the API route) rather
 * than being duplicated inside every read helper. */
export function listCampaignResources(campaignId: string): CampaignResourceWithUploader[] {
  const rows = db
    .prepare(
      "SELECT * FROM campaign_resources WHERE campaign_id = ? ORDER BY created_at ASC, rowid ASC"
    )
    .all(campaignId) as CampaignResource[];
  return rows.map((row) => ({
    ...row,
    uploaderName: getUserById(row.uploader_id)?.display_name ?? "Unknown",
  }));
}

function getResource(resourceId: string): CampaignResource | null {
  const row = db.prepare("SELECT * FROM campaign_resources WHERE id = ?").get(resourceId) as
    | CampaignResource
    | undefined;
  return row ?? null;
}

/** Uploads a new resource to a campaign's vault. Restricted to the same
 * hasPrivateAccess boundary already gating party notes/session log/table
 * chat (DM + approved active members) — the boundary the backlog line
 * itself calls for ("visible to the campaign's active party ... a DM's
 * homebrew notes for their table aren't meant to be public"). Any active
 * party member can upload, not just the DM — a player sharing a handout
 * or character art is just as legitimate a use as a DM's own maps/notes,
 * and this app has no existing convention that would justify singling
 * out uploads as DM-only the way the initiative tracker/NPC notes are
 * (backlog #33) — those are DM *prep* tools hidden from players by
 * design, whereas a resource vault is closer to party notes/table chat,
 * a shared space the whole table contributes to. */
export function addCampaignResource(
  campaignId: string,
  uploaderId: string,
  input: { name: string; description?: string | null; dataUrl: string }
): CampaignResource {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new CampaignResourceError("Campaign not found.");
  if (!hasPrivateAccess(uploaderId, campaignId)) {
    throw new CampaignResourceError(
      "Only the DM or an active member of this campaign can upload resources here."
    );
  }
  const name = validateName(input.name);
  const description = validateDescription(input.description);
  const dataUrl = validateResourceDataUrl(input.dataUrl);
  const now = new Date().toISOString();
  const resource: CampaignResource = {
    id: uuidv4(),
    campaign_id: campaignId,
    uploader_id: uploaderId,
    name,
    description,
    mime_type: extractMimeType(dataUrl),
    data_url: dataUrl,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO campaign_resources (id, campaign_id, uploader_id, name, description, mime_type, data_url, created_at, updated_at)
     VALUES (@id, @campaign_id, @uploader_id, @name, @description, @mime_type, @data_url, @created_at, @updated_at)`
  ).run(resource);

  // Fires on every upload (not throttled the way campaign_chat_message
  // is) — uploads are expected to be infrequent, more like
  // party_notes_updated/session_log_posted than a fast-moving chat
  // thread, so there's no burst-of-messages noise problem to solve here.
  const uploader = getUserById(uploaderId);
  const others = db
    .prepare(
      "SELECT user_id FROM memberships WHERE campaign_id = ? AND status = 'approved'"
    )
    .all(campaignId) as { user_id: string }[];
  const recipients = new Set(others.map((m) => m.user_id));
  recipients.add(campaign.dm_id);
  recipients.delete(uploaderId);
  for (const recipientId of recipients) {
    notify(
      recipientId,
      "campaign_resource_uploaded",
      campaignId,
      `${uploader?.display_name ?? "Someone"} added "${name}" to "${campaign.title}"'s resource vault.`
    );
  }

  return resource;
}

/** Only the uploader or the campaign's DM can edit a resource's metadata
 * or delete it outright — a deliberate narrower boundary than upload
 * access (any active party member), so one player can't rename or
 * delete a resource someone else on the table contributed. The DM is
 * included as a backstop (matching how a DM can already moderate their
 * own campaign's other shared content, e.g. editing/deleting any session
 * log entry) so a departed or unreachable uploader's file isn't stuck
 * forever if the DM needs to clean up the vault. */
function requireUploaderOrDm(resource: CampaignResource, userId: string): void {
  if (resource.uploader_id === userId) return;
  if (isDm(userId, resource.campaign_id)) return;
  throw new CampaignResourceError(
    "Only the person who uploaded this, or the campaign's DM, can manage it."
  );
}

/** Edits a resource's name/description only — re-uploading a different
 * file is out of scope for this phase (deleting and re-adding covers
 * that case, and keeps this update path simple: metadata only, never
 * the underlying data_url/mime_type). */
export function updateCampaignResource(
  resourceId: string,
  userId: string,
  updates: { name?: string; description?: string | null }
): CampaignResource {
  const resource = getResource(resourceId);
  if (!resource) throw new CampaignResourceError("Resource not found.");
  requireUploaderOrDm(resource, userId);

  const name = updates.name !== undefined ? validateName(updates.name) : resource.name;
  const description =
    updates.description !== undefined
      ? validateDescription(updates.description)
      : resource.description;
  const now = new Date().toISOString();

  db.prepare(
    "UPDATE campaign_resources SET name = ?, description = ?, updated_at = ? WHERE id = ?"
  ).run(name, description, now, resourceId);
  return getResource(resourceId) as CampaignResource;
}

export function deleteCampaignResource(resourceId: string, userId: string): void {
  const resource = getResource(resourceId);
  if (!resource) throw new CampaignResourceError("Resource not found.");
  requireUploaderOrDm(resource, userId);
  db.prepare("DELETE FROM campaign_resources WHERE id = ?").run(resourceId);
}
