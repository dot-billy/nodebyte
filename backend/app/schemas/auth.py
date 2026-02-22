from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr | None = None
    password: str = Field(min_length=8, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)
    team_name: str | None = Field(default=None, max_length=120)
    invite_token: str | None = None
    website: str | None = None  # honeypot — must be empty
    cf_turnstile_token: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    website: str | None = None  # honeypot — must be empty
    cf_turnstile_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class MessageResponse(BaseModel):
    message: str

