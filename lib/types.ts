export interface User {
  id: string;
  display_name: string;
  email: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  dm_id: string;
  title: string;
  description: string;
  system: string;
  capacity: number;
  accepting_requests: number; // 0 | 1
  cancelled: number; // 0 | 1
  next_session_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MembershipStatus = "pending" | "approved" | "declined" | "left";

export interface Membership {
  id: string;
  campaign_id: string;
  user_id: string;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
}

export const NOTIFICATION_TYPES = [
  "join_requested",
  "join_approved",
  "join_declined",
  "member_left_dm",
  "member_left_party",
  "party_notes_updated",
  "session_log_posted",
  "schedule_updated",
  "campaign_cancelled",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  join_requested: "Someone requests to join your campaign",
  join_approved: "Your join request is approved",
  join_declined: "Your join request is declined",
  member_left_dm: "A player leaves your campaign",
  member_left_party: "A fellow party member leaves",
  party_notes_updated: "Shared party notes are updated",
  session_log_posted: "A new session log entry is posted",
  schedule_updated: "The next session date changes",
  campaign_cancelled: "A campaign you're in is cancelled",
};

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  campaign_id: string | null;
  message: string;
  read: number; // 0 | 1
  created_at: string;
}

export interface SessionLogEntry {
  id: string;
  campaign_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface PartyNotes {
  campaign_id: string;
  content: string;
  updated_by: string | null;
  updated_at: string | null;
}

export type ScheduleStatus = "unscheduled" | "upcoming" | "past-due";
