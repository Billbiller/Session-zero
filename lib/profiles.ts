import db from "./db";
import { SESSION_FORMAT_PREFERENCES, type Campaign, type Profile, type SessionFormatPreference } from "./types";

export class ProfileError extends Error {}

const MAX_BIO = 2000;
const MAX_PREFERRED_SYSTEMS = 300;
const MAX_AVAILABILITY = 300;
const MAX_LOCATION = 200;

function isKnownSessionFormatPreference(value: string): value is SessionFormatPreference {
  return (SESSION_FORMAT_PREFERENCES as readonly string[]).includes(value);
}

function defaultProfile(userId: string): Profile {
  return {
    user_id: userId,
    bio: "",
    preferred_systems: "",
    availability: "",
    location: "",
    new_to_tabletop: 0,
    session_format_preference: null,
    updated_at: null,
  };
}

/** Every user has an implicit empty profile until they save one — mirrors
 * notification_preferences' "default until a row says otherwise" pattern. */
export function getProfile(userId: string): Profile {
  const row = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as
    | Profile
    | undefined;
  return row ?? defaultProfile(userId);
}

export function upsertProfile(
  userId: string,
  input: {
    bio?: string;
    preferredSystems?: string;
    availability?: string;
    location?: string;
    /** undefined = leave unchanged, matching every other field here. */
    newToTabletop?: boolean;
    /** Backlog #41 phase 1: the player-side symmetric preference to a
     * campaign's session_format -- undefined = leave unchanged, null =
     * clear back to "no preference stated", a recognized value = set it.
     * Purely informational for this phase (see the field's own doc
     * comment on the Profile type) -- not wired into any ranking. */
    sessionFormatPreference?: SessionFormatPreference | null;
  }
): Profile {
  const current = getProfile(userId);
  const bio = (input.bio ?? current.bio).trim();
  const preferredSystems = (input.preferredSystems ?? current.preferred_systems).trim();
  const availability = (input.availability ?? current.availability).trim();
  const location = (input.location ?? current.location).trim();
  const newToTabletop =
    input.newToTabletop !== undefined ? (input.newToTabletop ? 1 : 0) : current.new_to_tabletop;
  const sessionFormatPreference =
    input.sessionFormatPreference !== undefined
      ? input.sessionFormatPreference
      : current.session_format_preference;

  if (
    sessionFormatPreference !== null &&
    sessionFormatPreference !== undefined &&
    !isKnownSessionFormatPreference(sessionFormatPreference)
  ) {
    throw new ProfileError("Not a recognized session format preference.");
  }

  if (bio.length > MAX_BIO) {
    throw new ProfileError(`Bio can't be longer than ${MAX_BIO} characters.`);
  }
  if (preferredSystems.length > MAX_PREFERRED_SYSTEMS) {
    throw new ProfileError(
      `Preferred systems can't be longer than ${MAX_PREFERRED_SYSTEMS} characters.`
    );
  }
  if (availability.length > MAX_AVAILABILITY) {
    throw new ProfileError(
      `Availability can't be longer than ${MAX_AVAILABILITY} characters.`
    );
  }
  if (location.length > MAX_LOCATION) {
    throw new ProfileError(`Location can't be longer than ${MAX_LOCATION} characters.`);
  }

  const updated_at = new Date().toISOString();
  db.prepare(
    `INSERT INTO profiles (user_id, bio, preferred_systems, availability, location, new_to_tabletop, session_format_preference, updated_at)
     VALUES (@user_id, @bio, @preferred_systems, @availability, @location, @new_to_tabletop, @session_format_preference, @updated_at)
     ON CONFLICT (user_id) DO UPDATE SET
       bio = excluded.bio,
       preferred_systems = excluded.preferred_systems,
       availability = excluded.availability,
       location = excluded.location,
       new_to_tabletop = excluded.new_to_tabletop,
       session_format_preference = excluded.session_format_preference,
       updated_at = excluded.updated_at`
  ).run({
    user_id: userId,
    bio,
    preferred_systems: preferredSystems,
    availability,
    location,
    new_to_tabletop: newToTabletop,
    session_format_preference: sessionFormatPreference,
    updated_at,
  });
  return getProfile(userId);
}

/** Splits the stored comma-separated preferred-systems string into a clean
 * list of individual system names for display (chips, etc). */
export function splitPreferredSystems(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface MyCampaigns {
  dming: Campaign[];
  playing: Campaign[];
}

/** Campaigns a user is DMing, and campaigns they're an active (approved)
 * player in — the data behind the "My campaigns" view on the profile page. */
export function myCampaigns(userId: string): MyCampaigns {
  const dming = db
    .prepare(
      "SELECT * FROM campaigns WHERE dm_id = ? ORDER BY created_at DESC, rowid DESC"
    )
    .all(userId) as Campaign[];

  const playing = db
    .prepare(
      `SELECT campaigns.* FROM campaigns
       JOIN memberships ON memberships.campaign_id = campaigns.id
       WHERE memberships.user_id = ? AND memberships.status = 'approved'
       ORDER BY memberships.updated_at DESC, memberships.rowid DESC`
    )
    .all(userId) as Campaign[];

  return { dming, playing };
}
