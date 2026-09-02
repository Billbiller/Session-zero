import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { approveRequest, declineRequest } from "@/lib/memberships";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ action: z.enum(["approve", "decline"]) });

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; membershipId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { membershipId } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const membership =
      parsed.data.action === "approve"
        ? approveRequest(membershipId, auth.user.id)
        : declineRequest(membershipId, auth.user.id);
    return NextResponse.json({ membership });
  } catch (err) {
    return errorResponse(err);
  }
}
