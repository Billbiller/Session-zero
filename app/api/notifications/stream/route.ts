import { NextRequest } from "next/server";
import { requireUser } from "@/lib/apiHelpers";
import { getUnreadCount } from "@/lib/notifications";
import { subscribeToUnreadCount } from "@/lib/notificationEvents";

// This route touches cookies (auth) and better-sqlite3 (a native module),
// both of which need the Node runtime, and must never be cached.
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
      // connection opens, rather than waiting for the next notify() call.
      send("unread", { unreadCount: getUnreadCount(userId) });

      const unsubscribe = subscribeToUnreadCount(userId, (evt) => {
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
