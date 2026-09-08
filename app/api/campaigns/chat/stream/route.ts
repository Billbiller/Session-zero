import { NextRequest } from "next/server";
import { requireUser } from "@/lib/apiHelpers";
import { getTotalUnreadCampaignMessageCountForUser } from "@/lib/campaignMessages";
import { subscribeToUnreadCampaignChatCount } from "@/lib/campaignChatEvents";

// This route touches cookies (auth) and better-sqlite3 (a native module),
// both of which need the Node runtime, and must never be cached. Mirrors
// app/api/messages/stream/route.ts and app/api/notifications/stream/route.ts
// exactly, one more level down (table chat instead of direct messages) --
// see lib/campaignChatEvents.ts's doc comment for why this stays a third
// separate stream/counter rather than folding into either existing one.
//
// Lives under app/api/campaigns/chat/ rather than app/api/campaigns/[id]/ --
// this is an aggregate across every campaign the signed-in user has access
// to, not scoped to one campaign id, so it sits as a sibling of the
// dynamic [id] segment rather than inside it. Next.js resolves the
// literal "chat" segment ahead of the [id] dynamic one, so this doesn't
// collide with any real campaign whose id happened to be "chat".
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Keeps the connection alive through proxies/load balancers that time out
// idle connections; also lets the client detect a silently-dropped connection.
const HEARTBEAT_MS = 20000;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const userId = auth.user.id;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller already closed out from under us (client disconnected
          // between the abort listener firing and this call) — ignore.
        }
      }

      // Send an immediate snapshot so the badge is correct the instant the
      // connection opens, rather than waiting for the next message.
      send("unread", { unreadCount: getTotalUnreadCampaignMessageCountForUser(userId) });

      const unsubscribe = subscribeToUnreadCampaignChatCount(userId, (evt) => {
        send("unread", evt);
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // ignore — cleanup happens via the abort listener
        }
      }, HEARTBEAT_MS);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable response buffering on nginx-style proxies so events aren't
      // held back until the buffer fills.
      "X-Accel-Buffering": "no",
    },
  });
}
