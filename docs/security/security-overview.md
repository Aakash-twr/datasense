# Security Overview

DataSense applies defense-in-depth across authentication, multi-tenant authorization, SQL/DuckDB sandboxing, AI data privacy, file storage, and HTTP hardening. Reference benchmarks used during engineering audits include OWASP ASVS 5.0 and OWASP API Security Top 10 (used purely as engineering review guides, not formal compliance certification).

---

## Core Security Controls

1. **Authentication & Session Hygiene**
   - Passwords hashed with `Argon2` (`pwdlib`); complexity checks require mixed alphabetic + numeric characters and minimum length `8`.
   - Short-lived HS256 JWT access tokens (`15` min) live strictly in Zustand memory on the browser—never `localStorage`.
   - Refresh tokens use `secrets.token_urlsafe(48)` hashed with SHA-256 in `auth_sessions`, sent as `HttpOnly`, `SameSite=lax` cookies (`COOKIE_SECURE=true` enforced in production).
   - Refresh rotation revokes the previous session; replaying any revoked refresh token revokes the user's active session family.

2. **HTTP & CSRF Defenses**
   - `SecurityHeadersMiddleware` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP (`frame-ancestors 'none'`), and optional HSTS.
   - Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) validate `Origin` / `Referer` against `CORS_ORIGINS` and enforce `X-Requested-With` custom headers in production (`verify_cookie_csrf`).

3. **SQL-Backed Multi-Worker Rate Limiting**
   - `RateLimitService` tracks per-route fixed/sliding buckets inside `rate_limit_buckets` (`auth`, `upload`, `query`, `ai`, `agent`), remaining consistent across multiple API workers without requiring Redis.

4. **Upload & Storage Isolation**
   - Validates extension, MIME/magic bytes (`.xlsx`, `.parquet`, `.json`), ZIP bomb compression bounds, row/column limits (`500,000` rows, `200` columns), and upload size (`25 MB`).
   - `LocalStorageService` normalizes filenames, resolves canonical paths inside `DATA_STORAGE_ROOT`, and explicitly rejects symlinks (`is_symlink()`).

5. **Log & Error Redaction**
   - `RedactingFilter` removes Bearer tokens, Google API key patterns, password tokens, and database connection string passwords from logs and recent error caches.

Deep dives: [SQL Safety](sql-safety.md) · [AI Data Privacy](ai-privacy.md) · [Multi-Tenant Authorization](authorization.md).
