import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import { getCurrentUser } from "@/lib/currentUser";

export const metadata: Metadata = {
  title: "Session Zero",
  description: "Find a D&D group and track your campaign once you're in one.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <NavBar user={user ? { displayName: user.display_name } : null} />
        <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
