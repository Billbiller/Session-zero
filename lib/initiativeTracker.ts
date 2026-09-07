import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { isDm } from "./access";
import type { InitiativeEntry } from "./types";

export class InitiativeTrackerError extends Error {}

const MAX_NAME = 100;
const MAX_HP = 50;
const MAX_NOTES = 500;

/** Every check below reuses lib/access.ts's isDm() -- see backlog #33's
 * own design note there: this tool is deliberately DM-only, not shared
 * with the rest of the party the way session log/party notes are. */
function requireDm(campaignId: string, userId: string): void {
  if (!isDm(userId, campaignId)) {
    throw new InitiativeTrackerError(
      "Only the DM can manage this campaign's initiative tracker."
    );
  }
}

/** Ordered by order_index -- an app-maintained running order the DM
 * controls explicitly via move-up/move-down (see moveInitiativeEntry
 * below), independent of the `initiative` value recorded on each entry.
 * Callers must check DM access themselves before calling this (same
 * convention as lib/partyNotes.ts's getNotes()/lib/campaignMessages.ts's
 * listCampaignMessages() -- the read helper does no auth of its own). */
export function listInitiativeEntries(campaignId: string): InitiativeEntry[] {
  return db
    .prepare(
      "SELECT * FROM initiative_entries WHERE campaign_id = ? ORDER BY order_index ASC, rowid ASC"
    )
    .all(campaignId) as InitiativeEntry[];
}

function getEntry(entryId: string): InitiativeEntry | null {
  const row = db.prepare("SELECT * FROM initiative_entries WHERE id = ?").get(entryId) as
    | InitiativeEntry
    | undefined;
  return row ?? null;
}

function nextOrderIndex(campaignId: string): number {
  const row = db
    .prepare("SELECT MAX(order_index) as maxIdx FROM initiative_entries WHERE campaign_id = ?")
    .get(campaignId) as { maxIdx: number | null };
  return (row.maxIdx ?? -1) + 1;
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new InitiativeTrackerError("Name can't be empty.");
  if (trimmed.length > MAX_NAME) {
    throw new InitiativeTrackerError(`Name can't be longer than ${MAX_NAME} characters.`);
  }
  return trimmed;
}

function validateInitiative(initiative: number): number {
  if (typeof initiative !== "number" || !Number.isFinite(initiative)) {
    throw new InitiativeTrackerError("Initiative must be a number.");
  }
  return initiative;
}

function validateHp(hp: string | null | undefined): string | null {
  const trimmed = (hp ?? "").trim();
  if (trimmed.length > MAX_HP) {
    throw new InitiativeTrackerError(`HP can't be longer than ${MAX_HP} characters.`);
  }
  return trimmed || null;
}

function validateNotes(notes: string | null | undefined): string {
  const trimmed = (notes ?? "").trim();
  if (trimmed.length > MAX_NOTES) {
    throw new InitiativeTrackerError(`Notes can't be longer than ${MAX_NOTES} characters.`);
  }
  return trimmed;
}

/** Appends a new combatant to the end of the current running order. The
 * DM decides where it actually belongs via moveInitiativeEntry
 * afterward -- entries are never auto-sorted by their initiative value
 * (see the schema comment in lib/db.ts for the reasoning). */
export function addInitiativeEntry(
  campaignId: string,
  userId: string,
  input: { name: string; initiative: number; hp?: string | null; notes?: string | null }
): InitiativeEntry {
  requireDm(campaignId, userId);
  const now = new Date().toISOString();
  const entry: InitiativeEntry = {
    id: uuidv4(),
    campaign_id: campaignId,
    name: validateName(input.name),
    initiative: validateInitiative(input.initiative),
    hp: validateHp(input.hp),
    notes: validateNotes(input.notes),
    order_index: nextOrderIndex(campaignId),
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO initiative_entries
       (id, campaign_id, name, initiative, hp, notes, order_index, created_at, updated_at)
     VALUES (@id, @campaign_id, @name, @initiative, @hp, @notes, @order_index, @created_at, @updated_at)`
  ).run(entry);
  return entry;
}

export function updateInitiativeEntry(
  entryId: string,
  userId: string,
  updates: { name?: string; initiative?: number; hp?: string | null; notes?: string | null }
): InitiativeEntry {
  const entry = getEntry(entryId);
  if (!entry) throw new InitiativeTrackerError("Entry not found.");
  requireDm(entry.campaign_id, userId);

  const name = updates.name !== undefined ? validateName(updates.name) : entry.name;
  const initiative =
    updates.initiative !== undefined ? validateInitiative(updates.initiative) : entry.initiative;
  const hp = updates.hp !== undefined ? validateHp(updates.hp) : entry.hp;
  const notes = updates.notes !== undefined ? validateNotes(updates.notes) : entry.notes;
  const now = new Date().toISOString();

  db.prepare(
    "UPDATE initiative_entries SET name = ?, initiative = ?, hp = ?, notes = ?, updated_at = ? WHERE id = ?"
  ).run(name, initiative, hp, notes, now, entryId);

  return getEntry(entryId) as InitiativeEntry;
}

/** Removes a combatant and re-tightens the remaining order_index values
 * to stay contiguous (0..n-1), so a later move-up/move-down doesn't have
 * to deal with gaps. */
export function removeInitiativeEntry(entryId: string, userId: string): void {
  const entry = getEntry(entryId);
  if (!entry) throw new InitiativeTrackerError("Entry not found.");
  requireDm(entry.campaign_id, userId);

  db.prepare("DELETE FROM initiative_entries WHERE id = ?").run(entryId);

  const remaining = listInitiativeEntries(entry.campaign_id);
  remaining.forEach((e, i) => {
    if (e.order_index !== i) {
      db.prepare("UPDATE initiative_entries SET order_index = ? WHERE id = ?").run(i, e.id);
    }
  });
}

/** Swaps a combatant with its immediate neighbor in the running order.
 * A no-op (returns the list unchanged) if already at that end -- this is
 * a simple move-up/move-down affordance, deliberately not drag-and-drop
 * (out of scope per backlog #33's own "basics" framing). */
export function moveInitiativeEntry(
  entryId: string,
  userId: string,
  direction: "up" | "down"
): InitiativeEntry[] {
  const entry = getEntry(entryId);
  if (!entry) throw new InitiativeTrackerError("Entry not found.");
  requireDm(entry.campaign_id, userId);

  const entries = listInitiativeEntries(entry.campaign_id);
  const idx = entries.findIndex((e) => e.id === entryId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= entries.length) {
    return entries;
  }
  const a = entries[idx];
  const b = entries[swapIdx];
  const now = new Date().toISOString();
  db.prepare("UPDATE initiative_entries SET order_index = ?, updated_at = ? WHERE id = ?").run(
    b.order_index,
    now,
    a.id
  );
  db.prepare("UPDATE initiative_entries SET order_index = ?, updated_at = ? WHERE id = ?").run(
    a.order_index,
    now,
    b.id
  );
  return listInitiativeEntries(entry.campaign_id);
}

/** Wipes the whole tracker for a campaign -- the explicit "clear"
 * action backlog #33's own text calls for, distinct from removing
 * combatants one at a time. Session-local working state resets to
 * empty; nothing is archived. */
export function clearInitiativeEntries(campaignId: string, userId: string): void {
  requireDm(campaignId, userId);
  db.prepare("DELETE FROM initiative_entries WHERE campaign_id = ?").run(campaignId);
}
