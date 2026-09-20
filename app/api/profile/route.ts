import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, upsertProfile, myCampaigns, ProfileError } from "@/lib/profiles";
import {
  getAvailabilitySlots,
  setAvailabilitySlots,
  AvailabilityError,
} from "@/lib/availability";
import { getUserStats } from "@/lib/stats";
import { getUnreadCampaignMessageCountsForUser } from "@/lib/campaignMessages";
import {
  CAMPAIGN_SETTING_TAGS,
  CAMPAIGN_STRUCTURES,
  CAMPAIGN_TONE_TAGS,
  DANGER_LEVELS,
  GAMEPLAY_PILLARS,
  SESSION_FORMAT_PREFERENCES,
} from "@/lib/types";
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
    // Backlog #45: per-campaign unread table-chat counts, keyed by
    // campaign id (only campaigns with unread > 0) -- feeds the small
    // badges next to each campaign in the "My campaigns" list below, and
    // doubles as the NavBar badge's 15s-polling fallback (it sums these
    // values the same way the Messages badge's fallback sums GET
    // /api/messages's per-conversation unreadCount).
    unreadCampaignChatCounts: getUnreadCampaignMessageCountsForUser(auth.user.id),
  });
}

const bodySchema = z.object({
  bio: z.string().max(2000).optional(),
  preferredSystems: z.string().max(300).optional(),
  availability: z.string().max(300).optional(),
  location: z.string().max(200).optional(),
  newToTabletop: z.boolean().optional(),
  // undefined = leave unchanged; null = clear; a recognized value = set it.
  sessionFormatPreference: z.enum(SESSION_FORMAT_PREFERENCES).nullable().optional(),
  // Backlog #64 (owner-requested, live session): the player-side "types
  // of games they enjoy most" fields, mirroring the campaign side's own
  // schema shapes one-for-one (see app/api/campaigns/route.ts's
  // createSchema/app/api/campaigns/[id]/route.ts's updateSchema).
  toneTags: z.array(z.enum(CAMPAIGN_TONE_TAGS)).max(5).optional(),
  settingTags: z.array(z.enum(CAMPAIGN_SETTING_TAGS)).max(3).optional(),
  gameplayFocusPreference: z.array(z.enum(GAMEPLAY_PILLARS)).max(3).optional(),
  structurePreference: z.enum(CAMPAIGN_STRUCTURES).nullable().optional(),
  dangerLevelPreference: z.enum(DANGER_LEVELS).nullable().optional(),
  // Full-replace list of weekly availability cells (backlog #27 phase 1;
  // hour granularity added by backlog #57). Omitted entirely leaves the
  // stored grid untouched; an empty array clears it, same partial-update
  // convention as the rest of this route. Max 168 = 7 days x 24 hours.
  availabilitySlots: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        hour: z.number().int().min(0).max(23),
      })
    )
    .max(168)
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
