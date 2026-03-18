from __future__ import annotations

from pydantic import model_validator
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
    cookie_samesite: str = "strict"  # "lax" | "strict" | "none"

    frontend_origin: str = "http://localhost:3000"

    registration_enabled: bool = True

    turnstile_secret_key: str = "1x0000000000000000000000000000000AA"
    turnstile_enabled: bool = True

    trusted_proxy_cidrs: list[str] = []  # e.g. ["10.0.0.0/8", "172.16.0.0/12"]

    @model_validator(mode="after")
    def _production_cookie_defaults(self) -> "Settings":
        """Force secure cookies outside of dev to prevent accidental misconfiguration."""
        if self.nodebyte_env != "dev" and not self.cookie_secure:
            self.cookie_secure = True
        return self


settings = Settings()

