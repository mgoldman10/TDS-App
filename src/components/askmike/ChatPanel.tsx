"use client";

import { useEffect, useRef, useState } from "react";
import { saveTranscript, getUserTranscripts } from "@/lib/coach-service";
import type { ChatMessage, Transcript } from "@/types/coach";

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
  onGenerateActions,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [history, setHistory] = useState<Transcript[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (messages.length === 0) {
        setMessages([{ role: "assistant", content: chatIntro }]);
        setTranscriptId(null);
      }
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const transcripts = await getUserTranscripts(userId, coachId);
      setHistory(transcripts);
    } catch (err) {
      console.error("Failed to load chat history:", err);
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

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/askmike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId,
          messages: updated.filter((m) => m.content !== chatIntro || m.role !== "assistant"),
          context,
        }),
      });

      const data = await res.json();
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.message ?? "Sorry, I couldn't generate a response.",
      };
      const withResponse = [...updated, assistantMsg];
      setMessages(withResponse);

      // Save transcript
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
      } catch {
        // Non-critical
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

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-primary/30" onClick={onClose} />

      {/* Panel */}
      <div className="flex h-full w-full sm:w-[480px] flex-col border-l border-brand-gray bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brand-gray bg-accent px-4 py-3">
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
                      {t.memberName ?? "General"} — {t.messages.length} messages
                    </p>
                    <p className="mt-0.5 text-[10px] text-primary/40">
                      {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : ""}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-primary/50">
                      {t.messages.find((m) => m.role === "user")?.content ?? ""}
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
                  placeholder="Ask a question..."
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
    </div>
  );
}
