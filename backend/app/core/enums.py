from enum import Enum


class VersionStatus(str, Enum):
    draft = "draft"
    in_review = "in_review"
    changes_requested = "changes_requested"
    rejected = "rejected"
    approved = "approved"  # reserved, unused
    published = "published"
    superseded = "superseded"
    withdrawn = "withdrawn"


class VersionOrigin(str, Enum):
    expert = "expert"
    ai_draft = "ai_draft"
    ai_draft_edited = "ai_draft_edited"


class ReviewDecision(str, Enum):
    approved = "approved"
    changes_requested = "changes_requested"
    rejected = "rejected"
    withdrawn = "withdrawn"


class Action(str, Enum):
    EDIT = "edit"
    SUBMIT = "submit"
    APPROVE = "approve"
    REQUEST_CHANGES = "request_changes"
    REJECT = "reject"
    WITHDRAW = "withdraw"
    CREATE_REVISION = "create_revision"


EDITABLE_STATUSES = frozenset({VersionStatus.draft, VersionStatus.changes_requested})
OPEN_STATUSES = frozenset({VersionStatus.draft, VersionStatus.changes_requested, VersionStatus.in_review})
FROZEN_STATUSES = frozenset({
    VersionStatus.in_review,
    VersionStatus.published,
    VersionStatus.superseded,
    VersionStatus.withdrawn,
    VersionStatus.rejected,
})
