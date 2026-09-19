import { NextRequest, NextResponse } from "next/server";
import {
  sendFriendRequest,
  acceptFriendRequest,
  cancelOrRemoveFriendship,
  FriendError,
} from "@/lib/friends";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

/** Send a friend request to :userId. */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = await ctx.params;
  try {
    const row = sendFriendRequest(auth.user.id, userId);
    return NextResponse.json({ friendship: row }, { status: 201 });
  } catch (err) {
    if (err instanceof FriendError) return errorResponse(err, 400);
    return errorResponse(err, 500);
  }
}

/** Accept a pending friend request *from* :userId (the signed-in user
 * must be the addressee -- see lib/friends.ts's acceptFriendRequest). */
export async function PATCH(
  _request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = await ctx.params;
  try {
    const row = acceptFriendRequest(auth.user.id, userId);
    return NextResponse.json({ friendship: row });
  } catch (err) {
    if (err instanceof FriendError) return errorResponse(err, 400);
    return errorResponse(err, 500);
  }
}

/** Remove whatever relationship exists with :userId -- cancels a sent
 * request, declines a received one, or unfriends, depending on current
 * state. Idempotent, same convention as DELETE /api/follows/[userId]. */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = await ctx.params;
  cancelOrRemoveFriendship(auth.user.id, userId);
  return NextResponse.json({ ok: true });
}
