import type { AgentMeta, ToolCallTraceStep } from "@/lib/api";

const KEY_PREFIX = "globetrotter:agentTrace:";

export type StoredAgentTrace = {
  toolCallTrace: ToolCallTraceStep[];
  agentMeta?: AgentMeta | null;
  savedAt: string;
};

export function saveAgentTrace(
  tripId: string,
  payload: { toolCallTrace?: ToolCallTraceStep[]; agentMeta?: AgentMeta | null }
) {
  if (typeof window === "undefined" || !tripId) return;
  const toolCallTrace = payload.toolCallTrace || [];
  if (!toolCallTrace.length) return;
  const stored: StoredAgentTrace = {
    toolCallTrace,
    agentMeta: payload.agentMeta ?? null,
    savedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${tripId}`, JSON.stringify(stored));
  } catch {
    // ignore quota / private mode
  }
}

export function loadAgentTrace(tripId: string): StoredAgentTrace | null {
  if (typeof window === "undefined" || !tripId) return null;
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${tripId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAgentTrace;
    if (!Array.isArray(parsed.toolCallTrace)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseAgentTraceField(raw: string | null | undefined): StoredAgentTrace | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as StoredAgentTrace;
    if (!Array.isArray(parsed.toolCallTrace)) return null;
    return {
      toolCallTrace: parsed.toolCallTrace,
      agentMeta: parsed.agentMeta ?? null,
      savedAt: parsed.savedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
