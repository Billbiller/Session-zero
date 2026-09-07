import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaign, approvedHeadcount } from "@/lib/campaigns";
import { getCurrentUser } from "@/lib/currentUser";
import { getUserById } from "@/lib/auth";
import { hasPrivateAccess } from "@/lib/access";
import { listRequests } from "@/lib/memberships";
import { getNotes } from "@/lib/partyNotes";
import { listEntriesWithKudos } from "@/lib/sessionLog";
import { computeScheduleStatus } from "@/lib/schedule";
import { listCharactersForCampaign, getCampaignChronicle } from "@/lib/characters";
import db from "@/lib/db";
import { DANGER_LEVEL_LABELS, type Membership, type User } from "@/lib/types";

import DmControls from "@/components/DmControls";
import JoinLeaveControls from "@/components/JoinLeaveControls";
import RequestsPanel from "@/components/RequestsPanel";
import RosterPanel from "@/components/RosterPanel";
import ScheduleForm from "@/components/ScheduleForm";
import PartyNotesPanel from "@/components/PartyNotesPanel";
import SessionLogPanel from "@/components/SessionLogPanel";
import CharacterSummary from "@/components/CharacterSummary";
import RatingsPanel from "@/components/RatingsPanel";
import SubRequestPanel from "@/components/SubRequestPanel";

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
  const campaignCharacters = listCharactersForCampaign(id);
  const chronicle = getCampaignChronicle(id);

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
          {campaign.system} &middot; DM:{" "}
          {dm ? (
            <Link href={`/players/${dm.id}`} className="underline">
              {dm.display_name}
            </Link>
          ) : (
            "Unknown"
          )}{" "}
          &middot; {headcount}/{campaign.capacity} players
          {campaign.location && <> &middot; {campaign.location}</>}
          {campaign.danger_level && (
            <>
              {" "}
              &middot;{" "}
              <span
                className="rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20"
                title="A heads-up from the DM, not a scoreboard."
              >
                {DANGER_LEVEL_LABELS[campaign.danger_level]}
              </span>
            </>
          )}
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

      <div className="rounded border border-black/10 p-4 dark:border-white/10">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Characters at this table</h2>
          {access && (
            <Link href="/profile" className="text-sm underline">
              Manage your characters
            </Link>
          )}
        </div>
        {chronicle.total > 0 && (
          <p className="mb-2 text-xs text-black/60 dark:text-white/60">
            Chronicle: {chronicle.total} character{chronicle.total === 1 ? "" : "s"} passed through
            {chronicle.active > 0 && ` · ${chronicle.active} still adventuring`}
            {chronicle.retired > 0 && ` · ${chronicle.retired} retired`}
            {chronicle.fallen > 0 && ` · ${chronicle.fallen} fallen`}
          </p>
        )}
        <ul className="flex flex-col gap-3 text-sm">
          {campaignCharacters.map((c) => (
            <li key={c.id} className="border-t border-black/10 pt-3 first:border-t-0 first:pt-0 dark:border-white/10">
              <CharacterSummary character={c} />
            </li>
          ))}
          {campaignCharacters.length === 0 && (
            <li className="text-black/60 dark:text-white/60">
              No characters linked to this campaign yet.
            </li>
          )}
        </ul>
      </div>

      <RatingsPanel campaignId={id} signedIn={!!viewer} />

      <SubRequestPanel
        campaignId={id}
        viewerId={viewer?.id ?? null}
        isDm={isDm}
        canPost={access}
      />

      {access && (
        <>
          <ScheduleForm
            campaignId={id}
            isDm={isDm}
            nextSessionAt={campaign.next_session_at}
            status={computeScheduleStatus(campaign.next_session_at)}
          />
          <PartyNotesPanel campaignId={id} initialContent={getNotes(id).content} />
          <SessionLogPanel
            campaignId={id}
            isDm={isDm}
            entries={listEntriesWithKudos(id, viewer?.id ?? null)}
            viewerId={viewer?.id ?? null}
          />
        </>
      )}
    </div>
  );
}
