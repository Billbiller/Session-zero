import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEntry, listEntriesWithKudos } from "@/lib/sessionLog";
import { attendanceCandidates, setEntryAttendance } from "@/lib/attendance";
import { hasPrivateAccess } from "@/lib/access";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!hasPrivateAccess(auth.user.id, id)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  return NextResponse.json({ entries: listEntriesWithKudos(id, auth.user.id) });
}

// Backlog #39: attendance is optional and submitted alongside the entry
// itself in the same request -- "when the DM posts a session log entry,
// they mark which of the currently-active party actually showed up."
// Validated against the campaign's current attendance candidates (see
// lib/attendance.ts's attendanceCandidates()) BEFORE createEntry() runs,
// so a bad userId 400s cleanly rather than leaving a content-only entry
// behind after a partial failure -- once validated, setEntryAttendance()
// is guaranteed to succeed against the same candidate set.
const bodySchema = z.object({
  content: z.string().trim().min(1),
  attendance: z
    .array(z.object({ userId: z.string().min(1), attended: z.boolean() }))
    .optional(),
});

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
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  if (parsed.data.attendance && parsed.data.attendance.length > 0) {
    const candidates = new Set(attendanceCandidates(id));
    for (const record of parsed.data.attendance) {
      if (!candidates.has(record.userId)) {
        return NextResponse.json(
          { error: "Can only record attendance for a current active party member." },
          { status: 400 }
        );
      }
    }
  }

  try {
    const entry = createEntry(id, auth.user.id, parsed.data.content);
    if (parsed.data.attendance && parsed.data.attendance.length > 0) {
      setEntryAttendance(entry.id, auth.user.id, parsed.data.attendance);
    }
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 403);
  }
}
