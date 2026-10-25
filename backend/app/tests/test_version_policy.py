import pytest
from app.core.enums import VersionStatus, Action
from app.core.exceptions import (
    NotFoundError,
    ForbiddenError,
    InvalidStateError,
    SelfReviewForbiddenError,
    OpenVersionExistsError,
    NoBaseVersionError,
)
from app.services.version_policy import (
    UserCtx,
    VersionCtx,
    ItemCtx,
    Decision,
    can_view_version,
    can_perform,
    allowed_actions,
    raise_for,
)


# Define standard test personas
TRAINEE = UserCtx(id="u_trainee", role="TRAINEE", permissions=frozenset({"knowledge.view_published"}))

EXPERT_AUTHOR = UserCtx(
    id="u_author",
    role="EXPERT",
    permissions=frozenset({
        "knowledge.create",
        "knowledge.edit_own_draft",
        "knowledge.submit_review",
        "knowledge.view_published",
    }),
)

OTHER_EXPERT = UserCtx(
    id="u_other_expert",
    role="EXPERT",
    permissions=frozenset({
        "knowledge.create",
        "knowledge.edit_own_draft",
        "knowledge.submit_review",
        "knowledge.view_published",
    }),
)

REVIEWER_OTHER = UserCtx(
    id="u_reviewer_other",
    role="EXPERT",
    permissions=frozenset({
        "knowledge.create",
        "knowledge.approve",
        "knowledge.view_published",
    }),
)

REVIEWER_AUTHOR = UserCtx(
    id="u_author",
    role="EXPERT",
    permissions=frozenset({
        "knowledge.create",
        "knowledge.approve",
        "knowledge.edit_own_draft",
        "knowledge.submit_review",
        "knowledge.view_published",
    }),
)


# Oracle function for visibility
def visibility_oracle(user: UserCtx, version: VersionCtx, item: ItemCtx) -> bool:
    if user.id == version.created_by:
        return True
    if user.role.upper() == "TRAINEE":
        return version.id == item.current_published_version_id and version.status == VersionStatus.published
    if "knowledge.approve" in user.permissions:
        return version.status != VersionStatus.draft
    return version.status in {VersionStatus.published, VersionStatus.superseded}


# Oracle function for permissions/actions
def policy_oracle(action: Action, user: UserCtx, version: VersionCtx, item: ItemCtx) -> tuple[bool, str]:
    if not visibility_oracle(user, version, item):
        return False, "not_visible"

    is_author = user.id == version.created_by

    if action == Action.EDIT:
        if "knowledge.edit_own_draft" not in user.permissions:
            return False, "missing_permission"
        if not is_author:
            return False, "not_author"
        if version.status not in {VersionStatus.draft, VersionStatus.changes_requested}:
            return False, "wrong_state"
        return True, "ok"

    if action == Action.SUBMIT:
        if "knowledge.submit_review" not in user.permissions:
            return False, "missing_permission"
        if not is_author:
            return False, "not_author"
        if version.status not in {VersionStatus.draft, VersionStatus.changes_requested}:
            return False, "wrong_state"
        return True, "ok"

    if action in {Action.APPROVE, Action.REQUEST_CHANGES, Action.REJECT}:
        if "knowledge.approve" not in user.permissions:
            return False, "missing_permission"
        if is_author:
            return False, "self_review"
        if version.status != VersionStatus.in_review:
            return False, "wrong_state"
        return True, "ok"

    if action == Action.WITHDRAW:
        if "knowledge.approve" not in user.permissions:
            return False, "missing_permission"
        if version.status != VersionStatus.published:
            return False, "wrong_state"
        return True, "ok"

    if action == Action.CREATE_REVISION:
        if "knowledge.create" not in user.permissions:
            return False, "missing_permission"
        if version.status not in {VersionStatus.published, VersionStatus.rejected, VersionStatus.withdrawn}:
            return False, "wrong_state"
        if item.has_open_version:
            return False, "open_version_exists"
        return True, "ok"

    return False, "wrong_state"


@pytest.mark.parametrize("status", list(VersionStatus))
@pytest.mark.parametrize("persona", [TRAINEE, EXPERT_AUTHOR, OTHER_EXPERT, REVIEWER_OTHER, REVIEWER_AUTHOR])
def test_visibility_matrix(status: VersionStatus, persona: UserCtx):
    item = ItemCtx(id="item_1", has_open_version=False, current_published_version_id="ver_pub")
    version = VersionCtx(id="ver_pub" if status == VersionStatus.published else "ver_test", item_id="item_1", status=status, created_by="u_author")

    expected = visibility_oracle(persona, version, item)
    actual = can_view_version(persona, version, item)
    assert actual == expected


@pytest.mark.parametrize("action", list(Action))
@pytest.mark.parametrize("status", list(VersionStatus))
@pytest.mark.parametrize("persona", [TRAINEE, EXPERT_AUTHOR, OTHER_EXPERT, REVIEWER_OTHER, REVIEWER_AUTHOR])
def test_policy_matrix_against_oracle(action: Action, status: VersionStatus, persona: UserCtx):
    item = ItemCtx(id="item_1", has_open_version=False, current_published_version_id="ver_pub")
    version = VersionCtx(id="ver_pub" if status == VersionStatus.published else "ver_test", item_id="item_1", status=status, created_by="u_author")

    expected_allowed, expected_reason = policy_oracle(action, persona, version, item)
    decision = can_perform(action, version, persona, item)

    assert decision.allowed == expected_allowed
    assert decision.reason == expected_reason


def test_self_review_forbidden_for_author_reviewer():
    """Verify that even with knowledge.approve, an author can NEVER approve, reject, or request changes on their own version."""
    item = ItemCtx(id="item_1", has_open_version=True)
    version = VersionCtx(id="v_rev", item_id="item_1", status=VersionStatus.in_review, created_by="u_author")

    for act in [Action.APPROVE, Action.REQUEST_CHANGES, Action.REJECT]:
        dec = can_perform(act, version, REVIEWER_AUTHOR, item)
        assert dec.allowed is False
        assert dec.reason == "self_review"
        with pytest.raises(SelfReviewForbiddenError):
            raise_for(dec)


def test_author_reviewer_can_withdraw_own_published():
    """Self-review rule does NOT apply to withdraw, so an author who is a reviewer CAN withdraw their own content."""
    item = ItemCtx(id="item_1", has_open_version=False, current_published_version_id="v_pub")
    version = VersionCtx(id="v_pub", item_id="item_1", status=VersionStatus.published, created_by="u_author")

    dec = can_perform(Action.WITHDRAW, version, REVIEWER_AUTHOR, item)
    assert dec.allowed is True
    assert dec.reason == "ok"


def test_create_revision_open_version_exists():
    """Verify create_revision is blocked with open_version_exists when item already has an open version."""
    item_blocked = ItemCtx(id="item_1", has_open_version=True, current_published_version_id="v_pub")
    version = VersionCtx(id="v_pub", item_id="item_1", status=VersionStatus.published, created_by="u_author")

    dec = can_perform(Action.CREATE_REVISION, version, EXPERT_AUTHOR, item_blocked)
    assert dec.allowed is False
    assert dec.reason == "open_version_exists"
    with pytest.raises(OpenVersionExistsError):
        raise_for(dec)


def test_allowed_actions():
    """Verify allowed_actions returns exact lowercase matching actions."""
    item = ItemCtx(id="item_1", has_open_version=False, current_published_version_id="v_pub")
    # Draft version: author should see ['edit', 'submit']
    draft_ver = VersionCtx(id="v_draft", item_id="item_1", status=VersionStatus.draft, created_by="u_author")
    actions = allowed_actions(draft_ver, EXPERT_AUTHOR, item)
    assert set(actions) == {"edit", "submit"}

    # In-review version: peer reviewer should see ['approve', 'request_changes', 'reject']
    in_review_ver = VersionCtx(id="v_in_review", item_id="item_1", status=VersionStatus.in_review, created_by="u_author")
    peer_actions = allowed_actions(in_review_ver, REVIEWER_OTHER, item)
    assert set(peer_actions) == {"approve", "request_changes", "reject"}


def test_raise_for_mappings():
    """Verify each reason code maps to its respective domain exception."""
    raise_for(Decision(allowed=True, reason="ok"))  # Does not raise

    with pytest.raises(NotFoundError):
        raise_for(Decision(allowed=False, reason="not_visible"))

    with pytest.raises(ForbiddenError):
        raise_for(Decision(allowed=False, reason="missing_permission"))

    with pytest.raises(NotFoundError):
        raise_for(Decision(allowed=False, reason="not_author"))

    with pytest.raises(SelfReviewForbiddenError):
        raise_for(Decision(allowed=False, reason="self_review"))

    with pytest.raises(InvalidStateError):
        raise_for(Decision(allowed=False, reason="wrong_state"))

    with pytest.raises(OpenVersionExistsError):
        raise_for(Decision(allowed=False, reason="open_version_exists"))

    with pytest.raises(NoBaseVersionError):
        raise_for(Decision(allowed=False, reason="no_base_version"))
