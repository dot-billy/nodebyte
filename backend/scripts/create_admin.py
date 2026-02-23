"""Create an admin user and team directly in the database.

Use this when REGISTRATION_ENABLED=false and you need the first user.
Run inside the backend container:

    docker compose exec backend python scripts/create_admin.py

Environment variables (all optional — prompts if missing):
    ADMIN_EMAIL       Email for the admin account
    ADMIN_PASSWORD    Password (min 8 characters)
    ADMIN_TEAM        Team name to create (default: "Default")
"""

from __future__ import annotations

import asyncio
import getpass
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "."))

from sqlalchemy import select

from app.core.slug import slugify
from app.db.session import SessionLocal
from app.models.team import Team
from app.models.user import User
from app.services.teams import create_team_with_owner
from app.services.users import create_user, get_user_by_email


async def main() -> None:
    email = os.environ.get("ADMIN_EMAIL") or input("Email: ").strip()
    if not email:
        print("Error: email is required.")
        sys.exit(1)

    password = os.environ.get("ADMIN_PASSWORD")
    if not password:
        password = getpass.getpass("Password (min 8 chars): ")
    if len(password) < 8:
        print("Error: password must be at least 8 characters.")
        sys.exit(1)

    team_name = os.environ.get("ADMIN_TEAM") or input("Team name [Default]: ").strip() or "Default"

    async with SessionLocal() as db:
        existing = await get_user_by_email(db, email)
        if existing:
            print(f"Error: user {email} already exists.")
            sys.exit(1)

        user = await create_user(db, email=email, password=password, full_name=None)
        user.is_superuser = True
        print(f"Created superuser: {email} (id: {user.id})")

        slug = slugify(team_name)
        res = await db.execute(select(Team.id).where(Team.slug == slug))
        if res.first() is not None:
            slug = f"{slug}-{user.id.hex[:6]}"

        team = await create_team_with_owner(db, name=team_name, slug=slug, owner_user_id=user.id)
        print(f"Created team: {team_name} (slug: {slug})")

        await db.commit()

    print("\nDone! Sign in at your Nodebyte instance with these credentials.")


if __name__ == "__main__":
    asyncio.run(main())
