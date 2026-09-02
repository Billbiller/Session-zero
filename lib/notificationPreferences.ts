import db from "./db";
import { NOTIFICATION_TYPES, type NotificationType } from "./types";

export interface PreferenceMap {
  [type: string]: boolean;
}

/** Every notification type defaults to enabled until a row says otherwise. */
export function getPreferences(userId: string): PreferenceMap {
  const rows = db
    .prepare(
      "SELECT type, enabled FROM notification_preferences WHERE user_id = ?"
    )
    .all(userId) as { type: string; enabled: number }[];
  const overrides = new Map(rows.map((r) => [r.type, r.enabled === 1]));
  const map: PreferenceMap = {};
  for (const type of NOTIFICATION_TYPES) {
    map[type] = overrides.has(type) ? (overrides.get(type) as boolean) : true;
  }
  return map;
}

export function isEnabled(userId: string, type: NotificationType): boolean {
  const row = db
    .prepare(
      "SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = ?"
    )
    .get(userId, type) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true;
}

export function setPreference(
  userId: string,
  type: NotificationType,
  enabled: boolean
): void {
  db.prepare(
    `INSERT INTO notification_preferences (user_id, type, enabled)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id, type) DO UPDATE SET enabled = excluded.enabled`
  ).run(userId, type, enabled ? 1 : 0);
}
