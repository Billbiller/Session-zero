import { NextRequest, NextResponse } from "next/server";
import { listVolunteers, SubRequestError } from "@/lib/subRequests";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ volunteers: listVolunteers(id, auth.user.id) });
  } catch (err) {
    if (err instanceof SubRequestError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}
