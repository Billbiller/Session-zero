import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

/** Backlog #50: a self-service "download my data" page -- a signed-in
 * user's complete, honest accounting of what this app stores about them
 * (see AccountExportData's doc comment in lib/types.ts for the full
 * scope), one GET click away as a real JSON file download. Gated inline
 * with rendered content rather than a redirect, matching
 * app/admin/boards/page.tsx's own convention for a settings-style page
 * that needs sign-in.
 *
 * Deliberately does NOT offer account deletion here, even though the
 * page title might suggest it should: this app has no safe way to
 * delete an account today that doesn't leave a real product decision
 * unmade -- a campaign this user DMs has its own active party depending
 * on it (cancel it? transfer it? orphan it?), which is exactly the kind
 * of unattended judgment call this task's own instructions say not to
 * make silently. See claude/progress.md's dated session log entry for
 * the full reasoning; a "contact the owner" note stands in for a real
 * self-service deletion flow until that design work happens. */
export default async function AccountSettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex max-w-lg flex-col gap-4">
        <h1 className="text-2xl font-semibold">Your data</h1>
        <p className="text-sm text-black/60 dark:text-white/60">Sign in required.</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Your data</h1>
        <nav className="mt-1 flex gap-3 text-sm underline">
          <Link href="/settings/notifications">Notifications</Link>
          <Link href="/settings/account" className="font-medium no-underline">
            Your data
          </Link>
        </nav>
      </div>

      <div className="flex flex-col gap-2 rounded border border-black/10 p-4 text-sm dark:border-white/10">
        <p className="font-medium">Download everything this app has on you</p>
        <p className="text-black/60 dark:text-white/60">
          Your account, profile, characters, campaigns, messages, ratings, notifications, and
          everything else tied to your account ({user.email}), as one JSON file.
        </p>
        <a
          href="/api/account/export"
          className="mt-1 inline-block w-fit rounded border border-black/20 px-3 py-1.5 underline dark:border-white/20"
        >
          Download my data (.json)
        </a>
      </div>

      <div className="flex flex-col gap-2 rounded border border-black/10 p-4 text-sm dark:border-white/10">
        <p className="font-medium">Delete your account</p>
        <p className="text-black/60 dark:text-white/60">
          Account deletion isn&apos;t available in the app yet. Some of your data (like campaigns
          you&apos;re running for an active party) affects other people, and safely removing an
          account needs more design work than a single pass can do responsibly. If you&apos;d
          like your account removed, contact the site owner directly.
        </p>
      </div>
    </div>
  );
}
