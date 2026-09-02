import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPreferences, setPreference } from "@/lib/notificationPreferences";
import { NOTIFICATION_TYPES, NOTIFICATION_LABELS } from "@/lib/types";
import { requireUser } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const preferences = getPreferences(auth.user.id);
  const types = NOTIFICATION_TYPES.map((type) => ({
    type,
    label: NOTIFICATION_LABELS[type],
    enabled: preferences[type],
  }));
  return NextResponse.json({ types });
}

const bodySchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  enabled: z.boolean(),
});

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  setPreference(auth.user.id, parsed.data.type, parsed.data.enabled);
  return NextResponse.json({ ok: true });
}
