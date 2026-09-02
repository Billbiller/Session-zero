import { NextRequest, NextResponse } from "next/server";
import { markRead } from "@/lib/notifications";
import { requireUser } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  markRead(id, auth.user.id);
  return NextResponse.json({ ok: true });
}
