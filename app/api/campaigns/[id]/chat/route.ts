import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listCampaignMessages,
  sendCampaignMessage,
  markCampaignChatRead,
} from "@/lib/campaignMessages";
import { hasPrivateAccess } from "@/lib/access";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// The campaign's group chat thread, oldest first (chat-reading order).
// Opening it also marks the viewer caught-up on this campaign's chat
// (see lib/campaignMessages.ts's markCampaignChatRead) -- the same
// mark-read-on-open convention as the 1:1 conversation route
// (app/api/messages/[userId]/route.ts). Access-checked the same way as
// GET /api/campaigns/[id]/notes -- hasPrivateAccess pre-checked here
// since listCampaignMessages() itself does no auth.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!hasPrivateAccess(auth.user.id, id)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const messages = listCampaignMessages(id);
  markCampaignChatRead(id, auth.user.id);
  return NextResponse.json({ messages, viewerId: auth.user.id });
}

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

// Posting relies on sendCampaignMessage()'s own hasPrivateAccess check
// (same convention as PUT /api/campaigns/[id]/notes relying on
// updateNotes()'s internal check) -- zod handles body-shape validation
// (400) here, the lib error catch handles access/not-found (403).
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const message = sendCampaignMessage(id, auth.user.id, parsed.data.body);
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
