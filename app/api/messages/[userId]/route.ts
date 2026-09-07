import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getConversation, markConversationRead, sendMessage, MessageError } from "@/lib/messages";
import { getUserById } from "@/lib/auth";
import { requireUser, errorResponse } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

// The conversation thread with one other user, oldest first. Opening it
// also marks the other person's messages read (see
// lib/messages.ts's markConversationRead) -- the natural "you've seen
// this" moment for a chat thread, matching how opening a text-message
// app marks a thread read, rather than requiring a separate explicit
// "mark read" call the way the notifications inbox does.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = await ctx.params;
  const otherUser = getUserById(userId);
  if (!otherUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const messages = getConversation(auth.user.id, userId);
  markConversationRead(auth.user.id, userId);
  return NextResponse.json({
    messages,
    viewerId: auth.user.id,
    otherUser: { id: otherUser.id, displayName: otherUser.display_name },
  });
}

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { userId } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const message = sendMessage(auth.user.id, userId, parsed.data.body);
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    if (err instanceof MessageError) return errorResponse(err, 400);
    return errorResponse(err, 500);
  }
}
