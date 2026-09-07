import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listRsvps, getViewerRsvp, setRsvp } from "@/lib/sessionRsvps";
import { hasPrivateAccess } from "@/lib/access";
import { requireUser, errorResponse } from "@/lib/apiHelpers";
import { RSVP_RESPONSES } from "@/lib/types";

export const dynamic = "force-dynamic";

// Every active party member's RSVP status for the campaign's current
// next_session_at, plus the viewer's own response by itself for
// convenience. Access-checked the same way as GET /api/campaigns/[id]/
// chat -- hasPrivateAccess pre-checked here since listRsvps() itself
// does no auth (it's a read helper, matching lib/campaignMessages.ts's
// listCampaignMessages() convention).
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
  return NextResponse.json({
    rsvps: listRsvps(id),
    viewerResponse: getViewerRsvp(id, auth.user.id),
  });
}

const bodySchema = z.object({
  response: z.enum(RSVP_RESPONSES).nullable(),
});

// Sets/changes/clears (response: null) the signed-in viewer's own RSVP.
// Relies on setRsvp()'s own hasPrivateAccess + "must be scheduled"
// checks (same convention as PUT /api/campaigns/[id]/schedule relying
// on updateSchedule()'s internal DM check) -- zod handles body-shape
// validation (400) here, the lib error catch handles access/state
// errors (403).
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const response = setRsvp(id, auth.user.id, parsed.data.response);
    return NextResponse.json({ response });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
