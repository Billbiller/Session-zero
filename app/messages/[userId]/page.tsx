import ConversationView from "@/components/ConversationView";

// Thin server wrapper, same pattern as the campaign detail page: await
// the dynamic route param server-side and hand a plain string prop down
// to the client component that does the actual self-fetching (auth check
// via a 401 redirect, message list, composer). Kept as a client component
// below rather than doing the sign-in/not-found checks server-side, since
// every other auth-gated page in this app (ProfilePage, NotificationsPage)
// already follows that same fetch-on-mount-and-redirect convention.
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <ConversationView otherUserId={userId} />;
}
