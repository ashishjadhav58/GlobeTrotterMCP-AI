"use client";

import { FormEvent, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Loader2,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  adminApi,
  getToken,
  getUser,
  type AgentMeta,
  type ToolCallTraceStep,
} from "@/lib/api";
import AgentTracePanel from "@/components/ai/AgentTracePanel";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

const WELCOME =
  "Admin AI assistant ready. Ask about today’s sign-ups, trips, revenue (mock), popular destinations, disabled users, suspicious activity, or community engagement. Example: “how many users signed up today and top 3 destinations?”";

export default function AdminChatPage() {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "sys-1", role: "system", text: WELCOME },
  ]);
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trace, setTrace] = useState<{
    toolCallTrace: ToolCallTraceStep[];
    agentMeta?: AgentMeta | null;
    savedAt: string;
  } | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const user = getUser();
    if (!user || user.role !== "ADMIN") {
      router.replace("/admin/dashboard");
    }
  }, [router]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setError("");
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", text }]);

    try {
      const data = await adminApi.chat({ message: text, history });
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", text: data.answer || "Done." },
      ]);
      setHistory((h) => [
        ...h,
        { role: "user", content: text },
        { role: "assistant", content: data.answer || "" },
      ]);
      if (data.tool_call_trace?.length) {
        setTrace({
          toolCallTrace: data.tool_call_trace,
          agentMeta: null,
          savedAt: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
      setMessages((m) => [
        ...m,
        { id: `e-${Date.now()}`, role: "assistant", text: `Sorry — ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        background: "#07090c",
        color: "#fff",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          flexShrink: 0,
          background: "rgba(7,9,12,0.95)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "0 16px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/admin/dashboard")}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "6px 12px",
            color: "rgba(255,255,255,0.8)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ArrowLeft size={14} /> Dashboard
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={16} color="#f87171" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Admin AI Chat</span>
        </div>
        <div style={{ width: 110 }} />
      </header>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          minHeight: 0,
        }}
      >
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
                      ? "rgba(239,68,68,0.18)"
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
                {m.text}
              </div>
            ))}
            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.5)",
                  padding: "6px 4px",
                }}
              >
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                Checking live admin tools…
              </div>
            )}
          </div>

          <form
            onSubmit={onSubmit}
            style={{
              flexShrink: 0,
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              padding: 12,
              background: "#0a0c10",
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSubmit(e as unknown as FormEvent);
                }
              }}
              placeholder="e.g. how many users today and top destinations?"
              rows={2}
              disabled={loading}
              style={textareaStyle}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                flexShrink: 0,
                background:
                  loading || !input.trim()
                    ? "rgba(239,68,68,0.35)"
                    : "linear-gradient(135deg,#ef4444 0%,#dc2626 100%)",
                border: "none",
                borderRadius: 10,
                padding: "12px 16px",
                color: "#fff",
                fontWeight: 700,
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              <Send size={15} />
              Send
            </button>
          </form>
          {error && (
            <div style={{ color: "#f87171", fontSize: 12, padding: "0 12px 10px" }}>{error}</div>
          )}
        </main>

        <aside
          style={{
            borderLeft: "1px solid rgba(255,255,255,0.06)",
            background: "#0a0c10",
            overflowY: "auto",
            padding: 12,
            minHeight: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Bot size={12} /> MCP tool-call trace
          </div>
          <AgentTracePanel trace={trace} title="Admin tools" />
          {!trace && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, marginTop: 8 }}>
              Live MCP calls (user counts, destinations, revenue, etc.) show here after each reply.
            </p>
          )}
        </aside>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
