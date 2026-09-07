import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { isDm } from "./access";
import type { NpcNote } from "./types";

export class NpcNoteError extends Error {}

const MAX_NAME = 100;
const MAX_NOTES = 2000;

/** DM-only, same boundary and reasoning as lib/initiativeTracker.ts's
 * requireDm() -- NPC quick-notes are a prep tool for the DM's eyes, not
 * shared with the party (see lib/access.ts's isDm()). */
function requireDm(campaignId: string, userId: string): void {
  if (!isDm(userId, campaignId)) {
    throw new NpcNoteError("Only the DM can manage this campaign's NPC notes.");
  }
}

/** Oldest-first (creation order) -- matches this app's existing
 * campaign-scoped-list convention (e.g. lib/characters.ts's
 * listCharactersForCampaign()), rather than the newest-first ordering
 * used for a single user's own personal lists. Callers must check DM
 * access themselves before calling this, same convention as
 * listInitiativeEntries()/getNotes()/listCampaignMessages(). */
export function listNpcNotes(campaignId: string): NpcNote[] {
  return db
    .prepare("SELECT * FROM npc_notes WHERE campaign_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(campaignId) as NpcNote[];
}

function getNote(noteId: string): NpcNote | null {
  const row = db.prepare("SELECT * FROM npc_notes WHERE id = ?").get(noteId) as
    | NpcNote
    | undefined;
  return row ?? null;
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new NpcNoteError("Name can't be empty.");
  if (trimmed.length > MAX_NAME) {
    throw new NpcNoteError(`Name can't be longer than ${MAX_NAME} characters.`);
  }
  return trimmed;
}

function validateNotes(notes: string | null | undefined): string {
  const trimmed = (notes ?? "").trim();
  if (trimmed.length > MAX_NOTES) {
    throw new NpcNoteError(`Notes can't be longer than ${MAX_NOTES} characters.`);
  }
  return trimmed;
}

export function addNpcNote(
  campaignId: string,
  userId: string,
  input: { name: string; notes?: string | null }
): NpcNote {
  requireDm(campaignId, userId);
  const now = new Date().toISOString();
  const note: NpcNote = {
    id: uuidv4(),
    campaign_id: campaignId,
    name: validateName(input.name),
    notes: validateNotes(input.notes),
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO npc_notes (id, campaign_id, name, notes, created_at, updated_at)
     VALUES (@id, @campaign_id, @name, @notes, @created_at, @updated_at)`
  ).run(note);
  return note;
}

export function updateNpcNote(
  noteId: string,
  userId: string,
  updates: { name?: string; notes?: string | null }
): NpcNote {
  const note = getNote(noteId);
  if (!note) throw new NpcNoteError("NPC not found.");
  requireDm(note.campaign_id, userId);

  const name = updates.name !== undefined ? validateName(updates.name) : note.name;
  const notes = updates.notes !== undefined ? validateNotes(updates.notes) : note.notes;
  const now = new Date().toISOString();

  db.prepare("UPDATE npc_notes SET name = ?, notes = ?, updated_at = ? WHERE id = ?").run(
    name,
    notes,
    now,
    noteId
  );
  return getNote(noteId) as NpcNote;
}

export function deleteNpcNote(noteId: string, userId: string): void {
  const note = getNote(noteId);
  if (!note) throw new NpcNoteError("NPC not found.");
  requireDm(note.campaign_id, userId);
  db.prepare("DELETE FROM npc_notes WHERE id = ?").run(noteId);
}
