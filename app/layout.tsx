import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import { getCurrentUser } from "@/lib/currentUser";
import { isSiteAdmin } from "@/lib/access";

export const metadata: Metadata = {
  title: "Session Zero",
  description: "Find a D&D group and track your campaign once you're in one.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  // Backlog #48: an "Admin" nav link, shown only to a signed-in site
  // admin -- see lib/access.ts's isSiteAdmin and app/admin/boards/page.tsx.
  const admin = user ? isSiteAdmin(user.id) : false;
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/* Backlog #49: the nav chrome has no business appearing on a
            printed character sheet (app/characters/[id]/page.tsx). */}
        <div className="print:hidden">
          <NavBar user={user ? { displayName: user.display_name, isAdmin: admin } : null} />
        </div>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:py-10 print:max-w-none print:p-0">
          {children}
        </main>
        <footer className="print:hidden border-t border-black/10 py-8 text-center text-sm text-black/50 dark:border-white/10 dark:text-white/50">
          Session Zero &middot; find your table, run your campaign.
        </footer>
      </body>
    </html>
  );
}
