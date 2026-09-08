import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaigns";
import { getViewerRsvp } from "@/lib/sessionRsvps";
import { hasPrivateAccess } from "@/lib/access";
import { requireUser } from "@/lib/apiHelpers";
import { buildSessionIcs } from "@/lib/calendarExport";

export const dynamic = "force-dynamic";

// Downloads a .ics file for a campaign's currently scheduled next
// session. Gated on hasPrivateAccess (DM + approved active members) --
// next_session_at is part of this app's private-side trio (session log,
// party notes, schedule), the same boundary GET /api/campaigns/[id]/rsvp
// already checks, even though GET /api/campaigns/[id] itself leaks the
// raw next_session_at field to any caller (see that route's own
// comment) -- this route follows the *intended* boundary, not the leaky
// one. A 404 (not a 403) when nothing is scheduled: there's simply
// nothing to export, which is a different case from "not authorized."
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
  const campaign = getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (!campaign.next_session_at) {
    return NextResponse.json({ error: "No upcoming session is scheduled." }, { status: 404 });
  }

  const ics = buildSessionIcs({
    campaignId: campaign.id,
    title: campaign.title,
    system: campaign.system,
    location: campaign.location,
    sessionFormat: campaign.session_format,
    nextSessionAt: campaign.next_session_at,
    viewerRsvp: getViewerRsvp(id, auth.user.id),
  });

  const safeName = campaign.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const filename = `${safeName || "session"}.ics`;

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
