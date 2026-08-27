/**
 * Client for the Python MCP AI service (ai-service/).
 * createTrip / regenerateItinerary call POST /plan-trip instead of Gemini directly.
 */

function aiServiceBaseUrl() {
  return (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
}

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date for AI service: ${value}`);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * @param {object} params
 * @param {string} [params.name]
 * @param {string} params.destination
 * @param {string|Date} params.startDate
 * @param {string|Date} params.endDate
 * @param {number} params.maxBudget
 * @param {string} [params.description]
 * @param {string} [params.interests]
 * @param {boolean} [params.includeExpenses=true]
 * @param {number} [params.maxAttempts]
 * @returns {Promise<{
 *   itinerary: string,
 *   expenses: string,
 *   toolCallTrace: object[],
 *   budgetPassed: boolean,
 *   budgetCheck: object|null,
 *   attemptsUsed: number,
 *   raw: object,
 * }>}
 */
async function planTrip({
  name = '',
  destination,
  startDate,
  endDate,
  maxBudget,
  description = '',
  interests = '',
  includeExpenses = true,
  maxAttempts,
}) {
  if (!destination || !String(destination).trim()) {
    throw new Error('destination is required for AI trip planning');
  }

  const payload = {
    name: name || '',
    destination: String(destination).trim(),
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(endDate),
    maxBudget: Number(maxBudget),
    description: description || '',
    interests: interests || '',
    includeExpenses: includeExpenses !== false,
  };
  if (maxAttempts != null) {
    payload.maxAttempts = maxAttempts;
  }

  const url = `${aiServiceBaseUrl()}/plan-trip`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(process.env.AI_SERVICE_TIMEOUT_MS || 180000)),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out' : err.message;
    throw new Error(
      `AI service unreachable at ${url} (${reason}). Is ai-service running?`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`AI service returned non-JSON (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const detail = data.detail || data.error || data.message || `HTTP ${response.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  const itineraryDays = Array.isArray(data.itinerary) ? data.itinerary : [];
  const expenseItems = Array.isArray(data.expenses) ? data.expenses : [];
  if (!itineraryDays.length) {
    throw new Error('AI service returned an empty itinerary');
  }

  return {
    itinerary: JSON.stringify(itineraryDays),
    expenses: JSON.stringify(expenseItems),
    toolCallTrace: Array.isArray(data.tool_call_trace) ? data.tool_call_trace : [],
    budgetPassed: Boolean(data.budget_passed),
    budgetCheck: data.budget_check || null,
    attemptsUsed: data.attempts_used ?? null,
    raw: data,
  };
}

module.exports = {
  planTrip,
  aiServiceBaseUrl,
  toIsoDate,
};
