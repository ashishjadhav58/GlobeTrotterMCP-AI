"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";
import AgentTracePanel from "@/components/ai/AgentTracePanel";
import type { AgentMeta, ToolCallTraceStep } from "@/lib/api";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

/**
 * Lightweight agent chat: posts destination/dates/budget to the Python /plan-trip
 * service (via Next rewrite proxy or direct). Demo-focused, not a free-form LLM chat.
 */
export default function AiChatPage() {
  const router = useRouter();
  const [destination, setDestination] = useState("London, United Kingdom");
  const [startDate, setStartDate] = useState("2026-09-10");
  const [endDate, setEndDate] = useState("2026-09-11");
  const [budget, setBudget] = useState("500");
  const [interests, setInterests] = useState("museums, walking");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "sys-1",
      role: "system",
      text: "Ask the MCP agent to plan a trip. It runs search → generate → budget check (and alternatives if needed).",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<{
    toolCallTrace: ToolCallTraceStep[];
    agentMeta?: AgentMeta | null;
    savedAt: string;
  } | null>(null);
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const prompt = `Plan ${destination} from ${startDate} to ${endDate}, budget $${budget}. Interests: ${interests}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", text: prompt },
    ]);

    try {
      // Prefer going through Express when logged in (same auth stack); otherwise hit AI service via rewrite if configured.
      // Direct browser → AI service (dev): Next may not proxy :8000, so we call backend create path only when token exists.
      const token = getToken();
      let data: any;

      if (token) {
        const res = await fetch("/api/trips", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: `Chat plan: ${destination}`,
            startDate,
            endDate,
            location: destination,
            maxBudget: parseFloat(budget),
            description: interests,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || data.detail || "Plan failed");
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: `Created trip “${data.trip?.name}”. Open itinerary to edit days, or inspect the MCP trace below.`,
          },
        ]);
        if (data.toolCallTrace?.length) {
          setTrace({
            toolCallTrace: data.toolCallTrace,
            agentMeta: data.agentMeta,
            savedAt: new Date().toISOString(),
          });
        }
        if (data.trip?.id) {
          setTimeout(() => router.push(`/itinerary/${data.trip.id}`), 1200);
        }
      } else {
        throw new Error("Please log in first, then use this chat (it creates a real trip via /api/trips).");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
      setMessages((m) => [
        ...m,
        { id: `e-${Date.now()}`, role: "assistant", text: `Error: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", padding: "24px 16px 80px" }}>
      <main style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>MCP agent chat</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
              Structured planner (not free-form chat) — same agent loop as Plan Trip
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/plan-trip")}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 14px", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}
          >
            Plan Trip form
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 220, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14 }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "90%",
                background:
                  m.role === "user"
                    ? "rgba(20,184,166,0.2)"
                    : m.role === "system"
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(139,92,246,0.15)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.5,
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {m.text}
            </div>
          ))}
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14 }}>
          <label style={labelStyle}>
            Destination
            <input value={destination} onChange={(e) => setDestination(e.target.value)} style={inputStyle} required />
          </label>
          <label style={labelStyle}>
            Budget (USD)
            <input value={budget} onChange={(e) => setBudget(e.target.value)} style={inputStyle} required />
          </label>
          <label style={labelStyle}>
            Start
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} required />
          </label>
          <label style={labelStyle}>
            End
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} required />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            Interests
            <input value={interests} onChange={(e) => setInterests(e.target.value)} style={inputStyle} />
          </label>
          {error && (
            <div style={{ gridColumn: "1 / -1", color: "#f87171", fontSize: 13 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              gridColumn: "1 / -1",
              background: loading ? "rgba(20,184,166,0.4)" : "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)",
              border: "none",
              borderRadius: 10,
              padding: "12px 16px",
              color: "#fff",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Running MCP agent…" : "Run agent & create trip"}
          </button>
        </form>

        <AgentTracePanel trace={trace} title="Live MCP tool-call trace" />
      </main>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "rgba(255,255,255,0.55)",
};

const inputStyle: CSSProperties = {
  background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
};
