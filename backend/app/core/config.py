from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./gurukul_dev.db"
    TEST_DATABASE_URL: str = "sqlite:///./gurukul_test.db"

    @field_validator("DATABASE_URL", "TEST_DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_url(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith("sqlite:///."):
            rel_path = v[len("sqlite:///"):]
            abs_path = (BACKEND_DIR / rel_path).resolve()
            return f"sqlite:///{abs_path.as_posix()}"
        return v


    # Security & Sessions
    SESSION_SECRET: str = "dev_session_secret_change_me_in_production_998877665544332211"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    IDLE_TIMEOUT_MINUTES: int = 30
    ABSOLUTE_TIMEOUT_HOURS: int = 8

    SESSION_COOKIE_NAME: str = "gk_session"
    CSRF_COOKIE_NAME: str = "gk_csrf"
    CSRF_HEADER_NAME: str = "X-CSRF-Token"

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Storage
    MEDIA_ROOT: str = "./data/media"
    MEDIA_DIR: str = "./data/media"
    MAX_UPLOAD_MB: int = 100
    MAX_UPLOAD_BYTES: int = 100 * 1024 * 1024  # 100 MB default
    MAX_MEDIA_PER_VERSION: int = 20

    # Demo Seed Credentials
    EXPERT_A_EMAIL: str = "expert.a@demo.local"
    EXPERT_A_PASSWORD: str = "ExpertA@Gurukul2026!"
    EXPERT_B_EMAIL: str = "expert.b@demo.local"
    EXPERT_B_PASSWORD: str = "ExpertB@Gurukul2026!"
    TRAINEE_EMAIL: str = "trainee@demo.local"
    TRAINEE_PASSWORD: str = "Trainee@Gurukul2026!"

    # AI & Speech
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-20241022"
    STT_PROVIDER: str = "whisper_api"
    OPENAI_API_KEY: str = ""

    # Module 02 Assistant & RAG Settings
    ASSISTANT_LLM_PROVIDER: str = "fake"
    ALLOW_EXTERNAL_LLM: bool = False
    ASSISTANT_LLM_MODEL: str = "claude-3-5-sonnet-20241022"
    ASSISTANT_LLM_TIMEOUT_S: int = 30
    ASSISTANT_LLM_MAX_RETRIES: int = 2
    ASSISTANT_RETRIEVAL_TOP_K: int = 6
    ASSISTANT_RETRIEVAL_MIN_SCORE: float = 0.05
    ASSISTANT_QUESTION_MAX_CHARS: int = 1000
    ASSISTANT_PROMPT_VERSION: str = "v1"
    RETRIEVAL_MODE: str = "keyword"
    CHAT_RETENTION_DAYS: int = 365
    CHAT_RATE_LIMIT_PER_MINUTE: int = 20

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
