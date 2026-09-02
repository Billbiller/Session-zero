import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEntry, listEntries } from "@/lib/sessionLog";
import { hasPrivateAccess } from "@/lib/access";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!hasPrivateAccess(auth.user.id, id)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  return NextResponse.json({ entries: listEntries(id) });
}

const bodySchema = z.object({ content: z.string().trim().min(1) });

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const entry = createEntry(id, auth.user.id, parsed.data.content);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
