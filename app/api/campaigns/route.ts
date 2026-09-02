import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCampaign, listCampaigns, type CampaignSort } from "@/lib/campaigns";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const system = searchParams.get("system") || undefined;
  const sort = (searchParams.get("sort") as CampaignSort) || undefined;
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("pageSize") || "10");
  const result = listCampaigns({ system, sort, page, pageSize });
  return NextResponse.json(result);
}

const createSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  system: z.string().trim().min(1),
  capacity: z.number().int().min(1),
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
