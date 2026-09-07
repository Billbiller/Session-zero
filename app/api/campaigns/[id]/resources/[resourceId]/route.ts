import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateCampaignResource, deleteCampaignResource } from "@/lib/campaignResources";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().max(1000).nullable().optional(),
});

// Metadata-only edit (name/description) -- see
// lib/campaignResources.ts's updateCampaignResource() doc comment for
// why re-uploading a different file isn't supported here. Restricted to
// the uploader or the campaign's DM (requireUploaderOrDm), a narrower
// boundary than upload access itself.
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; resourceId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { resourceId } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const resource = updateCampaignResource(resourceId, auth.user.id, parsed.data);
    return NextResponse.json({ resource });
  } catch (err) {
    return errorResponse(err, 403);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; resourceId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { resourceId } = await ctx.params;
  try {
    deleteCampaignResource(resourceId, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
