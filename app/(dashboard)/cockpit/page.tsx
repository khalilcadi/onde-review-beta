"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function buildWelcomeMessage(name: string): ChatMessage {
  return {
    id: "1",
    role: "assistant",
    content: `Bonjour ${name} ! Je suis votre assistant IA PROSPECTOR. Comment puis-je vous aider aujourd'hui ?\n\nVoici quelques questions que vous pouvez me poser :\n- "Quels sont mes leads les plus chauds ?"\n- "Quel est mon taux de réponse cette semaine ?"\n- "Qui devrais-je relancer aujourd'hui ?"`,
  };
}

const SUGGESTED_QUESTIONS = [
  "Leads chauds cette semaine ?",
  "Taux de réponse par séquence ?",
  "Qui relancer aujourd'hui ?",
  "Récap de la semaine",
];


// Simple markdown renderer
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    let processed: React.ReactNode = line;

    // Bold
    if (line.includes("**")) {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      processed = parts.map((part, j) =>
        j % 2 === 1 ? (
          <strong key={j}>{part}</strong>
        ) : (
          <span key={j}>{part}</span>
        )
      );
    }

    if (line.trim() === "") {
      elements.push(<br key={i} />);
    } else {
      elements.push(
        <span key={i} className="block">
          {processed}
        </span>
      );
    }
  });

  return elements;
}

export default function CockpitPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([buildWelcomeMessage("Utilisateur")]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load user name and update welcome message
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.full_name
        ?? data.user?.email?.split("@")[0]
        ?? "Utilisateur";
      setMessages((prev) =>
        prev.map((m) => (m.id === "1" ? buildWelcomeMessage(name) : m))
      );
    });
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setApiError(false);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages
            .filter((m) => m.id !== "1")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) throw new Error("API error");

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: data.message,
        },
      ]);
    } catch {
      setApiError(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: "D\u00e9sol\u00e9, je n\u2019ai pas pu traiter votre demande. V\u00e9rifiez que votre cl\u00e9 API est configur\u00e9e dans Settings > Cl\u00e9s API, puis r\u00e9essayez.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInput(question);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* Main chat card */}
      <div className="flex-1 flex flex-col bg-card rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Bot className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Cockpit IA</h2>
              <p className="text-xs text-muted-foreground">Assistant prospection</p>
            </div>
          </div>
          {apiError && (
            <div className="flex items-center gap-1.5 rounded-sm bg-muted px-3 py-1 text-xs text-amber-600">
              <AlertCircle className="h-3 w-3" />
              Mode d&eacute;mo (fallback)
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto px-6 py-6">
            <div className="space-y-5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                      <Bot className="h-4 w-4 text-accent-foreground" />
                    </div>
                  )}
                  <div
                    className={`max-w-[70%] px-4 py-3 ${
                      message.role === "user"
                        ? "bg-accent text-accent-foreground rounded-lg rounded-br-sm"
                        : "bg-muted rounded-lg rounded-bl-sm"
                    }`}
                  >
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.role === "assistant"
                        ? renderMarkdown(message.content)
                        : message.content}
                    </div>
                  </div>
                  {message.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                    <Bot className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="bg-muted rounded-lg rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1.5 py-1">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                      <span
                        className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      />
                      <span
                        className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Suggested Questions + Input */}
        <div className="border-t border-border px-6 py-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                onClick={() => handleSuggestedQuestion(question)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="h-3 w-3" />
                {question}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Posez une question sur votre pipeline..."
              className="flex-1 h-11 rounded-lg border border-border bg-muted/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isLoading}
            />
            <Button
              variant="accent"
              className="h-11 px-4 rounded-lg"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
