import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setCancelled } from "@/lib/campaigns";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ cancelled: z.boolean() });

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const json = await request.json().catch(() => ({ cancelled: true }));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const campaign = setCancelled(id, auth.user.id, parsed.data.cancelled);
    return NextResponse.json({ campaign });
  } catch (err) {
    return errorResponse(err);
  }
}
