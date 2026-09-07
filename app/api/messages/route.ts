import { NextResponse } from "next/server";
import { listConversations } from "@/lib/messages";
import { requireUser } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// The inbox: every conversation the signed-in user is part of, most
// recently active first. Sending is done per-conversation-partner, at
// POST /api/messages/[userId], not here.
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ conversations: listConversations(auth.user.id) });
}
