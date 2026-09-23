import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setCampaignSpotlight } from "@/lib/campaigns";
import { isSiteAdmin } from "@/lib/access";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ spotlighted: z.boolean() });

// Backlog #68: site-admin-only toggle for featuring a campaign in the home
// page's Spotlight section -- see lib/campaigns.ts's setCampaignSpotlight.
// A non-admin gets a 403 here before the body is even parsed; the lib
// function re-checks isSiteAdmin itself, so the rule holds for any other
// caller too.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (!isSiteAdmin(auth.user.id)) {
    return NextResponse.json(
      { error: "Only a site admin can spotlight campaigns." },
      { status: 403 }
    );
  }
  const { id } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const campaign = setCampaignSpotlight(id, auth.user.id, parsed.data.spotlighted);
    return NextResponse.json({ campaign });
  } catch (err) {
    return errorResponse(err);
  }
}
