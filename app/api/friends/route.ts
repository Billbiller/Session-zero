import { NextResponse } from "next/server";
import { listFriends, listPendingReceived, listPendingSent } from "@/lib/friends";
import { requireUser } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

/** Everything the /friends page needs in one call: the signed-in user's
 * friends list, incoming requests awaiting their response, and outgoing
 * requests awaiting someone else's. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const friends = listFriends(auth.user.id);
  const pendingReceived = listPendingReceived(auth.user.id);
  const pendingSent = listPendingSent(auth.user.id);
  return NextResponse.json({ friends, pendingReceived, pendingSent });
}
