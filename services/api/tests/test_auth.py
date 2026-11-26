"""Backend authentication tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.models.auth_session import AuthSession
from app.models.user import User


def test_successful_registration(client: TestClient, register_user: Any) -> None:
    """Registration creates user, org, owner membership, returns access token and sets cookie."""
    result = register_user()
    res = result["response"]
    assert res.status_code == 201
    data = result["data"]

    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["name"] == "Alice Analyst"
    assert "datasense_refresh_token" in res.cookies


def test_duplicate_email_rejection(client: TestClient, register_user: Any) -> None:
    """Duplicate email addresses are rejected with 409 Conflict."""
    res1 = register_user(email="duplicate@example.com")["response"]
    assert res1.status_code == 201

    res2 = register_user(email="duplicate@example.com")["response"]
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"]


def test_invalid_registration_fields(client: TestClient) -> None:
    """Invalid emails or short passwords fail validation."""
    # Invalid email
    res1 = client.post(
        "/api/v1/auth/register",
        json={"name": "Bob", "email": "not-an-email", "password": "Short1", "organization_name": "Org"},
    )
    assert res1.status_code == 422

    # Short password (< 8 chars)
    res2 = client.post(
        "/api/v1/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "short", "organization_name": "Org"},
    )
    assert res2.status_code == 422


def test_password_hashing(client: TestClient, register_user: Any, db: Session) -> None:
    """Plaintext passwords are never stored in the database; hashes verify with Argon2."""
    raw_pass = "SuperSecretPassword123!"
    register_user(email="hashed@example.com", password=raw_pass)

    user = db.scalar(select(User).where(User.email == "hashed@example.com"))
    assert user is not None
    assert user.password_hash != raw_pass
    assert user.password_hash.startswith("$argon2")
    assert verify_password(raw_pass, user.password_hash) is True


def test_successful_login(client: TestClient, register_user: Any) -> None:
    """Users can log in with their registered credentials."""
    register_user(email="loginuser@example.com", password="CorrectPassword123!")

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "loginuser@example.com", "password": "CorrectPassword123!"},
    )
    assert login_res.status_code == 200
    data = login_res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "loginuser@example.com"
    assert "datasense_refresh_token" in login_res.cookies


def test_incorrect_password_rejection(client: TestClient, register_user: Any) -> None:
    """Incorrect passwords return 401 Unauthorized."""
    register_user(email="wrongpass@example.com", password="CorrectPassword123!")

    res = client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpass@example.com", "password": "WrongPassword123!"},
    )
    assert res.status_code == 401
    assert "Invalid email or password" in res.json()["detail"]


def test_unauthenticated_access_rejection(client: TestClient) -> None:
    """Endpoints requiring authentication return 401 without Bearer token."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401


def test_access_token_validation(client: TestClient, register_user: Any) -> None:
    """Valid access token allows access to protected endpoints like /api/v1/auth/me."""
    reg = register_user(email="authed@example.com")
    token = reg["data"]["access_token"]

    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == "authed@example.com"
    assert data["current_organization"]["role"] == "owner"


def test_refresh_token_rotation(client: TestClient, register_user: Any) -> None:
    """Calling /refresh rotates the token and returns a new valid access token."""
    reg_res = register_user(email="refreshtest@example.com")["response"]
    old_cookie = reg_res.cookies.get("datasense_refresh_token")
    assert old_cookie is not None

    refresh_res = client.post(
        "/api/v1/auth/refresh",
        cookies={"datasense_refresh_token": old_cookie},
    )
    assert refresh_res.status_code == 200
    data = refresh_res.json()
    assert "access_token" in data

    new_cookie = refresh_res.cookies.get("datasense_refresh_token")
    assert new_cookie is not None
    assert new_cookie != old_cookie


def test_refresh_token_reuse_rejection(client: TestClient, register_user: Any) -> None:
    """Reusing an already rotated refresh token is rejected."""
    reg_res = register_user(email="reusetest@example.com")["response"]
    old_cookie = reg_res.cookies.get("datasense_refresh_token")

    # First refresh: succeeds
    client.post("/api/v1/auth/refresh", cookies={"datasense_refresh_token": old_cookie})

    # Second refresh with same old token: fails
    reuse_res = client.post("/api/v1/auth/refresh", cookies={"datasense_refresh_token": old_cookie})
    assert reuse_res.status_code == 401


def test_logout_and_session_revocation(client: TestClient, register_user: Any, db: Session) -> None:
    """Logout revokes the session in the database and clears the refresh cookie."""
    reg_res = register_user(email="logoutuser@example.com")["response"]
    refresh_token = reg_res.cookies.get("datasense_refresh_token")

    logout_res = client.post(
        "/api/v1/auth/logout",
        cookies={"datasense_refresh_token": refresh_token},
    )
    assert logout_res.status_code == 200

    # Cookie cleared
    assert logout_res.cookies.get("datasense_refresh_token") in (None, "", '""')

    # Subsequent refresh fails
    attempt = client.post(
        "/api/v1/auth/refresh",
        cookies={"datasense_refresh_token": refresh_token},
    )
    assert attempt.status_code == 401


def test_expired_session_rejection(client: TestClient, register_user: Any, db: Session) -> None:
    """Expired sessions are rejected upon refresh."""
    reg_res = register_user(email="expireduser@example.com")["response"]
    refresh_cookie = reg_res.cookies.get("datasense_refresh_token")

    # Manually expire the session in DB
    sessions = db.scalars(select(AuthSession)).all()
    for s in sessions:
        s.expires_at = datetime.now(UTC) - timedelta(days=1)
    db.commit()

    res = client.post(
        "/api/v1/auth/refresh",
        cookies={"datasense_refresh_token": refresh_cookie},
    )
    assert res.status_code == 401


def test_get_and_update_profile(client: TestClient, register_user: Any) -> None:
    """User can view and update their profile details."""
    token = register_user(email="profileuser@example.com")["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    update_res = client.patch(
        "/api/v1/auth/me",
        json={"name": "Alice Updated", "avatar_url": "https://example.com/avatar.png"},
        headers=headers,
    )
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["name"] == "Alice Updated"
    assert data["avatar_url"] == "https://example.com/avatar.png"
