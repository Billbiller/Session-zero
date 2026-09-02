import { NextRequest, NextResponse } from "next/server";
import { requestJoin } from "@/lib/memberships";
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
    const membership = requestJoin(id, auth.user.id);
    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
