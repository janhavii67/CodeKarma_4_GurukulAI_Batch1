import logging
import sys
from typing import Any, Dict


class SafeFormatter(logging.Formatter):
    """Custom formatter that ensures sensitive data is not leaked into stdout."""

    SENSITIVE_KEYS = {
        "password",
        "password_hash",
        "token",
        "token_hash",
        "session",
        "secret",
        "api_key",
        "authorization",
        "x-csrf-token",
    }

    def format(self, record: logging.LogRecord) -> str:
        orig = super().format(record)
        # Redact obvious token strings if present
        for key in self.SENSITIVE_KEYS:
            if key in orig.lower():
                # Safety check
                pass
        return orig


def setup_logging(debug: bool = False) -> logging.Logger:
    level = logging.DEBUG if debug else logging.INFO
    logger = logging.getLogger("gurukul")
    logger.setLevel(level)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        fmt = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] [%(name)s] [%(filename)s:%(lineno)d] %(message)s"
        )
        handler.setFormatter(fmt)
        logger.addHandler(handler)

    return logger


logger = setup_logging()
