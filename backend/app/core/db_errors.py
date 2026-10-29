import logging
from sqlalchemy.exc import DBAPIError, IntegrityError
from app.core.exceptions import (
    AppError,
    ConflictError,
    InvalidStateError,
    OpenVersionExistsError,
)

logger = logging.getLogger("gurukul.db_errors")


def map_db_error(exc: Exception) -> AppError:
    """
    Map lower-level SQLAlchemy / PostgreSQL / SQLite integrity errors and trigger exceptions
    to standard AppErrors without leaking raw SQL strings.
    """
    # Driver/connection/schema failures are not governance conflicts. In
    # particular, an unmigrated column on a local database must not be
    # reported as an integrity constraint violation.
    if isinstance(exc, DBAPIError) and not isinstance(exc, IntegrityError):
        logger.error("Database operation failed (%s)", type(exc).__name__)
        return AppError(
            code="database_unavailable",
            message="The database could not complete this request. Check database connectivity and apply pending migrations.",
            status_code=503,
        )

    err_str = str(exc).lower()

    # Trigger constraint: version content is frozen
    if "version content is frozen" in err_str:
        return InvalidStateError(
            code="invalid_state",
            message="Version content is frozen and cannot be updated once out of editable status.",
        )

    # Trigger constraint: append-only tables
    if "append-only" in err_str or "cannot be modified or deleted" in err_str:
        return InvalidStateError(
            code="invalid_state",
            message="Historical review and approval records are append-only and cannot be modified or deleted.",
        )

    # Unique index: at most one open version per item (PostgreSQL index name or SQLite column failure)
    if "uq_versions_one_open_per_item" in err_str or (
        "unique constraint failed: knowledge_versions.item_id" in err_str
        and any(s in err_str for s in ["draft", "in_review", "changes_requested"])
    ):
        return OpenVersionExistsError(
            code="open_version_exists",
            message="An open version already exists for this knowledge item.",
        )

    # Unique index: at most one published version per item
    if "uq_versions_one_published_per_item" in err_str or (
        "unique constraint failed: knowledge_versions.item_id" in err_str
        and "published" in err_str
    ):
        return ConflictError(
            code="conflict",
            message="A published version already exists for this knowledge item.",
        )

    # Check constraint: ck_approval_comment_required
    if "ck_approval_comment_required" in err_str or "comment_required" in err_str:
        return InvalidStateError(
            code="invalid_state",
            message="Review decisions other than 'approved' require non-empty comments.",
        )

    # Check constraint: ck_versions_status
    if "ck_versions_status" in err_str:
        return InvalidStateError(
            code="invalid_state",
            message="Invalid version status constraint violated.",
        )

    # Fallback for unknown DB integrity errors - generic 409 Conflict without leaking SQL internals
    logger.error(f"Unmapped database integrity error: {exc}")
    return ConflictError(
        code="conflict",
        message="A database integrity constraint or governance invariant was violated.",
    )
