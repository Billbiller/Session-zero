import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCampaign, updateCampaign, approvedHeadcount } from "@/lib/campaigns";
import { hasPrivateAccess } from "@/lib/access";
import { getCurrentUser } from "@/lib/currentUser";
import { getUserById } from "@/lib/auth";
import { requireUser, errorResponse } from "@/lib/apiHelpers";
import db from "@/lib/db";
import type { Membership } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const campaign = getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const viewer = await getCurrentUser();
  const dm = getUserById(campaign.dm_id);
  const isDm = viewer?.id === campaign.dm_id;
  const membership = viewer
    ? (db
        .prepare(
          `SELECT * FROM memberships WHERE campaign_id = ? AND user_id = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(id, viewer.id) as Membership | undefined) ?? null
    : null;
  const access = hasPrivateAccess(viewer?.id ?? null, id);

  return NextResponse.json({
    campaign,
    dm: dm ? { id: dm.id, display_name: dm.display_name } : null,
    isDm,
    viewerMembershipStatus: membership?.status ?? null,
    hasPrivateAccess: access,
    approvedHeadcount: approvedHeadcount(id),
  });
}

const updateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  system: z.string().trim().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
});

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const campaign = updateCampaign(id, auth.user.id, parsed.data);
    return NextResponse.json({ campaign });
  } catch (err) {
    return errorResponse(err);
  }
}
