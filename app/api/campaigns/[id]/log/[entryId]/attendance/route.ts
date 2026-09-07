import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listEntryAttendance, setEntryAttendance } from "@/lib/attendance";
import { isDm } from "@/lib/access";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// DM-only, both read and write -- see lib/attendance.ts's own doc
// comment for why per-entry attendance stays narrower than the rest of
// the private side (session log/party notes/chat are all DM + approved
// active members): "who missed this specific session" is more pointed
// than this app wants to surface to the whole table, so only the DM who
// attests it can see the per-entry detail. Only the aggregate rate
// (lib/attendance.ts's getAttendanceStats) is ever shown publicly, on
// /players/[id].
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; entryId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id, entryId } = await ctx.params;
  if (!isDm(auth.user.id, id)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  try {
    return NextResponse.json({ attendance: listEntryAttendance(entryId) });
  } catch (err) {
    return errorResponse(err, 404);
  }
}

const bodySchema = z.object({
  attendance: z.array(
    z.object({
      userId: z.string().min(1),
      attended: z.boolean(),
    })
  ),
});

// Full-replace (mirrors PUT /api/profile/availability) -- relies on
// setEntryAttendance()'s own DM + current-active-party-candidate checks
// (same convention as PUT /api/campaigns/[id]/rsvp relying on setRsvp()),
// so a non-DM or an unknown/inactive userId comes back as a 403 from the
// lib error, not a route-level pre-check.
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; entryId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { entryId } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  try {
    const attendance = setEntryAttendance(entryId, auth.user.id, parsed.data.attendance);
    return NextResponse.json({ attendance });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
