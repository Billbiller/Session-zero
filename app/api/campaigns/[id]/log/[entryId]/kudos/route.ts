import { NextRequest, NextResponse } from "next/server";
import { toggleKudos } from "@/lib/sessionLog";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; entryId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { entryId } = await ctx.params;
  try {
    const result = toggleKudos(entryId, auth.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, 403);
  }
}
