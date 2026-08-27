"""Multi-provider LLM JSON calls (Gemini + Groq fallback)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def extract_json_array(text: str) -> list[Any]:
    if not text or not isinstance(text, str):
        raise ValueError("Empty LLM response")

    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    first = None
    for i, ch in enumerate(cleaned):
        if ch in "[{":
            first = i
            break
    last = max(cleaned.rfind("]"), cleaned.rfind("}"))
    if first is not None and last > first:
        cleaned = cleaned[first : last + 1]

    parsed = json.loads(cleaned)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("itinerary", "sections", "expenses", "items", "days", "swaps", "data", "result"):
            if isinstance(parsed.get(key), list):
                return parsed[key]
        # Groq json_object mode sometimes wraps a single array under a generic key
        for value in parsed.values():
            if isinstance(value, list):
                return value
    raise ValueError("LLM response was not a JSON array")


async def _call_gemini_json(client: httpx.AsyncClient, prompt: str) -> list[Any]:
    api_key = settings.gemini_api_key
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    last_error = "Gemini request failed"
    for version, model in settings.gemini_models:
        url = (
            f"https://generativelanguage.googleapis.com/{version}/models/"
            f"{model}:generateContent"
        )
        try:
            response = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
                },
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json"},
                },
            )
            payload = response.json()
            if response.status_code == 429:
                last_error = f"Gemini {model} rate-limited (429)"
                logger.warning(last_error)
                continue
            if not response.is_success or payload.get("error"):
                last_error = (
                    (payload.get("error") or {}).get("message")
                    or f"Gemini HTTP {response.status_code}"
                )
                logger.warning("Gemini %s failed: %s", model, last_error)
                continue

            parts = (
                ((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts")
                or []
            )
            text = "\n".join(part.get("text") or "" for part in parts)
            if not text.strip():
                last_error = f"Gemini {model} returned an empty response"
                continue
            return extract_json_array(text)
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            logger.warning("Gemini %s error: %s", model, last_error)

    raise RuntimeError(last_error)


async def _call_groq_json(client: httpx.AsyncClient, prompt: str, model: str | None = None) -> list[Any]:
    api_key = settings.groq_api_key
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    model_name = model or settings.groq_model
    # Groq OpenAI-compatible chat completions
    response = await client.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model_name,
            "temperature": 0.4,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a careful travel-planning assistant. "
                        "Reply with valid JSON only. Prefer a JSON array when asked for a list."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            # Helps some Groq models; ignored/unsupported models may error — we retry without it.
            "response_format": {"type": "json_object"},
        },
    )

    if response.status_code >= 400:
        # Retry without response_format for models that don't support it (e.g. some smaller ones).
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model_name,
                "temperature": 0.4,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a careful travel-planning assistant. "
                            "Reply with valid JSON only (a JSON array when asked for a list)."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            },
        )

    payload = response.json()
    if not response.is_success or payload.get("error"):
        err = (payload.get("error") or {})
        msg = err.get("message") if isinstance(err, dict) else str(err)
        raise RuntimeError(msg or f"Groq HTTP {response.status_code}")

    text = (
        ((payload.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    )
    if not text.strip():
        raise RuntimeError(f"Groq {model_name} returned an empty response")
    return extract_json_array(text)


async def call_llm_json(prompt: str) -> list[Any]:
    """
    Call configured LLM provider(s) and parse a JSON array.

    LLM_PROVIDER:
      - gemini: Gemini only
      - groq: Groq only
      - auto (default): Gemini first, then Groq if Gemini fails / rate-limits
    """
    provider = (settings.llm_provider or "auto").lower()
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=90.0) as client:
        if provider in ("gemini", "auto") and settings.gemini_api_key:
            try:
                return await _call_gemini_json(client, prompt)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"gemini: {exc}")
                logger.warning("Gemini path failed: %s", exc)
                if provider == "gemini":
                    raise

        if provider in ("groq", "auto") and settings.groq_api_key:
            try:
                result = await _call_groq_json(client, prompt)
                logger.info("Used Groq model %s", settings.groq_model)
                return result
            except Exception as exc:  # noqa: BLE001
                errors.append(f"groq: {exc}")
                logger.warning("Groq path failed: %s", exc)
                if provider == "groq":
                    raise

        # Explicit provider with missing key
        if provider == "groq" and not settings.groq_api_key:
            raise RuntimeError("LLM_PROVIDER=groq but GROQ_API_KEY is not set")
        if provider == "gemini" and not settings.gemini_api_key:
            raise RuntimeError("LLM_PROVIDER=gemini but GEMINI_API_KEY is not set")

    raise RuntimeError(
        "All LLM providers failed. "
        + (" | ".join(errors) if errors else "Configure GEMINI_API_KEY and/or GROQ_API_KEY.")
    )


# Back-compat alias used by older imports
call_gemini_json = call_llm_json
