import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiHelpers";
import { getAccountExport } from "@/lib/accountExport";

export const dynamic = "force-dynamic";

// Downloads the signed-in user's own complete data export as a JSON file
// -- see AccountExportData's doc comment in lib/types.ts for the full
// scope. No id param and no access check beyond requireUser(): this
// route only ever exports the caller's own data (auth.user.id), never
// anyone else's, so there's nothing else to authorize. Served as a real
// file download, matching the non-JSON-API-response precedent set by
// GET /api/campaigns/[id]/calendar and GET /api/characters/[id]/export
// -- unlike those two, the content itself *is* JSON, but it's still
// meant to be saved as a file rather than consumed by this app's own
// client code, hence Content-Disposition: attachment.
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const data = getAccountExport(auth.user.id);
  const body = JSON.stringify(data, null, 2);
  const dateStamp = data.exportedAt.slice(0, 10);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="session-zero-data-export-${dateStamp}.json"`,
    },
  });
}
