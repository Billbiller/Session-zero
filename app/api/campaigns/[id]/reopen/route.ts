import { NextRequest, NextResponse } from "next/server";
import { manualReopen } from "@/lib/campaigns";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  try {
    const campaign = manualReopen(id, auth.user.id);
    return NextResponse.json({ campaign });
  } catch (err) {
    return errorResponse(err);
  }
}
