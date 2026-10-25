from dataclasses import dataclass
from typing import Optional, Union, List
from app.core.enums import (
    VersionStatus,
    VersionOrigin,
    Action,
    EDITABLE_STATUSES,
)
from app.core.exceptions import (
    NotFoundError,
    ForbiddenError,
    InvalidStateError,
    SelfReviewForbiddenError,
    OpenVersionExistsError,
    NoBaseVersionError,
)
from app.services.state_machine import is_editable


@dataclass(frozen=True)
class UserCtx:
    id: Union[str, int]
    role: str
    permissions: frozenset[str]


@dataclass(frozen=True)
class VersionCtx:
    id: Union[str, int]
    item_id: Union[str, int]
    status: VersionStatus
    created_by: Union[str, int]
    origin: VersionOrigin = VersionOrigin.expert


@dataclass(frozen=True)
class ItemCtx:
    id: Union[str, int]
    has_open_version: bool
    current_published_version_id: Optional[Union[str, int]] = None


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str


def can_view_version(user: UserCtx, version: VersionCtx, item: ItemCtx) -> bool:
    """
    Evaluate visibility rules for a knowledge version:
    - Author: can view all their own versions.
    - Trainee: can view ONLY the current published version.
    - Reviewer (knowledge.approve): can view every non-draft version.
    - Other Expert: can view published and superseded versions only.
    """
    # 1. Author can see any version they created
    if str(user.id) == str(version.created_by):
        return True

    # 2. Trainee role visibility
    is_trainee = user.role.upper() == "TRAINEE" or (
        "knowledge.approve" not in user.permissions and "knowledge.create" not in user.permissions
    )
    if is_trainee:
        return (
            item.current_published_version_id is not None
            and str(version.id) == str(item.current_published_version_id)
            and version.status == VersionStatus.published
        )

    # 3. Reviewer (has knowledge.approve) can view all non-draft versions
    if "knowledge.approve" in user.permissions:
        return version.status != VersionStatus.draft

    # 4. Other experts (neither author nor reviewer) see published and superseded versions only
    return version.status in {VersionStatus.published, VersionStatus.superseded}


def can_perform(
    action: Union[Action, str],
    version: VersionCtx,
    user: UserCtx,
    item: ItemCtx,
) -> Decision:
    """
    Evaluate whether a user can perform an action on a version.
    Evaluation order strictly follows:
    not_visible -> missing_permission -> not_author/self_review -> wrong_state -> open_version_exists
    """
    act = Action(action)

    # 1. Visibility Check
    if not can_view_version(user, version, item):
        return Decision(allowed=False, reason="not_visible")

    is_author = str(user.id) == str(version.created_by)

    if act == Action.EDIT:
        if "knowledge.edit_own_draft" not in user.permissions:
            return Decision(allowed=False, reason="missing_permission")
        if not is_author:
            return Decision(allowed=False, reason="not_author")
        if not is_editable(version.status):
            return Decision(allowed=False, reason="wrong_state")
        return Decision(allowed=True, reason="ok")

    if act == Action.SUBMIT:
        if "knowledge.submit_review" not in user.permissions:
            return Decision(allowed=False, reason="missing_permission")
        if not is_author:
            return Decision(allowed=False, reason="not_author")
        if not is_editable(version.status):
            return Decision(allowed=False, reason="wrong_state")
        return Decision(allowed=True, reason="ok")

    if act in {Action.APPROVE, Action.REQUEST_CHANGES, Action.REJECT}:
        if "knowledge.approve" not in user.permissions:
            return Decision(allowed=False, reason="missing_permission")
        if is_author:
            return Decision(allowed=False, reason="self_review")
        if version.status != VersionStatus.in_review:
            return Decision(allowed=False, reason="wrong_state")
        return Decision(allowed=True, reason="ok")

    if act == Action.WITHDRAW:
        if "knowledge.approve" not in user.permissions:
            return Decision(allowed=False, reason="missing_permission")
        if version.status != VersionStatus.published:
            return Decision(allowed=False, reason="wrong_state")
        return Decision(allowed=True, reason="ok")

    if act == Action.CREATE_REVISION:
        if "knowledge.create" not in user.permissions:
            return Decision(allowed=False, reason="missing_permission")
        if version.status not in {VersionStatus.published, VersionStatus.rejected, VersionStatus.withdrawn}:
            return Decision(allowed=False, reason="wrong_state")
        if item.has_open_version:
            return Decision(allowed=False, reason="open_version_exists")
        return Decision(allowed=True, reason="ok")

    return Decision(allowed=False, reason="wrong_state")


def allowed_actions(
    version: VersionCtx,
    user: UserCtx,
    item: ItemCtx,
) -> List[str]:
    """Return lowercase list of action names for which can_perform is allowed."""
    result: List[str] = []
    for act in Action:
        dec = can_perform(act, version, user, item)
        if dec.allowed:
            result.append(act.value.lower())
    return result


def raise_for(decision: Decision) -> None:
    """Convert a denied Decision into the corresponding domain application exception."""
    if decision.allowed:
        return

    reason = decision.reason
    if reason == "not_visible":
        raise NotFoundError(code="not_found", message="Knowledge version not found.")
    if reason == "missing_permission":
        raise ForbiddenError(code="forbidden", message="Missing required permission to perform this action.")
    if reason == "not_author":
        # Hides others' drafts as 404
        raise NotFoundError(code="not_found", message="Knowledge version not found.")
    if reason == "self_review":
        raise SelfReviewForbiddenError(
            code="self_review_forbidden",
            message="Authors are strictly forbidden from approving or reviewing their own knowledge versions.",
        )
    if reason == "wrong_state":
        raise InvalidStateError(
            code="invalid_state",
            message="The requested action cannot be performed in the current version state.",
        )
    if reason == "open_version_exists":
        raise OpenVersionExistsError(
            code="open_version_exists",
            message="An open version already exists for this knowledge item.",
        )
    if reason == "no_base_version":
        raise NoBaseVersionError(
            code="no_base_version",
            message="No valid base version found for creating a revision.",
        )

    raise ForbiddenError(code=reason, message=f"Action not permitted: {reason}")
