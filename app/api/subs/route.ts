import { NextRequest, NextResponse } from "next/server";
import { listOpenSubRequests, type SubRequestSort } from "@/lib/subRequests";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// The app-wide browsable volunteer pool -- public, same reasoning as the
// campaigns browse endpoint (GET /api/campaigns): finding a match is the
// point, so no sign-in is required just to look.
//
// Backlog #51: optional ?sort=soonest|newest and ?includePastDue=true,
// mirroring GET /api/campaigns's plain-parse-with-fallback convention
// (an unrecognized sort value is silently ignored, not a 400 -- ordering
// is a display nicety, not something worth failing a request over).
export async function GET(request: NextRequest) {
  const viewer = await getCurrentUser();
  const { searchParams } = new URL(request.url);
  const sortParam = searchParams.get("sort");
  const sort: SubRequestSort | undefined =
    sortParam === "soonest" || sortParam === "newest" ? sortParam : undefined;
  const includePastDue = searchParams.get("includePastDue") === "true" || undefined;
  return NextResponse.json({
    requests: listOpenSubRequests(viewer?.id ?? null, { sort, includePastDue }),
  });
}
