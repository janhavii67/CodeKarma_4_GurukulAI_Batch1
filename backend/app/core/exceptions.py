from typing import Any, Optional


class AppError(Exception):
    """Base application exception."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class UnauthenticatedError(AppError):
    def __init__(
        self,
        code: str = "unauthenticated",
        message: str = "Authentication required or invalid session.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=401, details=details)


class ForbiddenError(AppError):
    def __init__(
        self,
        code: str = "forbidden",
        message: str = "You do not have permission to perform this action.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=403, details=details)


class CSRFError(ForbiddenError):
    def __init__(
        self,
        code: str = "csrf_failed",
        message: str = "CSRF verification failed. Missing or mismatched X-CSRF-Token.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, details=details)


class NotFoundError(AppError):
    def __init__(
        self,
        code: str = "not_found",
        message: str = "The requested resource was not found.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=404, details=details)


class InvalidStateError(AppError):
    def __init__(
        self,
        code: str = "invalid_state",
        message: str = "The operation cannot be completed due to the current resource state.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=409, details=details)


class ConflictError(AppError):
    def __init__(
        self,
        code: str = "conflict",
        message: str = "A resource conflict occurred.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=409, details=details)


class ValidationError(AppError):
    def __init__(
        self,
        code: str = "validation_error",
        message: str = "Validation failed for the supplied input.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=422, details=details)


class PayloadTooLargeError(AppError):
    def __init__(
        self,
        code: str = "payload_too_large",
        message: str = "The uploaded file exceeds the maximum allowed size limit.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=413, details=details)


class UnsupportedMediaTypeError(AppError):
    def __init__(
        self,
        code: str = "unsupported_media_type",
        message: str = "The supplied media type or file format is not supported.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=415, details=details)


class RangeNotSatisfiableError(AppError):
    def __init__(
        self,
        code: str = "range_not_satisfiable",
        message: str = "The requested range cannot be satisfied.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=416, details=details)


class SelfReviewForbiddenError(ForbiddenError):
    def __init__(
        self,
        code: str = "self_review_forbidden",
        message: str = "Authors are strictly forbidden from approving or reviewing their own knowledge versions.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, details=details)


class OpenVersionExistsError(AppError):
    def __init__(
        self,
        code: str = "open_version_exists",
        message: str = "An open version already exists for this knowledge item.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=409, details=details)


class NoBaseVersionError(AppError):
    def __init__(
        self,
        code: str = "no_base_version",
        message: str = "No valid base version found for creating a revision.",
        details: Optional[Any] = None,
    ):
        super().__init__(code=code, message=message, status_code=409, details=details)
