import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateSchedule } from "@/lib/schedule";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ nextSessionAt: z.string().nullable() });

export async function PUT(
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
    const campaign = updateSchedule(id, auth.user.id, parsed.data.nextSessionAt);
    return NextResponse.json({ campaign });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
