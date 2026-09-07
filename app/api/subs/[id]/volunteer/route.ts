import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { volunteerForSubRequest, withdrawVolunteer, SubRequestError } from "@/lib/subRequests";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ message: z.string().trim().max(500).default("") });

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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const volunteer = volunteerForSubRequest(id, auth.user.id, parsed.data.message);
    return NextResponse.json({ volunteer });
  } catch (err) {
    if (err instanceof SubRequestError) return errorResponse(err, 403);
    return errorResponse(err, 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  withdrawVolunteer(id, auth.user.id);
  return NextResponse.json({ ok: true });
}
