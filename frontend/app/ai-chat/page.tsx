"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, ImagePlus, Loader2, MessageSquarePlus, Send, Sparkles, Trash2, X } from "lucide-react";
import {
  chatApi,
  getToken,
  uploadProfileImage,
  type AgentMeta,
  type ChatSessionSummary,
  type ToolCallTraceStep,
} from "@/lib/api";
import AgentTracePanel from "@/components/ai/AgentTracePanel";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  itineraryLink?: string | null;
  imageUrl?: string | null;
};

const SESSION_KEY = "gt_plan_chat_session";
const WELCOME =
  "Hi! I’m your GlobeTrotter planning assistant. Tell me the destination and budget — I’ll ask for travel dates and any missing details, then show a summary. I’ll only create the trip when you say yes. You can attach a cover photo (same as Plan Trip form) before saving, or update/delete a saved trip in this chat.";

function renderMessageText(text: string): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      const href =
        part.startsWith("http://localhost:3000") || part.startsWith("http://127.0.0.1:3000")
          ? part.replace(/^https?:\/\/[^/]+/, "") || "/"
          : part;
      const isInternal = href.startsWith("/") || part.includes("localhost:3000") || part.includes("127.0.0.1:3000");
      if (isInternal) {
        return (
          <Link key={i} href={href.startsWith("/") ? href : part} style={{ color: "#5eead4", textDecoration: "underline" }}>
            {part}
          </Link>
        );
      }
      return (
        <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: "#5eead4", textDecoration: "underline" }}>
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function toUiMessages(raw: Array<{ role: string; content: string }>): ChatMessage[] {
  if (!raw?.length) {
    return [{ id: "sys-1", role: "system", text: WELCOME }];
  }
  return raw.map((m, i) => ({
    id: `m-${i}-${m.role}`,
    role: m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "system",
    text: m.content,
  }));
}

/**
 * ChatGPT-style layout: [history] | [chat] | [MCP trace]
 */
export default function AiChatPage() {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "sys-1", role: "system", text: WELCOME },
  ]);
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [trace, setTrace] = useState<{
    toolCallTrace: ToolCallTraceStep[];
    agentMeta?: AgentMeta | null;
    savedAt: string;
  } | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      setSessionsLoading(true);
      const res = await chatApi.listSessions();
      setSessions(res.sessions || []);
    } catch {
      /* ignore */
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void refreshSessions();
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        void openSession(saved, false);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const openSession = async (id: string, persist = true) => {
    try {
      const data = await chatApi.getSession(id);
      setSessionId(data.session_id);
      setMessages(toUiMessages(data.messages || []));
      setTrace(null);
      setError("");
      if (persist) {
        try {
          sessionStorage.setItem(SESSION_KEY, data.session_id);
        } catch {
          /* ignore */
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open chat");
    }
  };

  const startNewChat = () => {
    setSessionId(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    setTrace(null);
    setError("");
    setCoverImageUrl(null);
    setCoverPreview(null);
    setMessages([{ id: `sys-${Date.now()}`, role: "system", text: WELCOME }]);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await chatApi.deleteSession(id);
      if (sessionId === id) startNewChat();
      await refreshSessions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete chat");
    }
  };

  const onPickCover = async (file: File | null) => {
    if (!file) return;
    if (!getToken()) {
      router.push("/login");
      return;
    }
    setError("");
    setUploadingImage(true);
    const localPreview = URL.createObjectURL(file);
    setCoverPreview(localPreview);
    try {
      const url = await uploadProfileImage(file);
      setCoverImageUrl(url);
      setCoverPreview(url);
      // Attach to session / last trip immediately via a short chat turn
      const note = "Please use this uploaded image as the cover photo for my trip.";
      setMessages((m) => [
        ...m,
        { id: `u-img-${Date.now()}`, role: "user", text: note, imageUrl: url },
      ]);
      setLoading(true);
      const data = await chatApi.planTrip({
        message: note,
        sessionId,
        coverImageUrl: url,
      });
      if (data.session_id) {
        setSessionId(data.session_id);
        try {
          sessionStorage.setItem(SESSION_KEY, data.session_id);
        } catch {
          /* ignore */
        }
      }
      if (data.cover_image_url) setCoverImageUrl(data.cover_image_url);
      setMessages((m) => [
        ...m,
        {
          id: `a-img-${Date.now()}`,
          role: "assistant",
          text: data.answer || "Cover photo saved for this chat. It will be applied when the trip is created or updated.",
          itineraryLink: data.itinerary_link,
        },
      ]);
      if (data.tool_call_trace?.length) {
        setTrace({
          toolCallTrace: data.tool_call_trace,
          agentMeta: null,
          savedAt: new Date().toISOString(),
        });
      }
      await refreshSessions();
    } catch (err: unknown) {
      setCoverImageUrl(null);
      setCoverPreview(null);
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploadingImage(false);
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearCover = () => {
    setCoverImageUrl(null);
    setCoverPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && !coverImageUrl) || loading || uploadingImage) return;
    if (!getToken()) {
      router.push("/login");
      return;
    }

    const message =
      text ||
      (coverImageUrl
        ? "Please use the attached cover photo for my trip."
        : "");
    if (!message) return;

    setError("");
    setInput("");
    setLoading(true);
    setMessages((m) => [
      ...m,
      {
        id: `u-${Date.now()}`,
        role: "user",
        text: message,
        imageUrl: coverImageUrl,
      },
    ]);

    try {
      const data = await chatApi.planTrip({
        message,
        sessionId,
        coverImageUrl: coverImageUrl || null,
      });
      if (data.session_id) {
        setSessionId(data.session_id);
        try {
          sessionStorage.setItem(SESSION_KEY, data.session_id);
        } catch {
          /* ignore */
        }
      }
      if (data.cover_image_url) setCoverImageUrl(data.cover_image_url);

      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: data.answer || "Done.",
          itineraryLink: data.itinerary_link,
        },
      ]);

      if (data.tool_call_trace?.length) {
        setTrace({
          toolCallTrace: data.tool_call_trace,
          agentMeta: null,
          savedAt: new Date().toISOString(),
        });
      }
      await refreshSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
      setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "assistant", text: `Sorry — ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header style={{ flexShrink: 0, background: "rgba(7,9,12,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 16px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 12px", color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <ArrowLeft size={14} /> Home
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Bot size={16} color="#2dd4bf" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>AI Trip Chat</span>
        </div>
        <button
          type="button"
          onClick={startNewChat}
          style={{ background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.3)", borderRadius: 8, padding: "6px 12px", color: "#2dd4bf", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <MessageSquarePlus size={14} /> New chat
        </button>
      </header>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "240px minmax(0, 1fr) 320px", minHeight: 0 }}>
        {/* Left: chat history */}
        <aside style={{ borderRight: "1px solid rgba(255,255,255,0.06)", background: "#0a0c10", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
            Chats {sessionsLoading ? "…" : ""}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
            {sessions.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No saved chats yet.</div>
            )}
            {sessions.map((s) => {
              const active = s.id === sessionId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void openSession(s.id)}
                  style={{
                    textAlign: "left",
                    background: active ? "rgba(45,212,191,0.12)" : "transparent",
                    border: active ? "1px solid rgba(45,212,191,0.35)" : "1px solid transparent",
                    borderRadius: 10,
                    padding: "10px 10px",
                    color: active ? "#fff" : "rgba(255,255,255,0.7)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <span style={{ flex: 1, fontSize: 12, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                    {s.title || "Chat"}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => void deleteSession(s.id, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void deleteSession(s.id, e as unknown as React.MouseEvent);
                    }}
                    title="Delete chat"
                    style={{ color: "rgba(255,255,255,0.35)", padding: 2 }}
                  >
                    <Trash2 size={13} />
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: chat */}
        <main style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  background:
                    m.role === "user"
                      ? "rgba(20,184,166,0.22)"
                      : m.role === "system"
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "rgba(255,255,255,0.88)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.imageUrl && (
                  <div style={{ marginBottom: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.imageUrl}
                      alt="Cover"
                      style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                  </div>
                )}
                {renderMessageText(m.text)}
                {m.itineraryLink && (
                  <div style={{ marginTop: 10 }}>
                    <Link
                      href={m.itineraryLink.replace(/^https?:\/\/[^/]+/, "") || m.itineraryLink}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)",
                        color: "#fff",
                        textDecoration: "none",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      <Sparkles size={13} /> Open itinerary
                    </Link>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.5)", padding: "6px 4px" }}>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                Thinking & calling tools…
              </div>
            )}
          </div>

          <form
            onSubmit={onSubmit}
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              padding: 12,
              background: "#0a0c10",
            }}
          >
            {(coverPreview || coverImageUrl) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverPreview || coverImageUrl || ""}
                  alt="Cover preview"
                  style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(45,212,191,0.4)" }}
                />
                <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                  {uploadingImage ? "Uploading cover photo…" : "Cover photo ready — will apply on save / update"}
                </div>
                <button
                  type="button"
                  onClick={clearCover}
                  style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 28, height: 28, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
                  title="Remove cover"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onPickCover(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || uploadingImage}
                title="Upload cover photo"
                style={{
                  flexShrink: 0,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  color: "#2dd4bf",
                  cursor: loading || uploadingImage ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <ImagePlus size={18} />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSubmit(e as unknown as FormEvent);
                  }
                }}
                placeholder="Message… or upload a cover photo like Plan Trip"
                rows={2}
                disabled={loading || uploadingImage}
                style={textareaStyle}
              />
              <button
                type="submit"
                disabled={loading || uploadingImage || (!input.trim() && !coverImageUrl)}
                style={{
                  flexShrink: 0,
                  background:
                    loading || uploadingImage || (!input.trim() && !coverImageUrl)
                      ? "rgba(20,184,166,0.35)"
                      : "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 16px",
                  color: "#fff",
                  fontWeight: 700,
                  cursor:
                    loading || uploadingImage || (!input.trim() && !coverImageUrl)
                      ? "not-allowed"
                      : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "inherit",
                }}
              >
                <Send size={15} />
                Send
              </button>
            </div>
          </form>
          {error && <div style={{ color: "#f87171", fontSize: 12, padding: "0 12px 10px" }}>{error}</div>}
        </main>

        {/* Right: MCP trace */}
        <aside style={{ borderLeft: "1px solid rgba(255,255,255,0.06)", background: "#0a0c10", overflowY: "auto", padding: 12, minHeight: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
            MCP tool-call trace
          </div>
          <AgentTracePanel trace={trace} title="Live tools" />
          {!trace && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginTop: 8 }}>
              Tool calls from the agent appear here after each reply.
            </p>
          )}
        </aside>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }
      @media (max-width: 960px) {
        /* keep usable on smaller screens by stacking via overflow scroll on columns */
      }`}</style>
    </div>
  );
}

const textareaStyle: CSSProperties = {
  flex: 1,
  resize: "none",
  background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "10px 12px",
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  minHeight: 52,
};
