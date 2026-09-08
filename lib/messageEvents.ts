import { EventEmitter } from "node:events";

/**
 * In-process pub/sub used to push unread-direct-message-count updates to
 * open SSE connections (see app/api/messages/stream/route.ts), mirroring
 * lib/notificationEvents.ts's own pub/sub for the general notifications
 * unread badge -- see that module's doc comment for why this is a single
 * in-memory EventEmitter rather than a shared broker, and why that's fine
 * for this app's single-process `next start` deployment.
 *
 * This is deliberately a separate module/channel from notificationEvents.ts
 * rather than folding into it: an unread *message* count (backed by
 * messages.read) and the general unread *notification* count (backed by
 * notifications.read) are two different counters over two different
 * tables today -- a new message both bumps this counter AND fires a
 * message_received notification that bumps the other one, but they can
 * drift independently (e.g. reading a conversation via
 * markConversationRead() clears this counter without touching the
 * notifications table at all). Keeping them as two small parallel modules
 * (rather than one generic "counts" pub/sub with a type tag) matches this
 * app's existing preference for a dedicated module per concern over a
 * shared polymorphic one -- the same reasoning backlog #28's session log
 * entry used for campaign_ratings vs. the existing ratings table.
 */
const emitter = new EventEmitter();
// Every signed-in user's NavBar can open a stream; the default 10-listener
// cap would log spurious "MaxListenersExceededWarning"s well before that's
// actually a problem.
emitter.setMaxListeners(0);

function channel(userId: string): string {
  return `user:${userId}`;
}

export interface UnreadMessageCountEvent {
  unreadCount: number;
}

/** Called by lib/messages.ts whenever a user's total unread direct-message count may have changed. */
export function publishUnreadMessageCount(userId: string, unreadCount: number): void {
  emitter.emit(channel(userId), { unreadCount } satisfies UnreadMessageCountEvent);
}

/** Subscribes to unread-direct-message-count updates for one user. Returns an unsubscribe function. */
export function subscribeToUnreadMessageCount(
  userId: string,
  listener: (event: UnreadMessageCountEvent) => void
): () => void {
  const ch = channel(userId);
  emitter.on(ch, listener);
  return () => emitter.off(ch, listener);
}
