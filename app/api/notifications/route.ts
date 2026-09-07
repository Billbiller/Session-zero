import { NextRequest, NextResponse } from "next/server";
import { listNotifications, getUnreadCount, markAllRead } from "@/lib/notifications";
import { checkAndFireSessionRemindersForUser } from "@/lib/sessionReminders";
import { requireUser } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  // Backlog #35: this app has no background worker to watch the clock,
  // so a session_reminder notification is fired lazily, piggybacked on
  // real user activity -- this endpoint is hit both by NavBar's 15s
  // polling fallback and by the /notifications page itself, so it's a
  // reliable, frequently-hit trigger point across *every* campaign the
  // signed-in user has private access to (not just whichever campaign
  // page they happen to be looking at -- see checkAndFireSessionReminder's
  // own doc comment for the full known-limitation writeup).
  checkAndFireSessionRemindersForUser(auth.user.id);
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("pageSize") || "20");
  const { items, total } = listNotifications(auth.user.id, { page, pageSize });
  const unreadCount = getUnreadCount(auth.user.id);
  return NextResponse.json({ items, total, unreadCount });
}

export async function POST(request: NextRequest) {
  // Body: { action: "markAllRead" }
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const json = await request.json().catch(() => null);
  if (json?.action === "markAllRead") {
    markAllRead(auth.user.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
