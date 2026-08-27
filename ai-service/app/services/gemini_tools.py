"""Gemini native function-calling (tool use) helpers."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _sanitize_schema(node: Any) -> Any:
    """Strip JSON Schema fields Gemini functionDeclarations reject."""
    if isinstance(node, list):
        return [_sanitize_schema(x) for x in node]
    if not isinstance(node, dict):
        return node

    # Prefer first branch of unions Gemini doesn't support well
    if "anyOf" in node or "oneOf" in node:
        branches = node.get("anyOf") or node.get("oneOf") or []
        # Prefer object/array/string in that order
        preferred = None
        for b in branches:
            if isinstance(b, dict) and b.get("type") in ("object", "array", "string", "number", "integer", "boolean"):
                preferred = b
                if b.get("type") == "object":
                    break
        chosen = _sanitize_schema(preferred or (branches[0] if branches else {"type": "string"}))
        if isinstance(chosen, dict):
            # keep description from parent if present
            if node.get("description") and not chosen.get("description"):
                chosen = {**chosen, "description": node["description"]}
        return chosen

    out: dict[str, Any] = {}
    allowed = {
        "type",
        "description",
        "properties",
        "required",
        "items",
        "enum",
        "format",
        "nullable",
    }
    for key, value in node.items():
        if key in ("additionalProperties", "$schema", "$defs", "definitions", "title", "default"):
            continue
        if key not in allowed and key not in ("properties", "items"):
            # drop unknown keys like exclusiveMinimum etc.
            if key not in ("minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"):
                continue
        if key == "properties" and isinstance(value, dict):
            out[key] = {k: _sanitize_schema(v) for k, v in value.items()}
        elif key == "items":
            out[key] = _sanitize_schema(value)
        elif key == "required" and isinstance(value, list):
            out[key] = value
        elif key == "type":
            # Gemini wants a single type string
            if isinstance(value, list):
                non_null = [t for t in value if t != "null"]
                out[key] = non_null[0] if non_null else "string"
                if "null" in value:
                    out["nullable"] = True
            else:
                out[key] = value
        else:
            out[key] = _sanitize_schema(value) if isinstance(value, (dict, list)) else value

    if "type" not in out and "properties" in out:
        out["type"] = "object"
    if out.get("type") == "array" and "items" not in out:
        out["items"] = {"type": "object"}
    return out


def mcp_tool_to_gemini_declaration(tool: Any) -> dict[str, Any]:
    """Convert an MCP Tool object to a Gemini functionDeclaration."""
    schema = getattr(tool, "inputSchema", None) or getattr(tool, "input_schema", None) or {}
    if hasattr(schema, "model_dump"):
        schema = schema.model_dump(by_alias=True, exclude_none=True)
    elif hasattr(schema, "dict"):
        schema = schema.dict()
    if not isinstance(schema, dict):
        schema = {"type": "object", "properties": {}}

    parameters = _sanitize_schema(
        {
            "type": schema.get("type") or "object",
            "properties": schema.get("properties") or {},
            **({"required": schema["required"]} if schema.get("required") else {}),
            **({"description": schema["description"]} if schema.get("description") else {}),
        }
    )
    if not isinstance(parameters, dict):
        parameters = {"type": "object", "properties": {}}
    if parameters.get("type") != "object":
        parameters = {"type": "object", "properties": {"value": parameters}}

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
