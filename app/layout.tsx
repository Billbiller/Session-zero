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
        <NavBar user={user ? { displayName: user.display_name, isAdmin: admin } : null} />
        <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
