import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isBoardSlug, listThreads, createThread } from "@/lib/boards";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// Browsing threads is public -- no requireUser here, matching this app's
// existing convention that browsing (campaigns, the sub pool, system
// hubs) is ungated while posting requires sign-in -- see lib/boards.ts's
// doc comment for the full reasoning.
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  if (!isBoardSlug(slug)) {
    return NextResponse.json({ error: "Unknown board." }, { status: 404 });
  }
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("pageSize") || "20");
  const result = listThreads(slug, { page, pageSize });
  return NextResponse.json(result);
}

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { slug } = await ctx.params;
  if (!isBoardSlug(slug)) {
    return NextResponse.json({ error: "Unknown board." }, { status: 404 });
  }
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const thread = createThread(slug, auth.user.id, parsed.data);
    return NextResponse.json({ thread }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
