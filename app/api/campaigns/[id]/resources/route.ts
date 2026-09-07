import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listCampaignResources, addCampaignResource } from "@/lib/campaignResources";
import { hasPrivateAccess } from "@/lib/access";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// The campaign's resource vault (maps, handouts, homebrew notes), oldest
// first -- see lib/campaignResources.ts for the full design. Access-
// checked the same way as GET /api/campaigns/[id]/notes and .../chat --
// hasPrivateAccess pre-checked here since listCampaignResources() itself
// does no auth.
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
  return NextResponse.json({ resources: listCampaignResources(id) });
}

// Upper bound here is a small buffer over lib/campaignResources.ts's own
// MAX_RESOURCE_DATA_URL_LENGTH (5,600,000), mirroring how
// app/api/characters/route.ts's zod schema (300,000) leaves a buffer
// over lib/characters.ts's actual cap (280,000) -- the route's schema
// only needs to reject wildly-oversized bodies early; the lib's own
// check is the real, precisely-justified limit.
const addSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().max(1000).nullable().optional(),
  dataUrl: z.string().min(1).max(6_000_000),
});

// Uploading relies on addCampaignResource()'s own hasPrivateAccess check
// (same convention as POST /api/campaigns/[id]/chat relying on
// sendCampaignMessage()'s internal check) -- zod handles body-shape
// validation (400) here, the lib error catch handles access/not-found/
// file-validation errors (403).
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = addSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const resource = addCampaignResource(id, auth.user.id, parsed.data);
    return NextResponse.json({ resource }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
