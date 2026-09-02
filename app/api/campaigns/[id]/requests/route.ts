import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaigns";
import { listRequests } from "@/lib/memberships";
import { requireUser } from "@/lib/apiHelpers";
import { getUserById } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const campaign = getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.dm_id !== auth.user.id) {
    return NextResponse.json({ error: "Only the DM can view requests." }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as
    | "pending"
    | "approved"
    | "declined"
    | "left"
    | null;
  const requests = listRequests(id, status ?? undefined).map((m) => ({
    ...m,
    user: getUserById(m.user_id),
  }));
  return NextResponse.json({ requests });
}
