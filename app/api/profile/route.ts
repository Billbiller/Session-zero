import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, upsertProfile, myCampaigns, ProfileError } from "@/lib/profiles";
import { getUserStats } from "@/lib/stats";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { dming, playing } = myCampaigns(auth.user.id);
  return NextResponse.json({
    profile: getProfile(auth.user.id),
    dming,
    playing,
    stats: getUserStats(auth.user.id),
  });
}

const bodySchema = z.object({
  bio: z.string().max(2000).optional(),
  preferredSystems: z.string().max(300).optional(),
  availability: z.string().max(300).optional(),
  location: z.string().max(200).optional(),
});

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const profile = upsertProfile(auth.user.id, parsed.data);
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof ProfileError) return errorResponse(err);
    return errorResponse(err, 500);
  }
}
