"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, ListTree, XCircle } from "lucide-react";
import type { AgentMeta, ToolCallTraceStep } from "@/lib/api";

export interface AgentTracePayload {
  toolCallTrace: ToolCallTraceStep[];
  agentMeta?: AgentMeta | null;
  savedAt?: string;
}

type Props = {
  trace: AgentTracePayload | null;
  title?: string;
};

const TOOL_LABELS: Record<string, string> = {
  search_cities: "Search cities",
  search_activities: "Search activities",
  generate_itinerary: "Generate itinerary",
  check_budget: "Check budget",
  suggest_alternatives: "Suggest cheaper swaps",
  generate_expenses: "Generate expenses",
  compare_destinations: "Compare destinations",
  check_weather_for_trip: "Check weather",
  optimize_itinerary_order: "Optimize order",
  find_similar_trips: "Find similar trips",
  persist_planned_trip: "Save trip",
  update_planned_trip: "Update trip",
  delete_user_trip: "Delete trip",
  get_today_user_count: "Users today",
  get_today_trip_count: "Trips today",
  get_revenue_summary: "Revenue summary",
  get_popular_destinations: "Popular destinations",
  get_disabled_users: "Disabled users",
  flag_suspicious_activity: "Flag suspicious",
  get_community_engagement_stats: "Community stats",
};

function summarizeOutput(tool: string, output: unknown): string {
  if (!output || typeof output !== "object") return "";
  const o = output as Record<string, unknown>;
  if (tool === "search_cities" && typeof o.count === "number") return `${o.count} cities`;
  if (tool === "search_activities" && typeof o.count === "number") return `${o.count} activities`;
  if (tool === "check_budget") {
    const passed = Boolean(o.passed);
    const overage = o.overage_amount;
    const total = o.estimated_total;
    return passed
      ? `passed · total $${total}`
      : `over budget · overage $${overage}`;
  }
  if (tool === "generate_itinerary" && Array.isArray(o.itinerary)) {
    return `${o.itinerary.length} day(s)`;
  }
  if (tool === "suggest_alternatives" && Array.isArray(o.swaps)) {
    return `${o.swaps.length} swap(s)`;
  }
  if (tool === "generate_expenses" && typeof o.count === "number") {
    return `${o.count} line items`;
  }
  return "";
}

export default function AgentTracePanel({ trace, title = "MCP agent trace" }: Props) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const steps = trace?.toolCallTrace || [];
  const meta = trace?.agentMeta;

  const status = useMemo(() => {
    if (!trace) return null;
    if (meta?.budgetPassed === true) return "passed";
    if (meta?.budgetPassed === false) return "failed";
    return "unknown";
  }, [trace, meta]);

  if (!trace || steps.length === 0) return null;

  return (
    <section
      style={{
        background: "rgba(15, 23, 42, 0.65)",
        border: "1px solid rgba(45, 212, 191, 0.22)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ListTree size={16} color="#2dd4bf" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
              {steps.length} tool call{steps.length === 1 ? "" : "s"}
              {meta?.attemptsUsed != null ? ` · ${meta.attemptsUsed} generate attempt(s)` : ""}
              {trace.savedAt
                ? ` · ${new Date(trace.savedAt).toLocaleTimeString()}`
                : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {status === "passed" && (
            <span style={badgeStyle("#10b981")}>
              <CheckCircle2 size={13} /> Budget OK
            </span>
          )}
          {status === "failed" && (
            <span style={badgeStyle("#f87171")}>
              <XCircle size={13} /> Over budget
            </span>
          )}
          {status === "unknown" && (
            <span style={badgeStyle("rgba(255,255,255,0.45)")}>
              <CircleAlert size={13} /> Trace
            </span>
          )}
          {open ? <ChevronDown size={16} color="rgba(255,255,255,0.5)" /> : <ChevronRight size={16} color="rgba(255,255,255,0.5)" />}
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {meta?.budgetCheck && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                fontSize: 12,
                color: "rgba(255,255,255,0.65)",
              }}
            >
              <span style={pillStyle}>max ${String(meta.budgetCheck.max_budget ?? "—")}</span>
              <span style={pillStyle}>est. ${String(meta.budgetCheck.estimated_total ?? "—")}</span>
              <span style={pillStyle}>overage ${String(meta.budgetCheck.overage_amount ?? 0)}</span>
            </div>
          )}

          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {steps.map((step) => {
              const isOpen = Boolean(expanded[step.step]);
              const label = TOOL_LABELS[step.tool] || step.tool;
              const summary = summarizeOutput(step.tool, step.output);
              return (
                <li
                  key={step.step}
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.25)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [step.step]: !prev[step.step] }))
                    }
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: "transparent",
                      border: "none",
                      color: "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        background: "rgba(45,212,191,0.15)",
                        color: "#2dd4bf",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {step.step}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</span>
                    {summary && (
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{summary}</span>
                    )}
                    {isOpen ? (
                      <ChevronDown size={14} color="rgba(255,255,255,0.4)" />
                    ) : (
                      <ChevronRight size={14} color="rgba(255,255,255,0.4)" />
                    )}
                  </button>
                  {isOpen && (
                    <div style={{ padding: "0 12px 12px", display: "grid", gap: 8 }}>
                      <TraceJson label="input" value={step.input} />
                      <TraceJson label="output" value={step.output} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

function TraceJson({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 10,
          borderRadius: 8,
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.06)",
          fontSize: 11,
          lineHeight: 1.45,
          color: "rgba(226,232,240,0.9)",
          overflow: "auto",
          maxHeight: 180,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function badgeStyle(color: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    color,
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${color}33`,
    borderRadius: 999,
    padding: "4px 9px",
  };
}

const pillStyle: CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 999,
  padding: "4px 10px",
};
