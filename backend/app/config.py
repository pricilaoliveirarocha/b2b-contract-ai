from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://crm:crm@localhost:5432/crm_b2b"
    frontend_origin: str = "http://localhost:5173"
    # Secret that unlocks administrator actions (create/edit/delete rules).
    # Empty means "no admin": those actions are refused until a token is configured.
    admin_token: str = ""
    # Optional: unlocks "generate a rule from plain language" (Claude API). Empty = feature off.
    anthropic_api_key: str = ""
    ai_model: str = "claude-opus-5-5"


@lru_cache
def get_settings() -> Settings:
    return Settings()
