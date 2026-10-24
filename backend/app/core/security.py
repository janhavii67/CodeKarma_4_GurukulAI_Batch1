import hashlib
import secrets
from typing import Optional
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

# Argon2id hasher configured per LLD spec: time_cost=3, memory_cost=65536 KiB (64MB), parallelism=4
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hashes a plaintext password using Argon2id."""
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against an Argon2id hash."""
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def generate_session_token() -> str:
    """Generates a raw 32-byte cryptographically secure session token in hex (64 chars)."""
    return secrets.token_hex(32)


def hash_session_token(token: str) -> str:
    """Computes SHA-256 hash of the raw session token for database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_csrf_token() -> str:
    """Generates a 32-byte cryptographically secure CSRF double-submit token."""
    return secrets.token_hex(32)


def mask_secret(value: Optional[str]) -> str:
    """Redacts secrets for secure logging."""
    if not value or len(value) <= 6:
        return "***"
    return f"{value[:3]}...{value[-3:]}"
