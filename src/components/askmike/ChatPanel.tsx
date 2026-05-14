"use client";

import { useEffect, useRef, useState } from "react";
import {
  saveTranscript,
  getUserTranscripts,
  getUserTranscriptsForMember,
  updateTranscriptTitle,
} from "@/lib/coach-service";
import { anonymize, deanonymize } from "@/lib/anonymize";
import type { ChatMessage, Transcript } from "@/types/coach";
import type { NameMapping } from "@/lib/anonymize";

interface Props {
  coachId: string;
  coachName: string;
  chatIntro: string;
  context: string;
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userDisplayName: string;
  companyId: string;
  memberId?: string | null;
  memberName?: string | null;
  nameMapping?: NameMapping[];
  onGenerateActions?: (content: string) => void;
}

export default function ChatPanel({
  coachId,
  coachName,
  chatIntro,
  context,
  isOpen,
  onClose,
  userId,
  userDisplayName,
  companyId,
  memberId = null,
  memberName = null,
  nameMapping = [],
  onGenerateActions,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [history, setHistory] = useState<Transcript[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (messages.length === 0) {
        setMessages([{ role: "assistant", content: chatIntro }]);
        setTranscriptId(null);
      }
      if (pos === null && typeof window !== "undefined") {
        const w = 420;
        const h = 640;
        setPos({
          top: Math.max(24, window.innerHeight - h - 24),
          left: Math.max(24, window.innerWidth - w - 24),
        });
      }
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function handleHeaderMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!pos) return;
    // Ignore drags that start on a button inside the header
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startTop = pos.top;
    const startLeft = pos.left;
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      const nextLeft = startLeft + (ev.clientX - startX);
      const nextTop = startTop + (ev.clientY - startY);
      setPos({
        top: Math.max(0, Math.min(window.innerHeight - 60, nextTop)),
        left: Math.max(0, Math.min(window.innerWidth - 120, nextLeft)),
      });
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadHistory() {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const transcripts = memberId
        ? await getUserTranscriptsForMember(userId, coachId, memberId)
        : await getUserTranscripts(userId, coachId);
      setHistory(transcripts);
    } catch (err) {
      console.error("Failed to load chat history:", err);
      setHistoryError(
        err instanceof Error ? err.message : "Couldn't load history."
      );
    }
    setLoadingHistory(false);
  }

  function loadTranscript(t: Transcript) {
    setMessages(t.messages);
    setTranscriptId(t.id);
    setShowHistory(false);
  }

  function startNewChat() {
    setMessages([{ role: "assistant", content: chatIntro }]);
    setTranscriptId(null);
    setShowHistory(false);
  }

  async function generateTitleInBackground(newTranscriptId: string, convo: ChatMessage[]) {
    try {
      const anonymized = convo
        .filter((m) => !(m.role === "assistant" && m.content === chatIntro))
        .map((m) => ({ ...m, content: anonymize(m.content, nameMapping) }));
      const res = await fetch("/api/askmike/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: anonymized }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const title: string = (data.title ?? "").toString().trim();
      if (!title) return;
      await updateTranscriptTitle(newTranscriptId, title);
      setHistory((prev) =>
        prev.map((t) => (t.id === newTranscriptId ? { ...t, title } : t))
      );
    } catch {
      // Non-critical — leave transcript untitled
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      // Anonymize messages and context before sending to AI
      const anonymizedMessages = updated
        .filter((m) => m.content !== chatIntro || m.role !== "assistant")
        .map((m) => ({ ...m, content: anonymize(m.content, nameMapping) }));
      const anonymizedContext = anonymize(context, nameMapping);

      const res = await fetch("/api/askmike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId,
          messages: anonymizedMessages,
          context: anonymizedContext,
        }),
      });

      const data = await res.json();
      // De-anonymize the AI response before displaying
      const rawResponse = data.message ?? "Sorry, I couldn't generate a response.";
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: deanonymize(rawResponse, nameMapping),
      };
      const withResponse = [...updated, assistantMsg];
      setMessages(withResponse);

      // Save transcript
      const isFirstExchange = transcriptId === null;
      try {
        const id = await saveTranscript(transcriptId, {
          coachId,
          companyId,
          userId,
          userDisplayName,
          memberId,
          memberName,
          messages: withResponse,
        });
        setTranscriptId(id);

        if (isFirstExchange) {
          // Optimistically add to history so it shows before the title arrives
          const stub: Transcript = {
            id,
            coachId,
            companyId,
            userId,
            userDisplayName,
            memberId,
            memberName,
            messages: withResponse,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            createdAt: { toDate: () => new Date() } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            updatedAt: { toDate: () => new Date() } as any,
          };
          setHistory((prev) => [stub, ...prev]);
          generateTitleInBackground(id, withResponse);
        }
      } catch (error) {
        // Don't break the chat if persistence fails, but surface the error
        // so rules drift / auth gaps don't go silently undiagnosed like the
        // PERMISSION_DENIED bug discovered 2026-05-14.
        console.error("Failed to save transcript:", error);
      }
    } catch {
      setMessages([
        ...updated,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    }

    setLoading(false);
  }

  if (!isOpen) return null;

  const firstUserSnippet = (t: Transcript) => {
    const first = t.messages.find((m) => m.role === "user");
    if (!first) return "";
    return first.content.length > 60
      ? first.content.slice(0, 60) + "…"
      : first.content;
  };

  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 640;
  const desktopStyle: React.CSSProperties =
    isDesktop && pos
      ? { top: pos.top, left: pos.left, width: 420, height: 640 }
      : {};

  return (
    <div
      style={desktopStyle}
      className={`
        fixed z-50 flex flex-col border border-brand-gray bg-white shadow-xl
        inset-x-0 bottom-0 h-[70vh] rounded-t-[6px]
        sm:inset-auto sm:rounded-[6px]
        sm:min-w-[320px] sm:min-h-[360px]
        sm:max-w-[95vw] sm:max-h-[90vh]
        sm:resize sm:overflow-hidden
        ${dragging ? "select-none" : ""}
      `}
    >
      {/* Header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className="flex items-center justify-between border-b border-brand-gray bg-accent px-4 py-3 sm:cursor-move"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            {coachName}
          </h2>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="rounded-[4px] bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white transition hover:bg-white/30"
          >
            {showHistory ? "Chat" : "History"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startNewChat}
            className="text-xs text-white/70 transition hover:text-white"
          >
            + New
          </button>
          <button
            onClick={onClose}
            className="text-lg text-white/70 transition hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* History View */}
      {showHistory && (
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary/50">
            Past Conversations
          </h3>
          {loadingHistory ? (
            <p className="mt-4 text-xs text-primary/40">Loading...</p>
          ) : historyError ? (
            <div className="mt-4">
              <p className="text-xs text-accent">Couldn&apos;t load history.</p>
              <button
                onClick={loadHistory}
                className="mt-2 rounded-[4px] border border-brand-gray bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary transition hover:border-primary"
              >
                Retry
              </button>
            </div>
          ) : history.length === 0 ? (
            <p className="mt-4 text-xs text-primary/40">No past conversations.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {history.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadTranscript(t)}
                  className="w-full rounded-[4px] border border-brand-gray bg-white p-3 text-left transition hover:border-primary"
                >
                  <p className="text-xs font-semibold text-primary">
                    {t.title ?? firstUserSnippet(t) ?? "Untitled chat"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-primary/40">
                    {t.createdAt?.toDate
                      ? t.createdAt.toDate().toLocaleDateString()
                      : ""}
                    {" · "}
                    {t.messages.length} messages
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chat View */}
      {!showHistory && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-[4px] px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-white"
                      : "border border-brand-gray bg-white text-primary"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.role === "assistant" && onGenerateActions && msg.content !== chatIntro && (
                    <button
                      onClick={() => onGenerateActions(msg.content)}
                      className="mt-2 rounded-[2px] bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent transition hover:bg-accent/20"
                    >
                      Generate Actions
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary/50">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-brand-gray p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Reply..."
                className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="rounded-[4px] bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
