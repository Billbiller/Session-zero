import { notFound } from "next/navigation";
import { getCampaign, approvedHeadcount } from "@/lib/campaigns";
import { getCurrentUser } from "@/lib/currentUser";
import { getUserById } from "@/lib/auth";
import { hasPrivateAccess } from "@/lib/access";
import { listRequests } from "@/lib/memberships";
import { getNotes } from "@/lib/partyNotes";
import { listEntries } from "@/lib/sessionLog";
import { computeScheduleStatus } from "@/lib/schedule";
import db from "@/lib/db";
import type { Membership, User } from "@/lib/types";

import DmControls from "@/components/DmControls";
import JoinLeaveControls from "@/components/JoinLeaveControls";
import RequestsPanel from "@/components/RequestsPanel";
import RosterPanel from "@/components/RosterPanel";
import ScheduleForm from "@/components/ScheduleForm";
import PartyNotesPanel from "@/components/PartyNotesPanel";
import SessionLogPanel from "@/components/SessionLogPanel";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) notFound();

  const viewer = await getCurrentUser();
  const dm = getUserById(campaign.dm_id);
  const isDm = viewer?.id === campaign.dm_id;
  const access = hasPrivateAccess(viewer?.id ?? null, id);
  const headcount = approvedHeadcount(id);

  const membership = viewer
    ? ((db
        .prepare(
          `SELECT * FROM memberships WHERE campaign_id = ? AND user_id = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(id, viewer.id) as Membership | undefined) ?? null)
    : null;

  const approvedMembers = (
    db
      .prepare(
        `SELECT users.* FROM memberships
         JOIN users ON users.id = memberships.user_id
         WHERE memberships.campaign_id = ? AND memberships.status = 'approved'
         ORDER BY memberships.created_at ASC`
      )
      .all(id) as User[]
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {campaign.title}
          {campaign.cancelled && (
            <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-sm font-normal text-red-700 dark:bg-red-900 dark:text-red-200">
              Cancelled
            </span>
          )}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {campaign.system} &middot; DM: {dm?.display_name ?? "Unknown"} &middot; {headcount}/
          {campaign.capacity} players
        </p>
        {campaign.description && <p className="mt-2 text-sm">{campaign.description}</p>}
      </div>

      <JoinLeaveControls
        campaignId={id}
        signedIn={!!viewer}
        isDm={isDm}
        membershipStatus={membership?.status ?? null}
        acceptingRequests={!!campaign.accepting_requests}
        cancelled={!!campaign.cancelled}
      />

      {isDm && <DmControls campaign={campaign} />}

      {isDm && (
        <RequestsPanel
          campaignId={id}
          requests={
            listRequests(id, "pending").map((m) => ({
              ...m,
              user: getUserById(m.user_id),
            })) as (Membership & { user: { display_name: string } | null })[]
          }
        />
      )}

      <RosterPanel dm={dm} members={approvedMembers} />

      {access && (
        <>
          <ScheduleForm
            campaignId={id}
            isDm={isDm}
            nextSessionAt={campaign.next_session_at}
            status={computeScheduleStatus(campaign.next_session_at)}
          />
          <PartyNotesPanel campaignId={id} initialContent={getNotes(id).content} />
          <SessionLogPanel campaignId={id} isDm={isDm} entries={listEntries(id)} />
        </>
      )}
    </div>
  );
}
