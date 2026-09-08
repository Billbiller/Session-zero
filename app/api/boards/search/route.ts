import { NextRequest, NextResponse } from "next/server";
import { searchBoards } from "@/lib/boards";

export const dynamic = "force-dynamic";

// Backlog #52: cross-board search. Public -- no requireUser here, matching
// this app's existing convention that browsing/searching (campaigns, the
// sub pool, system hubs, and board browsing itself) is ungated while only
// posting requires sign-in. An empty ?q= isn't a 400 -- it just returns no
// results (see lib/boards.ts's searchBoards() doc comment), the same
// "invalid/absent filter value degrades gracefully" shape GET /api/subs's
// ?sort= already established rather than erroring.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const boardSlug = searchParams.get("boardSlug") ?? undefined;
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("pageSize") || "20");
  const result = searchBoards(q, { boardSlug, page, pageSize });
  return NextResponse.json(result);
}
