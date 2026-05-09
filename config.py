import logging
import os
from dataclasses import dataclass, field
try:
    from dotenv import load_dotenv  # type: ignore
except ImportError:  # pragma: no cover
    load_dotenv = None  # type: ignore[assignment]

if load_dotenv is not None:
    load_dotenv()


@dataclass
class AppConfig:
    # Nokia Network as Code (RapidAPI) — required for all network signals
    RAPIDAPI_KEY: str = field(default_factory=lambda: os.getenv("RAPIDAPI_KEY", os.getenv("CAMARA_API_KEY", "")).strip())
    RAPIDAPI_HOST: str = field(
        default_factory=lambda: os.getenv("RAPIDAPI_HOST", "network-as-code.nokia.rapidapi.com").strip()
    )
    RAPIDAPI_BASE_URL: str = field(
        default_factory=lambda: os.getenv("RAPIDAPI_BASE_URL", "https://network-as-code.p-eu.rapidapi.com").strip()
    )
    NAC_TIMEOUT_SECONDS: int = int(os.getenv("NAC_TIMEOUT_SECONDS", "12"))

    # Legacy env names (optional fallback for RAPIDAPI_KEY only)
    CAMARA_BASE_URL: str = field(default_factory=lambda: os.getenv("CAMARA_BASE_URL", "https://api.example.com"))
    CAMARA_API_KEY: str = field(default_factory=lambda: os.getenv("CAMARA_API_KEY", "changeme"))

    DATABASE_URL: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///netiq.db"))
    DEBUG: bool = field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")
    PORT: int = int(os.getenv("PORT", "8080"))
    LOG_LEVEL: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    CACHE_TTL_SECONDS: int = int(os.getenv("CACHE_TTL_SECONDS", "60"))

    POLICY_VERSION: str = field(default_factory=lambda: os.getenv("POLICY_VERSION", "1.1.0-hackathon"))
    OPENAI_API_KEY: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", "").strip())
    OPENAI_MODEL: str = field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4o-mini"))

    # Shared demo portal user (demo@netiq.local) — disable for strict auth-only deployments.
    DEMO_OPEN_LOGIN: bool = field(default_factory=lambda: os.getenv("DEMO_OPEN_LOGIN", "true").lower() == "true")
    # When true: session cookie SameSite=None; Secure — needed for UI on another origin (e.g. Vercel + Render).
    SESSION_CROSS_SITE: bool = field(default_factory=lambda: os.getenv("SESSION_CROSS_SITE", "false").lower() == "true")

    # Portal / API security
    SECRET_KEY: str = field(default_factory=lambda: os.getenv("SECRET_KEY", "dev-only-change-me-in-production").strip())
    REQUIRE_API_KEY: bool = field(default_factory=lambda: os.getenv("REQUIRE_API_KEY", "false").lower() == "true")
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))
    PUBLIC_RATE_LIMIT_PER_HOUR: int = int(os.getenv("PUBLIC_RATE_LIMIT_PER_HOUR", "20"))
    NAC_RETRY_ATTEMPTS: int = int(os.getenv("NAC_RETRY_ATTEMPTS", "2"))
    # When unset, allow local Next.js dev. Set explicitly in production (comma-separated).
    # Use CORS_ORIGINS= (empty) to disable cross-origin headers.
    CORS_ORIGINS: str = field(
        default_factory=lambda: (
            os.getenv("CORS_ORIGINS").strip()
            if os.getenv("CORS_ORIGINS") is not None
            else "http://localhost:3000"
        )
    )


def configure_logging() -> None:
    log_level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )
