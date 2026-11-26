"""Authentication API routes: register, login, refresh, logout, and me."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import rate_limit_dep
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    generate_slug,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.core.security_middleware import verify_cookie_csrf
from app.db.session import get_db
from app.models.auth_session import AuthSession
from app.models.membership import Membership, MembershipRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.auth import (
    AuthMeResponse,
    CurrentMembership,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import UserProfile, UserRead, UserUpdate

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    """Helper to set secure HttpOnly refresh token cookie."""
    max_age = settings.refresh_token_expire_days * 24 * 60 * 60
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=raw_token,
        max_age=max_age,
        expires=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Helper to clear refresh token cookie upon logout."""
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/api/v1/auth",
    )


def _create_session_and_tokens(
    user: User,
    db: Session,
    response: Response,
) -> TokenResponse:
    """Create a new refresh session, set cookie, and return access token."""
    raw_refresh = generate_refresh_token()
    token_hash = hash_refresh_token(raw_refresh)
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)

    auth_session = AuthSession(
        user_id=user.id,
        refresh_token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(auth_session)
    db.commit()

    _set_refresh_cookie(response, raw_refresh)

    access_token = create_access_token(
        subject=str(user.id),
        claims={"name": user.name, "email": user.email},
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserRead.model_validate(user),
    )


def cleanup_expired_auth_sessions(db: Session) -> int:
    """Purge expired or long-revoked refresh sessions to keep auth_sessions bounded."""
    now = datetime.now(UTC)
    result = db.execute(delete(AuthSession).where(AuthSession.expires_at < now))
    db.commit()
    return int(result.rowcount or 0)


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register new user and organization",
    dependencies=[Depends(rate_limit_dep("auth_register", "rate_limit_auth_per_minute"))],
)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    """Atomically register a new user, create their initial organization, and grant owner membership."""
    normalized_email = payload.email.strip().lower()

    # Check email uniqueness
    existing_user = db.scalar(select(User).where(User.email == normalized_email))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Begin atomic registration
    try:
        user = User(
            name=payload.name.strip(),
            email=normalized_email,
            password_hash=hash_password(payload.password),
        )
        db.add(user)
        db.flush()  # Generate user.id

        # Generate unique organization slug
        base_slug = generate_slug(payload.organization_name)
        slug = base_slug
        counter = 1
        while db.scalar(select(Organization).where(Organization.slug == slug)):
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization(
            name=payload.organization_name.strip(),
            slug=slug,
            owner_id=user.id,
        )
        db.add(org)
        db.flush()  # Generate org.id

        membership = Membership(
            organization_id=org.id,
            user_id=user.id,
            role=MembershipRole.OWNER,
        )
        db.add(membership)
        db.flush()

        return _create_session_and_tokens(user, db, response)

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflict creating user or organization workspace",
        ) from exc
    except OperationalError:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Unexpected error during user registration: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete registration",
        ) from exc


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user",
    dependencies=[Depends(rate_limit_dep("auth_login", "rate_limit_auth_per_minute"))],
)
def login(
    payload: LoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    """Validate credentials and issue access token and refresh cookie."""
    normalized_email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email))

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    return _create_session_and_tokens(user, db, response)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Rotate refresh token and issue new access token",
    dependencies=[Depends(rate_limit_dep("auth_refresh", "rate_limit_auth_per_minute"))],
)
def refresh_session(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    datasense_refresh_token: Annotated[str | None, Cookie()] = None,
) -> TokenResponse:
    """Rotate refresh session from HttpOnly cookie and issue fresh access token."""
    verify_cookie_csrf(request)
    if not datasense_refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token cookie missing",
        )

    token_hash = hash_refresh_token(datasense_refresh_token)
    auth_session = db.scalar(select(AuthSession).where(AuthSession.refresh_token_hash == token_hash))

    if auth_session and auth_session.revoked_at is not None:
        # Refresh-token reuse detected: revoke all active sessions for this user immediately
        now = datetime.now(UTC)
        active_sessions = db.scalars(
            select(AuthSession).where(
                AuthSession.user_id == auth_session.user_id,
                AuthSession.revoked_at.is_(None),
            )
        ).all()
        for active in active_sessions:
            active.revoked_at = now
        db.commit()
        logger.warning("Refresh token reuse detected for user_id=%s; revoked session family", auth_session.user_id)
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please log in again.",
        )

    if not auth_session or not auth_session.is_valid:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please log in again.",
        )

    user = db.scalar(select(User).where(User.id == auth_session.user_id))
    if not user or not user.is_active:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer active",
        )

    # Token rotation: revoke current session
    auth_session.revoked_at = datetime.now(UTC)

    # Issue new session and token
    return _create_session_and_tokens(user, db, response)


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Revoke session and clear refresh cookie",
)
def logout(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    datasense_refresh_token: Annotated[str | None, Cookie()] = None,
) -> dict[str, str]:
    """Revoke the current refresh session and clear cookie."""
    verify_cookie_csrf(request)
    if datasense_refresh_token:
        token_hash = hash_refresh_token(datasense_refresh_token)
        session = db.scalar(select(AuthSession).where(AuthSession.refresh_token_hash == token_hash))
        if session and session.revoked_at is None:
            session.revoked_at = datetime.now(UTC)
            db.commit()

    _clear_refresh_cookie(response)
    return {"message": "Logged out successfully"}


@router.get(
    "/me",
    response_model=AuthMeResponse,
    summary="Current authenticated user profile and memberships",
)
def get_me(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AuthMeResponse:
    """Return user info and their organizations."""
    stmt = (
        select(Membership, Organization)
        .join(Organization, Membership.organization_id == Organization.id)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at.asc())
    )
    memberships = db.execute(stmt).all()

    org_list = [
        CurrentMembership(
            organization_id=org.id,
            organization_name=org.name,
            organization_slug=org.slug,
            role=mem.role.value,
        )
        for mem, org in memberships
    ]

    current_org = org_list[0] if org_list else None

    return AuthMeResponse(
        user=UserRead.model_validate(user),
        current_organization=current_org,
        organizations=org_list,
    )


@router.patch(
    "/me",
    response_model=UserProfile,
    summary="Update current user profile",
)
def update_profile(
    payload: UserUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserProfile:
    """Update profile details of the authenticated user."""
    if payload.name is not None:
        user.name = payload.name.strip()
    if payload.avatar_url is not None:
        user.avatar_url = payload.avatar_url.strip() or None

    user.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(user)
    return UserProfile.model_validate(user)
