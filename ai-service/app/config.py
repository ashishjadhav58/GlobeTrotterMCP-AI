"""Environment configuration for the AI service."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load ai-service/.env, then fall back to backend/.env for shared keys.
_AI_ROOT = Path(__file__).resolve().parent.parent
_BACKEND_ENV = _AI_ROOT.parent / "backend" / ".env"

load_dotenv(_AI_ROOT / ".env")
if _BACKEND_ENV.exists():
    load_dotenv(_BACKEND_ENV, override=False)


def _require(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not configured. Set it in ai-service/.env or backend/.env.")
    return value


class Settings:
    gemini_api_key: str
    groq_api_key: str
    groq_model: str
    groq_rewrite_model: str
    llm_provider: str
    database_url: str | None
    node_backend_url: str
    public_ai_base_url: str
    frontend_base_url: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_pass: str
    port: int
    gemini_models: list[tuple[str, str]]
    max_replan_attempts: int

    def __init__(self) -> None:
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
        self.groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
        self.groq_rewrite_model = os.getenv(
            "GROQ_REWRITE_MODEL",
            self.groq_model,
        ).strip()
        # gemini | groq | auto (Gemini first, Groq on failure / rate-limit)
        self.llm_provider = os.getenv("LLM_PROVIDER", "auto").strip().lower() or "auto"
        self.database_url = os.getenv("DATABASE_URL", "").strip() or None
        self.node_backend_url = os.getenv("NODE_BACKEND_URL", "http://127.0.0.1:5000").rstrip("/")
        self.port = int(os.getenv("AI_SERVICE_PORT", "8000"))
        self.public_ai_base_url = os.getenv(
            "PUBLIC_AI_BASE_URL",
            f"http://127.0.0.1:{self.port}",
        ).rstrip("/")
        self.frontend_base_url = os.getenv("FRONTEND_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
        self.smtp_host = os.getenv("SMTP_HOST", "").strip()
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "").strip()
        self.smtp_pass = os.getenv("SMTP_PASS", "").strip().strip('"')
        self.max_replan_attempts = int(os.getenv("MAX_REPLAN_ATTEMPTS", "3"))
        # Prefer flash first to reduce 429s on pro-preview quotas
        primary = os.getenv("GEMINI_MODEL_PRIMARY", "gemini-3.1-flash-lite")
        fallback = os.getenv("GEMINI_MODEL_FALLBACK", "gemini-3.1-pro-preview")
        self.gemini_models = [
            ("v1beta", primary),
            ("v1beta", fallback),
        ]

    def require_gemini(self) -> str:
        if not self.gemini_api_key:
            return _require("GEMINI_API_KEY")
        return self.gemini_api_key

    def require_database_url(self) -> str:
        if not self.database_url:
            return _require("DATABASE_URL")
        return self.database_url


settings = Settings()
