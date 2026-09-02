import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { isEnabled } from "./notificationPreferences";
import { publishUnreadCount } from "./notificationEvents";
import type { Notification, NotificationType } from "./types";

export {
  NOTIFICATION_TYPES,
  NOTIFICATION_LABELS,
} from "./types";

/**
 * Single choke point for creating a notification. A muted type is checked
 * before any row is written, so a muted user gets nothing inserted at all
 * (not written-then-filtered). Returns the created notification, or null if
 * the type is muted for this user.
 */
export function notify(
  userId: string,
  type: NotificationType,
  campaignId: string | null,
  message: string
): Notification | null {
  if (!isEnabled(userId, type)) return null;
  const notification: Notification = {
    id: uuidv4(),
    user_id: userId,
    type,
    campaign_id: campaignId,
    message,
    read: 0,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO notifications (id, user_id, type, campaign_id, message, read, created_at)
     VALUES (@id, @user_id, @type, @campaign_id, @message, @read, @created_at)`
  ).run(notification);
  // Push the fresh unread count to any open SSE stream for this user (see
  // notificationEvents.ts + app/api/notifications/stream/route.ts) so the
  // NavBar badge updates live instead of waiting on its polling fallback.
  publishUnreadCount(userId, getUnreadCount(userId));
  return notification;
}

export function notifyMany(
  userIds: string[],
  type: NotificationType,
  campaignId: string | null,
  message: string
): void {
  for (const userId of userIds) {
    notify(userId, type, campaignId, message);
  }
}

export function getUnreadCount(userId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0"
    )
    .get(userId) as { count: number };
  return row.count;
}

export function listNotifications(
  userId: string,
  opts: { page?: number; pageSize?: number } = {}
): { items: Notification[]; total: number } {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const total = (
    db
      .prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ?")
      .get(userId) as { count: number }
  ).count;
  const items = db
    .prepare(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?"
    )
    .all(userId, pageSize, (page - 1) * pageSize) as Notification[];
  return { items, total };
}

export function markRead(notificationId: string, userId: string): void {
  db.prepare(
    "UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?"
  ).run(notificationId, userId);
  publishUnreadCount(userId, getUnreadCount(userId));
}

export function markAllRead(userId: string): void {
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(
    userId
  );
  publishUnreadCount(userId, getUnreadCount(userId));
}
