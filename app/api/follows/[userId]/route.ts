import { NextRequest, NextResponse } from "next/server";
import { follow, unfollow, FollowError } from "@/lib/follows";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = await ctx.params;
  try {
    const row = follow(auth.user.id, userId);
    return NextResponse.json({ follow: row }, { status: 201 });
  } catch (err) {
    if (err instanceof FollowError) return errorResponse(err, 400);
    return errorResponse(err, 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = await ctx.params;
  unfollow(auth.user.id, userId);
  return NextResponse.json({ ok: true });
}
