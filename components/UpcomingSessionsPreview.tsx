import { projectUpcomingSessions } from "@/lib/upcomingSessions";
import { RECURRENCE_LABELS, type Recurrence } from "@/lib/types";
import Section from "@/components/Section";

/**
 * Backlog #70 (competitive research vs. StartPlaying.games): a public
 * preview of a campaign's upcoming session dates, shown to every viewer
 * -- including a prospective, not-yet-approved one -- so they can judge
 * whether the cadence fits their calendar before requesting to join.
 * Deliberately rendered outside the hasPrivateAccess gate on the
 * campaign detail page (unlike ScheduleForm, which also lets the DM edit
 * these two fields together further down that same page); this
 * component is read-only. Renders nothing when the campaign is
 * unscheduled, matching this app's established "don't show a feature
 * with nothing to show" convention (e.g. the tone/content-warning tag
 * lines on the same page).
 */
export default function UpcomingSessionsPreview({
  nextSessionAt,
  recurrence,
}: {
  nextSessionAt: string | null;
  recurrence: Recurrence | null;
}) {
  const dates = projectUpcomingSessions(nextSessionAt, recurrence);
  if (dates.length === 0) return null;

  return (
    <Section>
      <h2 className="mb-2 font-medium">
        {recurrence ? "Upcoming sessions" : "Next session"}
        {recurrence && (
          <span className="ml-1 text-xs font-normal text-black/60 dark:text-white/60">
            ({RECURRENCE_LABELS[recurrence]})
          </span>
        )}
      </h2>
      <ul className="list-inside list-disc text-sm">
        {dates.map((iso) => (
          <li key={iso}>{new Date(iso).toLocaleString()}</li>
        ))}
      </ul>
    </Section>
  );
}
