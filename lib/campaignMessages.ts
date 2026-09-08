import { v4 as uuidv4 } from "uuid";
import db from "./db";
import { getCampaign } from "./campaigns";
import { getUserById } from "./auth";
import { hasPrivateAccess, activePartyUserIds } from "./access";
import { notify } from "./notifications";
import { myCampaigns } from "./profiles";
import { publishUnreadCampaignChatCount } from "./campaignChatEvents";
import type { CampaignMessage, CampaignMessageWithSender } from "./types";

export class CampaignMessageError extends Error {}

const MAX_BODY = 4000;

/** Every message in a campaign's group chat, oldest first (chat-reading
 * order), enriched with each sender's display name. Callers must check
 * hasPrivateAccess themselves before calling this -- same convention as
 * lib/partyNotes.ts's getNotes()/lib/sessionLog.ts's listEntries(),
 * where the access check lives at the call site (the API route) rather
 * than being duplicated inside every read helper. */
export function listCampaignMessages(campaignId: string): CampaignMessageWithSender[] {
  const rows = db
    .prepare(
      "SELECT * FROM campaign_messages WHERE campaign_id = ? ORDER BY created_at ASC, rowid ASC"
    )
    .all(campaignId) as CampaignMessage[];
  return rows.map((row) => ({
    ...row,
    senderName: getUserById(row.sender_id)?.display_name ?? "Unknown",
  }));
}

function getLastReadAt(campaignId: string, userId: string): string {
  const row = db
    .prepare(
      "SELECT last_read_at FROM campaign_message_reads WHERE campaign_id = ? AND user_id = ?"
    )
    .get(campaignId, userId) as { last_read_at: string } | undefined;
  // Epoch fallback for a user who has never opened this campaign's chat --
  // every existing message counts as unread for them.
  return row?.last_read_at ?? new Date(0).toISOString();
}

/** How many of *other* people's messages a user hasn't read yet in this
 * campaign's chat. A user's own messages never count as unread for
 * themselves -- sending also marks you caught-up as of that moment (see
 * markCampaignChatRead's call inside sendCampaignMessage below), so this
 * excludes self-authored rows on top of that for good measure. */
export function getUnreadCampaignMessageCount(campaignId: string, userId: string): number {
  const lastReadAt = getLastReadAt(campaignId, userId);
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM campaign_messages
       WHERE campaign_id = ? AND sender_id != ? AND created_at > ?`
    )
    .get(campaignId, userId, lastReadAt) as { count: number };
  return row.count;
}

/** Marks a user caught-up on a campaign's chat as of right now. Called
 * when they open the chat panel (mirrors lib/messages.ts's
 * markConversationRead-on-open convention for 1:1 threads) and
 * internally whenever they send a message, so posting doesn't leave
 * your own message showing as unread to yourself. */
export function markCampaignChatRead(campaignId: string, userId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO campaign_message_reads (campaign_id, user_id, last_read_at)
     VALUES (@campaign_id, @user_id, @last_read_at)
     ON CONFLICT (campaign_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`
  ).run({ campaign_id: campaignId, user_id: userId, last_read_at: now });
  // Push this user's fresh total-unread-table-chat count (across every
  // campaign, not just this one) to any open SSE stream for them -- see
  // campaignChatEvents.ts + app/api/campaigns/chat/stream/route.ts.
  // Mirrors lib/messages.ts's markConversationRead() publishing its own
  // fresh total on read (backlog #45, one level down from #44).
  publishUnreadCampaignChatCount(userId, getTotalUnreadCampaignMessageCountForUser(userId));
}

/** Posts a message to a campaign's group chat. Restricted to the same
 * hasPrivateAccess boundary already gating party notes/session log (DM
 * + approved active members) -- explicitly the boundary backlog #32's
 * own text named.
 *
 * Notification judgment call (backlog #32's own text flagged this as an
 * open question): notifying every other party member on *every* chat
 * message would be far noisier than this app's other fan-out
 * notifications -- party_notes_updated fires on an edit that happens
 * rarely, but an active table chat could see many messages in a row in
 * quick succession. Instead, a party member is notified only when this
 * message is the first *unread* one for them since they last opened the
 * chat -- i.e. their own unread count (see getUnreadCampaignMessageCount)
 * was already 0 right before this send. Once notified, further messages
 * before they check back don't re-notify them (they already have a
 * pending signal -- the notification plus the thread's own unread
 * count); opening the chat resets their count via markCampaignChatRead,
 * so the next new message after that notifies them again. This is the
 * "lighter-touch" option the backlog text floated, chosen over both "no
 * notification type at all" (chat is otherwise easy to miss, unlike
 * party notes/session log which show their own inline update markers)
 * and "notify on every message" (the naive, noisy default). */
export function sendCampaignMessage(
  campaignId: string,
  senderId: string,
  body: string
): CampaignMessage {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new CampaignMessageError("Campaign not found.");
  if (!hasPrivateAccess(senderId, campaignId)) {
    throw new CampaignMessageError(
      "Only the DM or an active member of this campaign can post here."
    );
  }
  const trimmed = body.trim();
  if (!trimmed) {
    throw new CampaignMessageError("Message can't be empty.");
  }
  if (trimmed.length > MAX_BODY) {
    throw new CampaignMessageError(`Message can't be longer than ${MAX_BODY} characters.`);
  }

  // Snapshot who's already got unread messages *before* this one lands,
  // so the notification rule above only fires for someone who was
  // caught-up a moment ago.
  const others = activePartyUserIds(campaignId).filter((id) => id !== senderId);
  const recipientsToNotify = others.filter(
    (id) => getUnreadCampaignMessageCount(campaignId, id) === 0
  );

  const message: CampaignMessage = {
    id: uuidv4(),
    campaign_id: campaignId,
    sender_id: senderId,
    body: trimmed,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO campaign_messages (id, campaign_id, sender_id, body, created_at)
     VALUES (@id, @campaign_id, @sender_id, @body, @created_at)`
  ).run(message);

  markCampaignChatRead(campaignId, senderId);

  const sender = getUserById(senderId);
  for (const recipientId of recipientsToNotify) {
    notify(
      recipientId,
      "campaign_chat_message",
      campaignId,
      `${sender?.display_name ?? "Someone"} posted in "${campaign.title}"'s group chat.`
    );
  }

  // Every other active party member's total-unread-table-chat count just
  // went up by one for this campaign (this message is newer than their
  // last-read timestamp, whatever it was) -- push each of their fresh
  // totals live, separately from the campaign_chat_message notification
  // fan-out above (recipientsToNotify), which only covers who gets
  // *notified* under the first-unread-since-visit rule. The badge should
  // reflect every new message, not just the first one since a visit.
  for (const otherId of others) {
    publishUnreadCampaignChatCount(otherId, getTotalUnreadCampaignMessageCountForUser(otherId));
  }

  return message;
}

/** The signed-in user's total unread table-chat count, summed across
 * every campaign they DM or actively play in -- the number behind the
 * NavBar badge (backlog #45), distinct from any single campaign's own
 * getUnreadCampaignMessageCount() above. Reuses lib/profiles.ts's
 * myCampaigns() for the "campaigns I have private access to" set, the
 * same reuse lib/sessionReminders.ts's checkAndFireSessionRemindersForUser
 * already established -- rather than re-deriving that set from scratch
 * here. */
export function getTotalUnreadCampaignMessageCountForUser(userId: string): number {
  const { dming, playing } = myCampaigns(userId);
  const seen = new Set<string>();
  let total = 0;
  for (const campaign of [...dming, ...playing]) {
    if (seen.has(campaign.id)) continue;
    seen.add(campaign.id);
    total += getUnreadCampaignMessageCount(campaign.id, userId);
  }
  return total;
}

/** Per-campaign unread table-chat counts across every campaign a user has
 * private access to, keyed by campaign id and omitting any campaign with
 * zero unread -- the data behind the small per-campaign badges on
 * /profile's "My campaigns" list (backlog #45), so a user can see *which*
 * table has new chat activity without opening each one. A badge inside
 * the campaign detail page itself can't stay accurate the same way (see
 * markCampaignChatRead -- opening a campaign's own chat panel immediately
 * marks it read), so this list-level view is the one place a per-campaign
 * count can actually sit still to be read. */
export function getUnreadCampaignMessageCountsForUser(userId: string): Record<string, number> {
  const { dming, playing } = myCampaigns(userId);
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const campaign of [...dming, ...playing]) {
    if (seen.has(campaign.id)) continue;
    seen.add(campaign.id);
    const count = getUnreadCampaignMessageCount(campaign.id, userId);
    if (count > 0) counts[campaign.id] = count;
  }
  return counts;
}
