"""Gemini native function-calling (tool use) helpers."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def mcp_tool_to_gemini_declaration(tool: Any) -> dict[str, Any]:
    """Convert an MCP Tool object to a Gemini functionDeclaration."""
    schema = getattr(tool, "inputSchema", None) or getattr(tool, "input_schema", None) or {}
    if hasattr(schema, "model_dump"):
        schema = schema.model_dump(by_alias=True, exclude_none=True)
    elif hasattr(schema, "dict"):
        schema = schema.dict()
    if not isinstance(schema, dict):
        schema = {"type": "object", "properties": {}}

    # Gemini wants JSON Schema-ish parameters; strip $schema / additional junk if present
    parameters = {
        "type": schema.get("type") or "object",
        "properties": schema.get("properties") or {},
    }
    if schema.get("required"):
        parameters["required"] = schema["required"]

    return {
        "name": tool.name,
        "description": tool.description or tool.name,
        "parameters": parameters,
    }


async def gemini_generate_with_tools(
    *,
    contents: list[dict[str, Any]],
    function_declarations: list[dict[str, Any]],
    system_instruction: str,
) -> dict[str, Any]:
    """
    Call Gemini generateContent with functionDeclarations.
    Returns { text?, function_calls: [{name, args}], raw_model_parts }.
    """
    api_key = settings.gemini_api_key or settings.require_gemini()
    last_error = "Gemini tool-calling request failed"
    body = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
        "tools": [{"functionDeclarations": function_declarations}],
        "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
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
                    json=body,
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
                    logger.warning("Gemini tools %s failed: %s", model, last_error)
                    continue

                candidate = (payload.get("candidates") or [{}])[0]
                parts = ((candidate.get("content") or {}).get("parts")) or []
                text_bits: list[str] = []
                function_calls: list[dict[str, Any]] = []
                for part in parts:
                    if part.get("text"):
                        text_bits.append(part["text"])
                    fc = part.get("functionCall") or part.get("function_call")
                    if fc:
                        args = fc.get("args") or fc.get("arguments") or {}
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except json.JSONDecodeError:
                                args = {}
                        function_calls.append(
                            {"name": fc.get("name"), "args": args or {}}
                        )

                return {
                    "model": model,
                    "text": "\n".join(text_bits).strip(),
                    "function_calls": function_calls,
                    "raw_model_parts": parts,
                }
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                logger.warning("Gemini tools error (%s): %s", model, last_error)

    raise RuntimeError(last_error)
