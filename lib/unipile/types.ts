// =============================================================================
// Unipile API Types — Complete type definitions for all endpoints
// Docs: https://developer.unipile.com/reference
// =============================================================================

// -----------------------------------------------------------------------------
// Common / Pagination
// -----------------------------------------------------------------------------

export interface UnipilePaginatedResponse<T> {
  object: string;
  items: T[];
  cursor?: string;
  has_more: boolean;
}

export interface UnipilePaginationParams {
  limit?: number; // 1-250
  cursor?: string;
}

// -----------------------------------------------------------------------------
// Accounts
// -----------------------------------------------------------------------------

export type UnipileAccountStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "ERROR"
  | "CREDENTIALS_REQUIRED"
  | "RECONNECTING";

export interface UnipileAccountSource {
  type: string;
  status: string;
}

export interface UnipileAccount {
  id: string;
  object: string;
  name: string;
  type: string;
  status: UnipileAccountStatus;
  created_at: string;
  sources: UnipileAccountSource[];
}

export type UnipileHostedAuthInput =
  | {
      type: "create";
      provider: "LINKEDIN";
      success_redirect_url: string;
      failure_redirect_url: string;
      notify_url?: string;
      name?: string;
      expiresOn?: string;
    }
  | {
      type: "reconnect";
      account_id: string;
      success_redirect_url: string;
      failure_redirect_url: string;
      notify_url?: string;
      expiresOn?: string;
    };

export interface UnipileHostedAuthResponse {
  object: string;
  url: string;
}

export interface UnipileReconnectInput {
  // Provider-specific reconnect fields if needed
  [key: string]: unknown;
}

export interface UnipileCookieAuthInput {
  provider: "LINKEDIN";
  access_token: string; // valeur du cookie li_at
  user_agent: string;
}

export interface UnipileAccountCreatedResponse {
  object: "AccountCreated";
  account_id: string;
}

// -----------------------------------------------------------------------------
// Chats / Messages
// -----------------------------------------------------------------------------

export interface UnipileChat {
  id: string;
  chat_id?: string;
  message_id?: string;
  object: string;
  account_id: string;
  provider: string;
  type: string;
  name?: string;
  unread_count: number;
  last_message_at?: string;
  timestamp?: string;
  attendees: UnipileAttendee[];
}

export interface UnipileAttachment {
  id: string;
  name?: string;
  mime_type?: string;
  size?: number;
}

export interface UnipileMessage {
  id: string;
  object: string;
  account_id: string;
  chat_id: string;
  provider: string;
  sender_id?: string;
  text: string;
  timestamp: string;
  is_sender: boolean;
  attachments?: UnipileAttachment[];
}

export interface UnipileSendMessageInput {
  text: string;
}

export interface UnipileNewChatInput {
  account_id: string;
  attendees_ids: string[];
  text: string;
}

export interface UnipileChatUpdateInput {
  action:
    | "archive"
    | "unarchive"
    | "mute"
    | "unmute"
    | "mark_as_read"
    | "mark_as_unread";
}

export interface UnipileMessageReactionInput {
  reaction_type: string;
  account_id: string;
}

export interface UnipileForwardMessageInput {
  chat_id: string;
  account_id: string;
}

// -----------------------------------------------------------------------------
// Attendees
// -----------------------------------------------------------------------------

export interface UnipileAttendee {
  id: string;
  object: string;
  provider: string;
  name?: string;
  profile_url?: string;
  is_self: boolean;
}

// -----------------------------------------------------------------------------
// Users / Profiles
// -----------------------------------------------------------------------------

export interface UnipileExperience {
  title?: string;
  position?: string;
  company?: string;
  company_id?: string;
  company_name?: string;
  company_picture_url?: string;
  start?: string;
  end?: string | null;
  start_date?: string;
  end_date?: string;
  description?: string;
  location?: string;
  status?: string;
  skills?: string[];
}

export interface UnipileEducation {
  school_name: string;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
}

export interface UnipileSkill {
  name: string;
  endorsement_count?: number;
}

export interface UnipileLanguage {
  name: string;
  proficiency?: string;
}

export interface UnipileCertification {
  name: string;
  authority?: string;
  start_date?: string;
  end_date?: string;
}

export interface UnipileUserProfile {
  id: string;
  object: string;
  provider: string;
  provider_id?: string;
  member_urn?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  public_identifier?: string;
  profile_url?: string;
  profile_picture_url?: string;
  profile_picture_url_large?: string;
  background_picture_url?: string;
  location?: string;
  about?: string;
  summary?: string; // linkedin_sections=* returns summary instead of about
  company?: string;
  connections_count?: number;
  follower_count?: number;
  followers_count?: number;
  shared_connections_count?: number;
  network_distance?: string;
  is_open_profile?: boolean;
  is_premium?: boolean;
  is_influencer?: boolean;
  is_creator?: boolean;
  is_relationship?: boolean;
  is_self?: boolean;
  primary_locale?: string | { country?: string; language?: string };
  websites?: string[];
  contact_info?: { emails?: string[]; phones?: string[] };
  creator_website?: { url?: string; description?: string };
  experience?: UnipileExperience[];
  work_experience?: UnipileExperience[]; // linkedin_sections=* returns work_experience
  education?: UnipileEducation[];
  skills?: UnipileSkill[];
  languages?: UnipileLanguage[];
  certifications?: UnipileCertification[];
  volunteering_experience?: unknown[];
  projects?: unknown[];
  hashtags?: string[];
  recommendations?: { given_total_count?: number; given?: unknown[] };
}

export interface UnipileProfileUpdateInput {
  first_name?: string;
  last_name?: string;
  headline?: string;
  about?: string;
}

// -----------------------------------------------------------------------------
// Invitations
// -----------------------------------------------------------------------------

export interface UnipileInvitee {
  id: string;
  name?: string;
  profile_url?: string;
}

export interface UnipileInvitation {
  id: string;
  object: string;
  provider: string;
  status: string;
  message?: string;
  created_at: string;
  invitee?: UnipileInvitee;
}

export interface UnipileSendInvitationInput {
  account_id: string;
  provider_id: string;
  message?: string; // Max 300 chars for LinkedIn
}

export interface UnipileHandleInvitationInput {
  action: "accept" | "reject";
}

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------

export interface UnipileRelation {
  id: string;
  object: string;
  provider: string;
  name?: string;
  profile_url?: string;
  connected_at?: string;
}

// -----------------------------------------------------------------------------
// Posts & Engagement
// -----------------------------------------------------------------------------

export interface UnipilePost {
  id: string;
  object: string;
  provider: string;
  text?: string;
  author_id?: string;
  timestamp?: string;
  reactions_count?: number;
  comments_count?: number;
}

export interface UnipileComment {
  id: string;
  text: string;
  author_id?: string;
  timestamp?: string;
}

export interface UnipileReaction {
  id: string;
  type: string;
  author_id?: string;
}

export interface UnipileCreatePostInput {
  account_id: string;
  text: string;
  provider: "LINKEDIN";
}

export interface UnipileCreateCommentInput {
  account_id: string;
  text: string;
}

export interface UnipileCreateReactionInput {
  account_id: string;
  reaction_type: string;
}

// -----------------------------------------------------------------------------
// LinkedIn Specific
// -----------------------------------------------------------------------------

export interface UnipileLinkedInSearchInput {
  account_id: string;
  query?: string;
  keywords?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  location?: string;
  limit?: number;
}

export interface UnipileLinkedInSearchResult {
  id: string;
  name?: string;
  headline?: string;
  profile_url?: string;
  location?: string;
  profile_picture_url?: string;
}

export interface UnipileLinkedInCompany {
  object?: "CompanyProfile";
  id: string;
  entity_urn?: string;
  public_identifier?: string;
  name?: string;
  description?: string;
  tagline?: string;
  profile_url?: string;
  website?: string;
  phone?: string;
  industry?: string[];
  employee_count?: number;
  employee_count_range?: { from: number; to: number };
  followers_count?: number;
  organization_type?: string;
  foundation_date?: { year?: number; month?: number; day?: number };
  locations?: Array<Record<string, unknown>>;
  hashtags?: string[];
  logo?: string;
  logo_large?: string;
}

export interface UnipileInMailBalance {
  balance: number;
  account_id: string;
}

export interface UnipileLinkedInRawInput {
  account_id: string;
  /** Full LinkedIn URL to fetch (e.g. https://www.linkedin.com/voyager/api/...) */
  request_url: string;
}

export interface UnipileLinkedInHiringProject {
  id: string;
  object: string;
  name?: string;
  status?: string;
}

export interface UnipileLinkedInEndorsementInput {
  account_id: string;
  skill_name: string;
}

export interface UnipileLinkedInMemberActionInput {
  account_id: string;
  action_type: string;
  [key: string]: unknown;
}

export interface UnipileLinkedInJob {
  id: string;
  object: string;
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  status?: string;
  created_at?: string;
}

export interface UnipileLinkedInCreateJobInput {
  account_id: string;
  title: string;
  company_id: string;
  description: string;
  location?: string;
  [key: string]: unknown;
}

export interface UnipileLinkedInJobUpdateInput {
  title?: string;
  description?: string;
  location?: string;
  [key: string]: unknown;
}

export interface UnipileLinkedInApplicant {
  id: string;
  name?: string;
  profile_url?: string;
  applied_at?: string;
}

// -----------------------------------------------------------------------------
// Webhooks
// -----------------------------------------------------------------------------

export interface UnipileWebhook {
  id: string;
  object: string;
  url: string;
  events: string[];
  status: string;
  created_at: string;
}

export interface UnipileWebhookInput {
  url: string;
  events: string[];
}

export type UnipileWebhookEventType =
  | "message.received"
  | "relation.created"
  | "account.status_changed";

export interface UnipileWebhookEvent {
  event: UnipileWebhookEventType | string;
  data: {
    account_id: string;
    chat_id?: string;
    message_id?: string;
    message?: UnipileMessage;
    relation?: UnipileRelation;
    account?: { id: string; status: UnipileAccountStatus };
    [key: string]: unknown;
  };
  timestamp: string;
}

// -----------------------------------------------------------------------------
// Email (future use)
// -----------------------------------------------------------------------------

export interface UnipileMail {
  id: string;
  object: string;
  account_id: string;
  provider: string;
  subject?: string;
  from?: string;
  to?: string[];
  text?: string;
  html?: string;
  timestamp?: string;
  attachments?: UnipileAttachment[];
}

export interface UnipileSendMailInput {
  account_id: string;
  to: string[];
  subject: string;
  body: string;
  provider: string;
}

export interface UnipileMailUpdateInput {
  flags?: string[];
  labels?: string[];
}

export interface UnipileDraftInput {
  account_id: string;
  to: string[];
  subject: string;
  body: string;
}

export interface UnipileFolder {
  id: string;
  object: string;
  name: string;
  type?: string;
}
