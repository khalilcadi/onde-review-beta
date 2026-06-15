"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Send,
  Sparkles,
  ExternalLink,
  Loader2,
  RefreshCw,
  MessageSquare,
  Linkedin,
  ArrowLeft,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ConversationWithMessages } from "@/lib/actions/conversations";
import {
  getConversations,
  markConversationRead as serverMarkRead,
  sendMessage as serverSendMessage,
} from "@/lib/actions/conversations";
import { syncConversation } from "@/lib/actions/linkedin";

// =============================================================================
// Helpers
// =============================================================================

/** Generate a consistent color from a string (for avatar backgrounds) */
function stringToColor(str: string): string {
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-purple-100 text-purple-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
    "bg-indigo-100 text-indigo-700",
    "bg-orange-100 text-orange-700",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Get initials from a name (max 2 chars) */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Format a relative timestamp for the conversation list */
function formatRelativeTime(ts: string): string {
  try {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "maintenant";
    if (diffMin < 60) return `${diffMin}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return "hier";
    if (diffDays < 7) return `${diffDays}j`;
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/** Format exact time for message bubbles */
function formatMessageTime(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Format a day separator label */
function formatDaySeparator(ts: string): string {
  try {
    const date = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (msgDay.getTime() === today.getTime()) return "Aujourd\u2019hui";
    if (msgDay.getTime() === yesterday.getTime()) return "Hier";
    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year:
        date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return "";
  }
}

/** Group messages by day */
function groupMessagesByDay(
  messages: { id: string; direction: string; content: string; timestamp: string }[]
) {
  const groups: {
    label: string;
    dateKey: string;
    messages: typeof messages;
  }[] = [];

  for (const msg of messages) {
    const date = new Date(msg.timestamp);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.dateKey === dateKey) {
      lastGroup.messages.push(msg);
    } else {
      groups.push({
        label: formatDaySeparator(msg.timestamp),
        dateKey,
        messages: [msg],
      });
    }
  }

  return groups;
}

/** Truncate text with ellipsis */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "\u2026";
}

// =============================================================================
// Component
// =============================================================================

interface InboxClientProps {
  initialConversations: ConversationWithMessages[];
}

export default function InboxClient({ initialConversations }: InboxClientProps) {
  const router = useRouter();
  const [conversations, setConversations] =
    useState<ConversationWithMessages[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string>("");
  const [reply, setReply] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [suggestionFeedback, setSuggestionFeedback] = useState("");
  const [suggestionMeta, setSuggestionMeta] = useState<{
    reasoning: string | null;
    ton: string | null;
    type: string | null;
    situation: string;
  } | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "conversation">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep local state in sync when server re-renders with fresh data
  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  const selectedConversation = conversations.find((c) => c.id === selectedId);

  // Sort: unread first, then by updatedAt desc
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.status === "unread" && b.status !== "unread") return -1;
      if (a.status !== "unread" && b.status === "unread") return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return sortedConversations;
    const q = searchQuery.toLowerCase();
    return sortedConversations.filter(
      (c) =>
        c.leadName.toLowerCase().includes(q) ||
        c.leadTitle.toLowerCase().includes(q)
    );
  }, [sortedConversations, searchQuery]);

  const unreadCount = conversations.filter((c) => c.status === "unread").length;

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation?.messages.length, selectedId]);

  // Auto-resize textarea whenever reply content changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [reply]);

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setReply(e.target.value);
    },
    []
  );

  const selectConversation = useCallback(
    (id: string) => {
      setSelectedId(id);
      setReply("");
      setShowFeedbackInput(false);
      setSuggestionFeedback("");
      setSuggestionMeta(null);
      setMobileView("conversation");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      // Mark as read locally
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: "read", unreadCount: 0 } : c
        )
      );
      // Mark as read on server (fire-and-forget)
      serverMarkRead(id);
    },
    []
  );

  const sendReply = async () => {
    if (!reply.trim() || !selectedConversation || isSending) return;
    const messageContent = reply.trim();
    setIsSending(true);

    const newMessage = {
      id: `msg-${Date.now()}`,
      direction: "outbound",
      content: messageContent,
      timestamp: new Date().toISOString(),
    };

    const previousConversations = conversations.map((c) => ({
      ...c,
      messages: [...c.messages],
    }));

    // Optimistic update
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? {
              ...c,
              messages: [...c.messages, newMessage],
              lastMessage: messageContent,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
    setReply("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Server sync with rollback
    const result = await serverSendMessage(selectedId, messageContent);
    if (result.success) {
      toast.success("Message envoy\u00e9");
    } else {
      // Rollback
      setConversations(previousConversations);
      setReply(messageContent);
      toast.error("Erreur lors de l\u2019envoi du message");
    }
    setIsSending(false);
  };

  /** Detect M2 situation from conversation messages */
  const detectM2Situation = useCallback(
    (
      messages: { direction: string }[],
      override?: "dernier_message"
    ): "reponse" | "relance" | "dernier_message" => {
      if (override === "dernier_message") return "dernier_message";
      if (messages.length === 0) return "relance";
      const lastMsg = messages[messages.length - 1];
      return lastMsg.direction === "inbound" ? "reponse" : "relance";
    },
    []
  );

  const suggestResponse = async (
    feedback?: string,
    situationOverride?: "dernier_message"
  ) => {
    if (!selectedConversation || isSuggesting) return;
    setIsSuggesting(true);

    const m2Situation = detectM2Situation(
      selectedConversation.messages,
      situationOverride
    );

    try {
      const response = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation: {
            id: selectedConversation.id,
            messages: selectedConversation.messages,
          },
          lead: {
            id: selectedConversation.leadId,
            firstName: selectedConversation.leadName.split(" ")[0],
            lastName: selectedConversation.leadName
              .split(" ")
              .slice(1)
              .join(" "),
            title: selectedConversation.leadTitle,
          },
          m2Situation,
          ...(feedback && reply ? { currentSuggestion: reply, feedback } : {}),
        }),
      });

      if (!response.ok) throw new Error("API error");

      const data = await response.json();
      setReply(data.message);
      setSuggestionMeta({
        reasoning: data.reasoning || null,
        ton: data.ton || null,
        type: data.type || null,
        situation: m2Situation,
      });
      setShowFeedbackInput(true);
    } catch {
      toast.error("Erreur de suggestion IA");
    } finally {
      setIsSuggesting(false);
      setSuggestionFeedback("");
    }
  };

  const handleSyncConversation = async () => {
    if (!selectedConversation || isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncConversation(selectedConversation.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data.newMessages > 0) {
        toast.success(
          `${result.data.newMessages} nouveau(x) message(s) synchronis\u00e9(s)`
        );
      } else {
        toast.info("Conversation d\u00e9j\u00e0 \u00e0 jour");
      }
      // Always re-fetch conversations to update local state
      // (messages may exist in DB but not in client state)
      const freshResult = await getConversations();
      if (freshResult.success) {
        setConversations(freshResult.data);
      }
    } catch {
      toast.error("Erreur de synchronisation");
    } finally {
      setIsSyncing(false);
    }
  };

  // Extract LinkedIn slug from URL for external link
  const getLinkedInExternalUrl = (url: string | null): string | null => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    // If it's just a slug like "john-doe", build the full URL
    return `https://www.linkedin.com/in/${url}`;
  };

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 md:gap-6">
      {/* ================================================================= */}
      {/* CONVERSATION LIST (Left Panel)                                     */}
      {/* ================================================================= */}
      <div
        className={`w-full md:w-96 flex flex-col shrink-0 overflow-hidden bg-white/80 backdrop-blur-sm border border-border/50 rounded-xl ${
          mobileView === "conversation" ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2.5">
              Inbox
              {unreadCount > 0 && (
                <Badge
                  variant="accent"
                  className="text-xs px-2 py-0.5 font-semibold"
                >
                  {unreadCount}
                </Badge>
              )}
            </h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 rounded-lg bg-muted/50 border-0 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all duration-200"
            />
          </div>
        </div>

        {/* Conversation items */}
        <ScrollArea className="flex-1">
          <div className="px-2 pb-2">
            {filteredConversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                {searchQuery ? (
                  <>
                    <Search className="h-8 w-8 mb-3 opacity-30" />
                    <p className="text-sm">Aucun r&eacute;sultat</p>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-8 w-8 mb-3 opacity-30" />
                    <p className="text-sm font-medium mb-1">Aucune conversation</p>
                    <p className="text-xs text-muted-foreground/70">
                      Commencez par prospecter depuis le Pipeline
                    </p>
                  </>
                )}
              </div>
            )}

            {filteredConversations.map((conversation) => {
              const isSelected = selectedId === conversation.id;
              const isUnread = conversation.status === "unread";
              const avatarColor = stringToColor(conversation.leadName);

              return (
                <div
                  key={conversation.id}
                  className={`flex cursor-pointer gap-3 rounded-lg px-3 py-3 transition-all duration-150 ${
                    isSelected
                      ? "bg-accent/8 shadow-sm"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => selectConversation(conversation.id)}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0 mt-0.5">
                    <Avatar className="h-11 w-11">
                      {conversation.leadProfilePictureUrl && (
                        <AvatarImage
                          src={conversation.leadProfilePictureUrl}
                          alt={conversation.leadName}
                        />
                      )}
                      <AvatarFallback
                        className={`text-xs font-medium ${avatarColor}`}
                      >
                        {getInitials(conversation.leadName)}
                      </AvatarFallback>
                    </Avatar>
                    {isUnread && (
                      <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent border-2 border-white" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className={`text-sm truncate ${
                          isUnread
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground/80"
                        }`}
                      >
                        {conversation.leadName}
                      </span>
                      <span className="text-[11px] text-muted-foreground/60 shrink-0 ml-2">
                        {formatRelativeTime(conversation.updatedAt)}
                      </span>
                    </div>
                    {conversation.leadTitle && (
                      <div className="text-xs text-muted-foreground/60 truncate mb-0.5">
                        {conversation.leadTitle}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Linkedin className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                      <p
                        className={`text-[13px] truncate leading-relaxed ${
                          isUnread
                            ? "text-foreground/70 font-medium"
                            : "text-muted-foreground/70"
                        }`}
                      >
                        {truncate(conversation.lastMessage || "Pas de message", 60)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ================================================================= */}
      {/* CONVERSATION PANEL (Right)                                         */}
      {/* ================================================================= */}
      <div
        className={`flex-1 flex flex-col overflow-hidden bg-white/80 backdrop-blur-sm border border-border/50 rounded-xl ${
          mobileView === "list" ? "hidden md:flex" : "flex"
        }`}
      >
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
              <div className="flex items-center gap-3 min-w-0">
                {/* Back button (mobile) */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 md:hidden shrink-0"
                  onClick={() => setMobileView("list")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>

                <Avatar className="h-10 w-10 shrink-0">
                  {selectedConversation.leadProfilePictureUrl && (
                    <AvatarImage
                      src={selectedConversation.leadProfilePictureUrl}
                      alt={selectedConversation.leadName}
                    />
                  )}
                  <AvatarFallback
                    className={`text-xs font-medium ${stringToColor(
                      selectedConversation.leadName
                    )}`}
                  >
                    {getInitials(selectedConversation.leadName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-foreground truncate">
                    {selectedConversation.leadName}
                  </h2>
                  {selectedConversation.leadTitle && (
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                      {selectedConversation.leadTitle}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                  onClick={handleSyncConversation}
                  disabled={isSyncing}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
                  />
                  <span className="ml-1.5 hidden sm:inline text-xs">
                    {isSyncing ? "Sync..." : "Sync"}
                  </span>
                </Button>

                {selectedConversation.leadLinkedInUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <a
                      href={
                        getLinkedInExternalUrl(
                          selectedConversation.leadLinkedInUrl
                        ) || "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Linkedin className="h-3.5 w-3.5" />
                      <span className="ml-1.5 hidden sm:inline text-xs">
                        LinkedIn
                      </span>
                    </a>
                  </Button>
                )}

                {selectedConversation.leadId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <Link
                      href={`/pipeline/${selectedConversation.leadId}`}
                    >
                      <User className="h-3.5 w-3.5" />
                      <span className="ml-1.5 hidden sm:inline text-xs">
                        Fiche
                      </span>
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin bg-muted/20">
              <div className="max-w-2xl mx-auto space-y-1">
                {selectedConversation.messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mb-3 opacity-30" />
                    <p className="text-sm">Aucun message dans cette conversation</p>
                  </div>
                ) : (
                  groupMessagesByDay(selectedConversation.messages).map(
                    (group) => (
                      <div key={group.dateKey}>
                        {/* Day separator */}
                        <div className="flex items-center gap-3 py-4">
                          <div className="flex-1 h-px bg-border/40" />
                          <span className="text-[11px] text-muted-foreground/60 font-medium px-2">
                            {group.label}
                          </span>
                          <div className="flex-1 h-px bg-border/40" />
                        </div>

                        {/* Messages in this day */}
                        {group.messages.map((message, idx) => {
                          const isOutbound = message.direction === "outbound";
                          const prevMsg = group.messages[idx - 1];
                          const sameSenderAsPrev =
                            prevMsg &&
                            prevMsg.direction === message.direction;
                          const nextMsg = group.messages[idx + 1];
                          const sameSenderAsNext =
                            nextMsg &&
                            nextMsg.direction === message.direction;
                          const showAvatar = !isOutbound && !sameSenderAsNext;
                          const avatarColor = stringToColor(selectedConversation.leadName);

                          return (
                            <div
                              key={message.id}
                              className={`flex ${
                                isOutbound ? "justify-end" : "justify-start"
                              } ${sameSenderAsPrev ? "mt-0.5" : "mt-4"}`}
                            >
                              {/* Inbound: avatar column */}
                              {!isOutbound && (
                                <div className="w-8 mr-2 flex items-end shrink-0">
                                  {showAvatar && (
                                    <Avatar className="h-7 w-7">
                                      {selectedConversation.leadProfilePictureUrl && (
                                        <AvatarImage
                                          src={selectedConversation.leadProfilePictureUrl}
                                          alt={selectedConversation.leadName}
                                        />
                                      )}
                                      <AvatarFallback className={`text-[10px] font-medium ${avatarColor}`}>
                                        {getInitials(selectedConversation.leadName)}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}
                                </div>
                              )}

                              <div className={isOutbound ? "max-w-[70%]" : "max-w-[70%]"}>
                                {/* Sender name (only for first inbound in a group) */}
                                {!isOutbound && !sameSenderAsPrev && (
                                  <p className="text-[11px] text-muted-foreground font-medium mb-1">
                                    {selectedConversation.leadName}
                                  </p>
                                )}

                                <div
                                  className={`px-3.5 py-2.5 shadow-sm ${
                                    isOutbound
                                      ? `bg-accent text-white ${
                                          sameSenderAsNext
                                            ? "rounded-2xl rounded-br-md"
                                            : "rounded-2xl rounded-br-sm"
                                        }`
                                      : `bg-white dark:bg-stone-800 border border-border/50 text-foreground ${
                                          sameSenderAsNext
                                            ? "rounded-2xl rounded-bl-md"
                                            : "rounded-2xl rounded-bl-sm"
                                        }`
                                  }`}
                                >
                                  <p className="text-[13.5px] whitespace-pre-wrap leading-relaxed">
                                    {message.content}
                                  </p>
                                </div>

                                {/* Time (show on last message of a consecutive group) */}
                                {!sameSenderAsNext && (
                                  <p
                                    className={`text-[10px] mt-1 text-muted-foreground/60 ${
                                      isOutbound ? "text-right" : "text-left"
                                    }`}
                                  >
                                    {formatMessageTime(message.timestamp)}
                                    {isOutbound && (
                                      <span className="ml-1.5">Vous</span>
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Reply area */}
            <div className="border-t border-border/40 px-4 py-3">
              <div className="max-w-2xl mx-auto">
                {/* AI Suggest buttons */}
                <div className="mb-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => suggestResponse()}
                      disabled={isSuggesting}
                      className="h-7 px-2.5 text-accent hover:text-accent hover:bg-accent/10 text-xs"
                    >
                      {isSuggesting ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          G&eacute;n&eacute;ration...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-1 h-3 w-3" />
                          Sugg&eacute;rer (auto)
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => suggestResponse(undefined, "dernier_message")}
                      disabled={isSuggesting}
                      className="h-7 px-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs"
                    >
                      Dernier message
                    </Button>
                  </div>

                  {/* Suggestion metadata (reasoning, ton) */}
                  {suggestionMeta && reply && (
                    <div className="mt-1.5 px-2.5 py-2 rounded-lg bg-accent/5 border border-accent/10 text-xs space-y-1">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-4 font-medium"
                        >
                          {suggestionMeta.situation === "reponse"
                            ? "R\u00e9ponse"
                            : suggestionMeta.situation === "relance"
                              ? "Relance"
                              : "Dernier msg"}
                        </Badge>
                        {suggestionMeta.ton && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4 font-medium"
                          >
                            Ton : {suggestionMeta.ton}
                          </Badge>
                        )}
                      </div>
                      {suggestionMeta.reasoning && (
                        <p className="text-muted-foreground/80 leading-relaxed">
                          {suggestionMeta.reasoning}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Feedback input for refining AI suggestion */}
                  {showFeedbackInput && reply && (
                    <div className="flex gap-2 items-center mt-1.5">
                      <input
                        type="text"
                        placeholder="Ajuster : plus direct, mentionne X..."
                        className="flex-1 h-7 rounded-lg bg-muted/50 border border-border/30 px-2.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
                        value={suggestionFeedback}
                        onChange={(e) => setSuggestionFeedback(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && suggestionFeedback.trim()) {
                            suggestResponse(suggestionFeedback);
                          }
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-accent hover:text-accent hover:bg-accent/10"
                        onClick={() => suggestResponse(suggestionFeedback || undefined)}
                        disabled={isSuggesting || !suggestionFeedback.trim()}
                      >
                        <RefreshCw className={`h-3 w-3 ${isSuggesting ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Input + Send */}
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={textareaRef}
                    placeholder="&Eacute;crire un message..."
                    className="flex-1 resize-none rounded-xl bg-muted/40 border border-border/30 px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-transparent min-h-[80px] transition-all duration-200"
                    value={reply}
                    onChange={handleTextareaChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    rows={3}
                  />
                  <Button
                    variant="accent"
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0 mb-1"
                    onClick={sendReply}
                    disabled={!reply.trim() || isSending}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty state — no conversation selected */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-medium text-foreground/60 mb-1">
                S&eacute;lectionnez une conversation
              </p>
              <p className="text-xs text-muted-foreground/50">
                Choisissez un contact dans la liste pour voir les messages
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
