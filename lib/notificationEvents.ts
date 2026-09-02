import { EventEmitter } from "node:events";

/**
 * In-process pub/sub used to push unread-count updates to open SSE
 * connections (see app/api/notifications/stream/route.ts) instead of making
 * every client poll on a timer.
 *
 * This is intentionally a single in-memory EventEmitter, not a
 * Redis/websocket-broker setup: the app runs `next start` as one Node
 * process (see the HTTP integration test's own server spawn), so every SSE
 * connection and every notify()/notifyMany() call live in that same
 * process. This won't fan out across multiple server instances/processes —
 * if the app is ever horizontally scaled, this module is the place to swap
 * in a shared broker (e.g. Redis pub/sub) without changing callers.
 */
const emitter = new EventEmitter();
// Every signed-in user's NavBar can open a stream; the default 10-listener
// cap would log spurious "MaxListenersExceededWarning"s well before that's
// actually a problem.
emitter.setMaxListeners(0);

function channel(userId: string): string {
  return `user:${userId}`;
}

export interface UnreadCountEvent {
  unreadCount: number;
}

/** Called by lib/notifications.ts whenever a user's unread count may have changed. */
export function publishUnreadCount(userId: string, unreadCount: number): void {
  emitter.emit(channel(userId), { unreadCount } satisfies UnreadCountEvent);
}

/** Subscribes to unread-count updates for one user. Returns an unsubscribe function. */
export function subscribeToUnreadCount(
  userId: string,
  listener: (event: UnreadCountEvent) => void
): () => void {
  const ch = channel(userId);
  emitter.on(ch, listener);
  return () => emitter.off(ch, listener);
}
