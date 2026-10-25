# Gurukul AI — Security Architecture & Hardening Guide

## 1. Authentication & Session Management
- **Password Hashing**: Uses modern **Argon2id** (`time_cost=3`, `memory_cost=65536`, `parallelism=4`).
- **Session Tokens**: 256-bit cryptographically secure pseudorandom tokens (`secrets.token_urlsafe(32)`).
- **Token Hashing**: Tokens are never stored in plaintext in the database. Only SHA-256 hashes of tokens are persisted.
- **Session Invalidation**:
  - **Idle Timeout**: 30 minutes of inactivity revokes the session.
  - **Absolute Timeout**: 8 hours maximum session lifetime.
- **Cookie Security**:
  - `HttpOnly`: Session cookie is inaccessible to browser JavaScript.
  - `SameSite=Lax`: Defends against Cross-Site Request Forgery.
  - `Secure`: Configured to `True` in production HTTPS environments.

---

## 2. CSRF Double-Submit Protection
For all state-changing HTTP write operations (`POST`, `PUT`, `PATCH`, `DELETE`):
- The client must include an `X-CSRF-Token` header.
- The server validates that the header exactly matches the non-HttpOnly `gk_csrf` cookie.
- Mismatched or missing tokens trigger a `403 csrf_failed` error.

---

## 3. Strict Peer Review Governance Invariant
- **Rule**: An author can **never** approve their own submission (`403 self_review_forbidden`).
- **Boundary**: Enforced at the FastAPI route dependency and database transaction boundary, preventing malicious or accidental self-promotion of safety-critical procedures.

---

## 4. Production Hardening Checklist
- [ ] Set `COOKIE_SECURE=true` and enforce HTTPS TLS 1.3.
- [ ] Generate a production session secret: `python -c "import secrets; print(secrets.token_hex(32))"`.
- [ ] Restrict `CORS_ORIGINS` to trusted enterprise domain names.
- [ ] Migrate SQLite to hardened PostgreSQL container with encrypted volume storage.
- [ ] Implement rate limiting on `/api/v1/auth/login` to prevent brute force attempts.
- [ ] Store uploaded media assets in an air-gapped private S3/object store with pre-signed URLs.
