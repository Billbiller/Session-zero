import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, upsertProfile, myCampaigns, ProfileError } from "@/lib/profiles";
import {
  getAvailabilitySlots,
  setAvailabilitySlots,
  AvailabilityError,
} from "@/lib/availability";
import { getUserStats } from "@/lib/stats";
import { AVAILABILITY_BLOCKS } from "@/lib/types";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { dming, playing } = myCampaigns(auth.user.id);
  return NextResponse.json({
    profile: getProfile(auth.user.id),
    availabilitySlots: getAvailabilitySlots(auth.user.id),
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
  newToTabletop: z.boolean().optional(),
  // Full-replace list of weekly availability cells (backlog #27 phase 1).
  // Omitted entirely leaves the stored grid untouched; an empty array
  // clears it, same partial-update convention as the rest of this route.
  availabilitySlots: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        block: z.enum(AVAILABILITY_BLOCKS),
      })
    )
    .max(28)
    .optional(),
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
    const { availabilitySlots, ...profileInput } = parsed.data;
    const profile = upsertProfile(auth.user.id, profileInput);
    if (availabilitySlots !== undefined) {
      setAvailabilitySlots(auth.user.id, availabilitySlots);
    }
    return NextResponse.json({
      profile,
      availabilitySlots: getAvailabilitySlots(auth.user.id),
    });
  } catch (err) {
    if (err instanceof ProfileError || err instanceof AvailabilityError) {
      return errorResponse(err);
    }
    return errorResponse(err, 500);
  }
}
