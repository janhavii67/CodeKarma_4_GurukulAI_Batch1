"""
AI Knowledge Assistant (Module 02) Endpoint Tests.
Directly accessible under app/tests/test_assistant.py.
"""
from app.modules.assistant.tests.test_assistant_api import (
    test_unauthenticated_requests_return_401,
    test_conversation_ownership_isolation_returns_404,
    test_insufficient_evidence_path,
    test_draft_and_withdrawn_knowledge_never_cited,
    test_feedback_saved_successfully,
    test_conversation_lifecycle_and_delete,
    test_streaming_sse_endpoint,
    test_csrf_protection_on_mutating_endpoints,
)

__all__ = [
    "test_unauthenticated_requests_return_401",
    "test_conversation_ownership_isolation_returns_404",
    "test_insufficient_evidence_path",
    "test_draft_and_withdrawn_knowledge_never_cited",
    "test_feedback_saved_successfully",
    "test_conversation_lifecycle_and_delete",
    "test_streaming_sse_endpoint",
    "test_csrf_protection_on_mutating_endpoints",
]
