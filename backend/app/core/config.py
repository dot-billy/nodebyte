from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    nodebyte_env: str = "dev"

    database_url: str

    jwt_secret: str
    jwt_issuer: str = "nodebyte"
    access_token_expires_minutes: int = 15
    refresh_token_expires_days: int = 30

    cookie_secure: bool = False
    cookie_samesite: str = "lax"  # "lax" | "strict" | "none"

    frontend_origin: str = "http://localhost:3000"

    registration_enabled: bool = True

    turnstile_secret_key: str = "1x0000000000000000000000000000000AA"
    turnstile_enabled: bool = True


settings = Settings()

