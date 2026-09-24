import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCampaign, listCampaigns, type CampaignSort } from "@/lib/campaigns";
import { requireUser, errorResponse } from "@/lib/apiHelpers";
import {
  CAMPAIGN_SETTING_TAGS,
  CAMPAIGN_STRUCTURES,
  CAMPAIGN_TONE_TAGS,
  CONTENT_WARNING_TAGS,
  GAMEPLAY_PILLARS,
  SAFETY_TOOL_TAGS,
  SESSION_FORMATS,
  type SessionFormat,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function parseSessionFormat(value: string | null): SessionFormat | undefined {
  return value && (SESSION_FORMATS as readonly string[]).includes(value)
    ? (value as SessionFormat)
    : undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const system = searchParams.get("system") || undefined;
  const q = searchParams.get("q") || undefined;
  const location = searchParams.get("location") || undefined;
  const newPlayerFriendly = searchParams.get("newPlayerFriendly") === "true" || undefined;
  const sessionFormat = parseSessionFormat(searchParams.get("sessionFormat"));
  // Backlog #30: any-of tag filter, repeated query params (?toneTags=horror
  // &toneTags=comedic) -- listCampaigns itself silently drops anything not
  // in CAMPAIGN_TONE_TAGS, matching parseSessionFormat's "invalid filter
  // value doesn't 400 a GET" precedent above.
  const toneTags = searchParams.getAll("toneTags");
  const sort = (searchParams.get("sort") as CampaignSort) || undefined;
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("pageSize") || "10");
  const result = listCampaigns({
    system,
    q,
    location,
    newPlayerFriendly,
    sessionFormat,
    toneTags: toneTags.length > 0 ? toneTags : undefined,
    sort,
    page,
    pageSize,
  });
  return NextResponse.json(result);
}

const createSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  system: z.string().trim().min(1),
  capacity: z.number().int().min(1),
  location: z.string().trim().max(200).optional(),
  newPlayerFriendly: z.boolean().optional(),
  sessionFormat: z.enum(SESSION_FORMATS).optional(),
  startingLevel: z.string().trim().max(100).optional(),
  toneTags: z.array(z.enum(CAMPAIGN_TONE_TAGS)).max(5).optional(),
  settingTags: z.array(z.enum(CAMPAIGN_SETTING_TAGS)).max(3).optional(),
  gameplayFocus: z.array(z.enum(GAMEPLAY_PILLARS)).max(3).optional(),
  structure: z.enum(CAMPAIGN_STRUCTURES).optional(),
  contentWarningTags: z.array(z.enum(CONTENT_WARNING_TAGS)).max(CONTENT_WARNING_TAGS.length).optional(),
  safetyToolTags: z.array(z.enum(SAFETY_TOOL_TAGS)).max(SAFETY_TOOL_TAGS.length).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const campaign = createCampaign({ dmId: auth.user.id, ...parsed.data });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
