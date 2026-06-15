// =============================================================================
// Unipile API Client — Full HTTP client for all Unipile endpoints
// Docs: https://developer.unipile.com/reference
// Auth: X-API-KEY header with UNIPILE_API_KEY env var (shared)
// =============================================================================

import type {
  UnipileAccount,
  UnipileAttendee,
  UnipileChat,
  UnipileChatUpdateInput,
  UnipileComment,
  UnipileCreateCommentInput,
  UnipileCreatePostInput,
  UnipileCreateReactionInput,
  UnipileDraftInput,
  UnipileFolder,
  UnipileForwardMessageInput,
  UnipileHandleInvitationInput,
  UnipileHostedAuthInput,
  UnipileHostedAuthResponse,
  UnipileInMailBalance,
  UnipileInvitation,
  UnipileLinkedInApplicant,
  UnipileLinkedInCompany,
  UnipileLinkedInCreateJobInput,
  UnipileLinkedInEndorsementInput,
  UnipileLinkedInHiringProject,
  UnipileLinkedInJob,
  UnipileLinkedInJobUpdateInput,
  UnipileLinkedInMemberActionInput,
  UnipileLinkedInRawInput,
  UnipileLinkedInSearchInput,
  UnipileLinkedInSearchResult,
  UnipileMail,
  UnipileMailUpdateInput,
  UnipileMessage,
  UnipileMessageReactionInput,
  UnipileNewChatInput,
  UnipilePaginatedResponse,
  UnipilePaginationParams,
  UnipilePost,
  UnipileProfileUpdateInput,
  UnipileReaction,
  UnipileRelation,
  UnipileSendInvitationInput,
  UnipileSendMailInput,
  UnipileSendMessageInput,
  UnipileUserProfile,
  UnipileWebhook,
  UnipileWebhookInput,
  UnipileCookieAuthInput,
  UnipileAccountCreatedResponse,
} from "./types";

const UNIPILE_BASE_URL = `https://${process.env.UNIPILE_DSN || "api1.unipile.com:13111"}/api/v1`;

// -----------------------------------------------------------------------------
// Custom Error
// -----------------------------------------------------------------------------

export class UnipileApiError extends Error {
  status: number;
  detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = "UnipileApiError";
    this.status = status;
    this.detail = detail;
  }
}

// -----------------------------------------------------------------------------
// Client Class
// -----------------------------------------------------------------------------

class UnipileClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // ---------------------------------------------------------------------------
  // Private request helper
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(`${UNIPILE_BASE_URL}${path}`);

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      "X-API-KEY": this.apiKey,
      Accept: "application/json",
    };

    if (body && method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    // Erreurs définitives : ne jamais retenter
    const NON_RETRYABLE_STATUSES = [400, 401, 403, 404, 409, 422, 429];
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body && method !== "GET" ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        // Some endpoints return 204 No Content
        if (response.status === 204) return undefined as T;
        return response.json() as Promise<T>;
      }

      let errorMessage = `Unipile API error: ${response.status}`;
      let errorDetail: string | undefined;
      try {
        const errorBody = await response.json();
        errorMessage = errorBody.title || errorBody.message || errorMessage;
        errorDetail = errorBody.detail || errorBody.error;
      } catch {
        // JSON parse failed, use default message
      }

      // Erreurs définitives ou rate-limit : remonter immédiatement (géré upstream)
      if (NON_RETRYABLE_STATUSES.includes(response.status)) {
        throw new UnipileApiError(response.status, errorMessage, errorDetail);
      }

      // Erreurs 5xx transitoires : backoff exponentiel + jitter avant retry
      if (attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(
          `[Unipile] ${response.status} on ${method} ${path} — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(backoffMs)}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw new UnipileApiError(response.status, errorMessage, errorDetail);
    }

    throw new UnipileApiError(500, "Max retries exceeded");
  }

  private async requestBlob(
    method: string,
    path: string
  ): Promise<Blob> {
    const url = `${UNIPILE_BASE_URL}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        "X-API-KEY": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new UnipileApiError(
        response.status,
        `Unipile API error: ${response.status}`
      );
    }

    return response.blob();
  }

  // ===========================================================================
  // ACCOUNTS
  // ===========================================================================

  async listAccounts(
    params?: UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileAccount>> {
    return this.request("GET", "/accounts", undefined, {
      limit: params?.limit,
      cursor: params?.cursor,
    });
  }

  async getAccount(id: string): Promise<UnipileAccount> {
    return this.request("GET", `/accounts/${id}`);
  }

  async createHostedAuthLink(
    input: UnipileHostedAuthInput
  ): Promise<UnipileHostedAuthResponse> {
    return this.request("POST", "/hosted/accounts/link-token", input);
  }

  async connectWithCookies(
    input: UnipileCookieAuthInput
  ): Promise<UnipileAccountCreatedResponse> {
    return this.request("POST", "/accounts", input);
  }

  async deleteAccount(id: string): Promise<void> {
    return this.request("DELETE", `/accounts/${id}`);
  }

  async reconnectAccount(id: string): Promise<UnipileAccount> {
    return this.request("POST", `/accounts/${id}/reconnect`);
  }

  async resyncAccount(id: string): Promise<void> {
    return this.request("GET", `/accounts/${id}/resync`);
  }

  // ===========================================================================
  // CHATS
  // ===========================================================================

  async listChats(
    params?: UnipilePaginationParams & { account_id?: string }
  ): Promise<UnipilePaginatedResponse<UnipileChat>> {
    return this.request("GET", "/chats", undefined, {
      limit: params?.limit,
      cursor: params?.cursor,
      account_id: params?.account_id,
    });
  }

  async getChat(chatId: string): Promise<UnipileChat> {
    return this.request("GET", `/chats/${chatId}`);
  }

  async createChat(input: UnipileNewChatInput): Promise<UnipileChat> {
    return this.request("POST", "/chats", input);
  }

  async updateChat(
    chatId: string,
    input: UnipileChatUpdateInput
  ): Promise<void> {
    return this.request("PATCH", `/chats/${chatId}`, input);
  }

  // ===========================================================================
  // MESSAGES
  // ===========================================================================

  async getChatMessages(
    chatId: string,
    params?: UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileMessage>> {
    return this.request("GET", `/chats/${chatId}/messages`, undefined, {
      limit: params?.limit,
      cursor: params?.cursor,
    });
  }

  async sendMessage(
    chatId: string,
    input: UnipileSendMessageInput
  ): Promise<UnipileMessage> {
    return this.request("POST", `/chats/${chatId}/messages`, input);
  }

  async getMessage(messageId: string): Promise<UnipileMessage> {
    return this.request("GET", `/messages/${messageId}`);
  }

  async getMessageAttachment(messageId: string): Promise<Blob> {
    return this.requestBlob("GET", `/messages/${messageId}/attachment`);
  }

  async addReaction(
    messageId: string,
    input: UnipileMessageReactionInput
  ): Promise<void> {
    return this.request("POST", `/messages/${messageId}/reaction`, input);
  }

  async forwardMessage(
    messageId: string,
    input: UnipileForwardMessageInput
  ): Promise<void> {
    return this.request("POST", `/messages/${messageId}/forward`, input);
  }

  // ===========================================================================
  // ATTENDEES
  // ===========================================================================

  async getChatAttendees(chatId: string): Promise<UnipileAttendee[]> {
    return this.request("GET", `/chats/${chatId}/attendees`);
  }

  async getAttendee(attendeeId: string): Promise<UnipileAttendee> {
    return this.request("GET", `/attendees/${attendeeId}`);
  }

  async getAttendeePicture(attendeeId: string): Promise<Blob> {
    return this.requestBlob("GET", `/attendees/${attendeeId}/picture`);
  }

  // ===========================================================================
  // USERS / PROFILES
  // ===========================================================================

  async getOwnProfile(
    accountId: string
  ): Promise<UnipileUserProfile> {
    return this.request("GET", "/users/profile", undefined, {
      account_id: accountId,
    });
  }

  async updateOwnProfile(
    accountId: string,
    input: UnipileProfileUpdateInput
  ): Promise<void> {
    return this.request("PATCH", "/users/profile", {
      ...input,
      account_id: accountId,
    });
  }

  async getUserProfile(
    identifier: string,
    accountId: string,
    options?: { linkedinSections?: string }
  ): Promise<UnipileUserProfile> {
    return this.request("GET", `/users/${identifier}`, undefined, {
      account_id: accountId,
      linkedin_sections: options?.linkedinSections,
    });
  }

  // ===========================================================================
  // INVITATIONS
  // ===========================================================================

  async sendInvitation(
    input: UnipileSendInvitationInput
  ): Promise<void> {
    return this.request("POST", `/users/invite`, input);
  }

  async getSentInvitations(
    params: { account_id: string } & UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileInvitation>> {
    return this.request("GET", "/users/invite/sent", undefined, {
      account_id: params.account_id,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  async getReceivedInvitations(
    params: { account_id: string } & UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileInvitation>> {
    return this.request("GET", "/users/invitations/received", undefined, {
      account_id: params.account_id,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  async handleInvitation(
    invitationId: string,
    input: UnipileHandleInvitationInput
  ): Promise<void> {
    return this.request(
      "POST",
      `/users/invitations/${invitationId}/handle`,
      input
    );
  }

  async cancelSentInvitation(
    invitationId: string,
    accountId: string
  ): Promise<void> {
    return this.request(
      "DELETE",
      `/users/invite/sent/${invitationId}`,
      undefined,
      { account_id: accountId }
    );
  }

  // ===========================================================================
  // RELATIONS
  // ===========================================================================

  async getRelations(
    params: { account_id: string } & UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileRelation>> {
    return this.request("GET", "/users/relations", undefined, {
      account_id: params.account_id,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  async getFollowing(
    params: { account_id: string } & UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileRelation>> {
    return this.request("GET", "/users/following", undefined, {
      account_id: params.account_id,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  async getFollowers(
    params: { account_id: string } & UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileRelation>> {
    return this.request("GET", "/users/followers", undefined, {
      account_id: params.account_id,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  // ===========================================================================
  // POSTS & ENGAGEMENT
  // ===========================================================================

  async createPost(input: UnipileCreatePostInput): Promise<UnipilePost> {
    return this.request("POST", "/posts", input);
  }

  async getPost(postId: string): Promise<UnipilePost> {
    return this.request("GET", `/posts/${postId}`);
  }

  async getPostComments(
    postId: string,
    params?: UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileComment>> {
    return this.request("GET", `/posts/${postId}/comments`, undefined, {
      limit: params?.limit,
      cursor: params?.cursor,
    });
  }

  async addPostComment(
    postId: string,
    input: UnipileCreateCommentInput
  ): Promise<UnipileComment> {
    return this.request("POST", `/posts/${postId}/comments`, input);
  }

  async getPostReactions(
    postId: string,
    params?: UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileReaction>> {
    return this.request("GET", `/posts/${postId}/reactions`, undefined, {
      limit: params?.limit,
      cursor: params?.cursor,
    });
  }

  async addPostReaction(
    postId: string,
    input: UnipileCreateReactionInput
  ): Promise<void> {
    return this.request("POST", `/posts/${postId}/reactions`, input);
  }

  async getUserPosts(
    params: { account_id: string } & UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipilePost>> {
    return this.request("GET", "/users/posts", undefined, {
      account_id: params.account_id,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  /**
   * Fetch posts by a specific user.
   * Endpoint: GET /users/{identifier}/posts
   *
   * IMPORTANT: The identifier MUST be the provider_id (e.g. "ACoAABb2Wzc...")
   * obtained from getUserProfile(). Using the LinkedIn slug returns 422
   * "Recipient cannot be reached".
   */
  async getUserPostsByIdentifier(
    identifier: string,
    accountId: string,
    limit?: number
  ): Promise<UnipilePaginatedResponse<UnipilePost>> {
    return this.request("GET", `/users/${identifier}/posts`, undefined, {
      account_id: accountId,
      limit: limit || 5,
    });
  }

  async getUserComments(
    params: { account_id: string } & UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileComment>> {
    return this.request("GET", "/users/comments", undefined, {
      account_id: params.account_id,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  async getUserReactions(
    params: { account_id: string } & UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileReaction>> {
    return this.request("GET", "/users/reactions", undefined, {
      account_id: params.account_id,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  // ===========================================================================
  // LINKEDIN SPECIFIC
  // ===========================================================================

  async linkedinSearch(
    input: UnipileLinkedInSearchInput
  ): Promise<UnipilePaginatedResponse<UnipileLinkedInSearchResult>> {
    return this.request("POST", "/linkedin/search", input);
  }

  async linkedinSearchParameters(
    accountId: string
  ): Promise<unknown> {
    return this.request("GET", "/linkedin/search/parameters", undefined, {
      account_id: accountId,
    });
  }

  async linkedinCompany(
    companyIdentifier: string,
    accountId: string
  ): Promise<UnipileLinkedInCompany> {
    return this.request("GET", `/linkedin/company/${companyIdentifier}`, undefined, {
      account_id: accountId,
    });
  }

  async linkedinInMailBalance(
    accountId: string
  ): Promise<UnipileInMailBalance> {
    return this.request("GET", "/linkedin/inmail-balance", undefined, {
      account_id: accountId,
    });
  }

  async linkedinRaw(input: UnipileLinkedInRawInput): Promise<unknown> {
    return this.request("POST", "/linkedin", input);
  }

  async linkedinHiringProjects(
    accountId: string
  ): Promise<UnipilePaginatedResponse<UnipileLinkedInHiringProject>> {
    return this.request("GET", "/linkedin/hiring-projects", undefined, {
      account_id: accountId,
    });
  }

  async linkedinHiringProject(
    projectId: string,
    accountId: string
  ): Promise<UnipileLinkedInHiringProject> {
    return this.request(
      "GET",
      `/linkedin/hiring-projects/${projectId}`,
      undefined,
      { account_id: accountId }
    );
  }

  async linkedinMemberAction(
    memberId: string,
    input: UnipileLinkedInMemberActionInput
  ): Promise<void> {
    return this.request(
      "POST",
      `/linkedin/members/${memberId}/actions`,
      input
    );
  }

  async linkedinEndorsement(
    memberId: string,
    input: UnipileLinkedInEndorsementInput
  ): Promise<void> {
    return this.request(
      "POST",
      `/linkedin/members/${memberId}/endorsements`,
      input
    );
  }

  // --- LinkedIn Jobs ---

  async linkedinListJobs(
    accountId: string,
    params?: UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileLinkedInJob>> {
    return this.request("GET", "/linkedin/jobs", undefined, {
      account_id: accountId,
      limit: params?.limit,
      cursor: params?.cursor,
    });
  }

  async linkedinCreateJob(
    input: UnipileLinkedInCreateJobInput
  ): Promise<UnipileLinkedInJob> {
    return this.request("POST", "/linkedin/jobs", input);
  }

  async linkedinGetJob(
    jobId: string,
    accountId: string
  ): Promise<UnipileLinkedInJob> {
    return this.request("GET", `/linkedin/jobs/${jobId}`, undefined, {
      account_id: accountId,
    });
  }

  async linkedinUpdateJob(
    jobId: string,
    input: UnipileLinkedInJobUpdateInput & { account_id: string }
  ): Promise<UnipileLinkedInJob> {
    return this.request("PATCH", `/linkedin/jobs/${jobId}`, input);
  }

  async linkedinPublishJob(
    jobId: string,
    accountId: string
  ): Promise<void> {
    return this.request("POST", `/linkedin/jobs/${jobId}/publish`, {
      account_id: accountId,
    });
  }

  async linkedinCloseJob(
    jobId: string,
    accountId: string
  ): Promise<void> {
    return this.request("POST", `/linkedin/jobs/${jobId}/close`, {
      account_id: accountId,
    });
  }

  async linkedinJobApplicants(
    jobId: string,
    accountId: string,
    params?: UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileLinkedInApplicant>> {
    return this.request(
      "GET",
      `/linkedin/jobs/${jobId}/applicants`,
      undefined,
      {
        account_id: accountId,
        limit: params?.limit,
        cursor: params?.cursor,
      }
    );
  }

  async linkedinJobApplicant(
    jobId: string,
    applicantId: string,
    accountId: string
  ): Promise<UnipileLinkedInApplicant> {
    return this.request(
      "GET",
      `/linkedin/jobs/${jobId}/applicants/${applicantId}`,
      undefined,
      { account_id: accountId }
    );
  }

  async linkedinJobApplicantResume(
    jobId: string,
    applicantId: string,
    accountId: string
  ): Promise<Blob> {
    return this.requestBlob(
      "GET",
      `/linkedin/jobs/${jobId}/applicants/${applicantId}/resume?account_id=${accountId}`
    );
  }

  // ===========================================================================
  // WEBHOOKS
  // ===========================================================================

  async listWebhooks(): Promise<UnipileWebhook[]> {
    return this.request("GET", "/webhooks");
  }

  async createWebhook(input: UnipileWebhookInput): Promise<UnipileWebhook> {
    return this.request("POST", "/webhooks", input);
  }

  async deleteWebhook(id: string): Promise<void> {
    return this.request("DELETE", `/webhooks/${id}`);
  }

  // ===========================================================================
  // EMAIL (future use)
  // ===========================================================================

  async listMails(
    params: { account_id: string } & UnipilePaginationParams
  ): Promise<UnipilePaginatedResponse<UnipileMail>> {
    return this.request("GET", "/mails", undefined, {
      account_id: params.account_id,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  async getMail(mailId: string): Promise<UnipileMail> {
    return this.request("GET", `/mails/${mailId}`);
  }

  async sendMail(input: UnipileSendMailInput): Promise<void> {
    return this.request("POST", "/mails", input);
  }

  async deleteMail(mailId: string): Promise<void> {
    return this.request("DELETE", `/mails/${mailId}`);
  }

  async updateMail(
    mailId: string,
    input: UnipileMailUpdateInput
  ): Promise<void> {
    return this.request("PUT", `/mails/${mailId}`, input);
  }

  async getMailAttachment(mailId: string): Promise<Blob> {
    return this.requestBlob("GET", `/mails/${mailId}/attachment`);
  }

  async createDraft(input: UnipileDraftInput): Promise<void> {
    return this.request("POST", "/drafts", input);
  }

  async listFolders(accountId: string): Promise<UnipileFolder[]> {
    return this.request("GET", "/folders", undefined, {
      account_id: accountId,
    });
  }

  async getFolder(folderId: string): Promise<UnipileFolder> {
    return this.request("GET", `/folders/${folderId}`);
  }
}

// =============================================================================
// Factory / Singleton
// =============================================================================

let _client: UnipileClient | null = null;

export function getUnipileClient(): UnipileClient {
  if (!_client) {
    const apiKey = process.env.UNIPILE_API_KEY;
    if (!apiKey) {
      throw new Error("UNIPILE_API_KEY environment variable is not set");
    }
    _client = new UnipileClient(apiKey);
  }
  return _client;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract LinkedIn public identifier (slug) from a LinkedIn profile URL.
 * E.g., "https://www.linkedin.com/in/john-doe-123/" → "john-doe-123"
 */
export function extractLinkedInIdentifier(linkedinUrl: string): string {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!match) {
    throw new Error(`Invalid LinkedIn URL: ${linkedinUrl}`);
  }
  return match[1].replace(/\/$/, "");
}
