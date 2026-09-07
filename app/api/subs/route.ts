import { NextResponse } from "next/server";
import { listOpenSubRequests } from "@/lib/subRequests";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// The app-wide browsable volunteer pool -- public, same reasoning as the
// campaigns browse endpoint (GET /api/campaigns): finding a match is the
// point, so no sign-in is required just to look.
export async function GET() {
  const viewer = await getCurrentUser();
  return NextResponse.json({ requests: listOpenSubRequests(viewer?.id ?? null) });
}
