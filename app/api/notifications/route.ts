import { NextRequest, NextResponse } from "next/server";
import { listNotifications, getUnreadCount, markAllRead } from "@/lib/notifications";
import { requireUser } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
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
