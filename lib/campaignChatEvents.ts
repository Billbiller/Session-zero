import { EventEmitter } from "node:events";

/**
 * In-process pub/sub used to push a user's total-unread-table-chat-count
 * updates to open SSE connections (see
 * app/api/campaigns/chat/stream/route.ts), mirroring
 * lib/messageEvents.ts/lib/notificationEvents.ts one-for-one -- see those
 * modules' own doc comments for why this is a single in-memory
 * EventEmitter (fine for this app's single-process `next start`
 * deployment) rather than a shared broker.
 *
 * This is a third small parallel module rather than folding into either
 * existing one, for the same reason messageEvents.ts stayed separate from
 * notificationEvents.ts: a user's total unread *table-chat* count (backed
 * by campaign_messages/campaign_message_reads, summed across every
 * campaign via getTotalUnreadCampaignMessageCountForUser) is a third,
 * independently-drifting counter -- distinct from the general unread
 * *notification* count (notifications.read, which a campaign_chat_message
 * notification also bumps separately) and from the unread *direct*
 * *message* count (messages.read). Opening a campaign's chat panel
 * (markCampaignChatRead) clears this counter for that campaign without
 * touching the other two tables at all.
 */
const emitter = new EventEmitter();
// Every signed-in user's NavBar can open a stream; the default 10-listener
// cap would log spurious "MaxListenersExceededWarning"s well before that's
// actually a problem.
emitter.setMaxListeners(0);

function channel(userId: string): string {
  return `user:${userId}`;
}

export interface UnreadCampaignChatCountEvent {
  unreadCount: number;
}

/** Called by lib/campaignMessages.ts whenever a user's total unread table-chat count (across every campaign) may have changed. */
export function publishUnreadCampaignChatCount(userId: string, unreadCount: number): void {
  emitter.emit(channel(userId), { unreadCount } satisfies UnreadCampaignChatCountEvent);
}

/** Subscribes to unread-table-chat-count updates for one user. Returns an unsubscribe function. */
export function subscribeToUnreadCampaignChatCount(
  userId: string,
  listener: (event: UnreadCampaignChatCountEvent) => void
): () => void {
  const ch = channel(userId);
  emitter.on(ch, listener);
  return () => emitter.off(ch, listener);
}
