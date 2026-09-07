/** Shared outer-card styling for the campaign detail page's feature
 * panels (DmControls, RequestsPanel, RosterPanel, ScheduleForm,
 * PartyNotesPanel, SessionLogPanel, RatingsPanel, SubRequestPanel, and
 * the characters block on the page itself) -- backlog #9 flagged this
 * page's growing list of components as "worth revisiting for further
 * splitting/a shared layout primitive before more is added to it," and
 * by the time this was picked up a ninth panel had already landed.
 *
 * This deliberately wraps ONLY the repeated outer card styling
 * (`rounded border ... p-4 ...`, previously duplicated verbatim across
 * every one of those files) and nothing about each panel's own header
 * markup, which varies enough -- some have an inline action link next to
 * the heading, some don't -- that forcing a single header API would
 * either lose functionality or need its own escape hatches for no real
 * benefit. A pure style extraction, not a new layout behavior: every
 * panel renders identically to before, just without the repeated
 * className string. */
export default function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded border border-black/10 p-4 dark:border-white/10 ${className}`.trim()}>
      {children}
    </div>
  );
}
