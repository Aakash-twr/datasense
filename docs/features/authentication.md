# Authentication & Workspaces

DataSense provides enterprise multi-tenant workspace onboarding, Argon2 password security, rotating refresh sessions, and modern split-screen sign-in UI.

---

## 1. Endpoints (`services/api/app/api/v1/auth.py`)

| Method & Route | Description |
|---|---|
| `POST /api/v1/auth/register` | Creates `User`, initial `Organization` (unique slug), `OWNER` `Membership`, `AuthSession`, and sets `datasense_refresh_token` HttpOnly cookie. Enforces minimum 8-char letter+digit complexity. |
| `POST /api/v1/auth/login` | Normalizes email, verifies Argon2 password hash, issues 15-min HS256 JWT + rotated HttpOnly refresh cookie. |
| `POST /api/v1/auth/refresh` | Verifies CSRF origin/header, hashes refresh cookie (SHA-256), revokes prior session, rotates new token pair. Re-presenting a revoked token revokes the user's session family. |
| `POST /api/v1/auth/logout` | Revokes active `AuthSession` row and clears cookie. |
| `GET /api/v1/auth/me` | Returns authenticated user profile and organization memberships. |
| `PATCH /api/v1/auth/me` | Updates user display name and avatar URL. |

---

## 2. Frontend UX (`LoginPage.tsx` & `RegisterPage.tsx`)

- **Split-Screen Login (`/login`)**: Architectural deep-navy left brand showcase displaying an illustrative SQL/pipeline preview paired with a light centered sign-in form, inline email/password validation, and password visibility toggle.
- **Session Recovery**: `App.tsx` silently invokes `initAuth()` on mount and redirects unauthenticated navigation cleanly to `/login?expired=1`.
- **Intentional Boundaries**: Non-functional "Forgot Password" or fake SSO buttons are omitted because backend auth strictly supports email/password + organization workspaces.
