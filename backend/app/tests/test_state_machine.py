import pytest
from app.core.enums import (
    VersionStatus,
    Action,
    EDITABLE_STATUSES,
    OPEN_STATUSES,
    FROZEN_STATUSES,
)
from app.core.exceptions import InvalidStateError
from app.services.state_machine import (
    TRANSITIONS,
    ACTION_TARGET,
    next_status,
    assert_transition,
    is_editable,
    is_open,
    is_frozen,
)


def test_transition_matrix_completeness():
    """Verify all 8 statuses are present in the transition table with exactly defined target sets."""
    all_statuses = set(VersionStatus)
    assert set(TRANSITIONS.keys()) == all_statuses

    # Invariants on targets
    assert TRANSITIONS[VersionStatus.draft] == frozenset({VersionStatus.in_review})
    assert TRANSITIONS[VersionStatus.changes_requested] == frozenset({VersionStatus.in_review})
    assert TRANSITIONS[VersionStatus.in_review] == frozenset({
        VersionStatus.published,
        VersionStatus.changes_requested,
        VersionStatus.rejected,
    })
    assert TRANSITIONS[VersionStatus.published] == frozenset({
        VersionStatus.superseded,
        VersionStatus.withdrawn,
    })
    assert TRANSITIONS[VersionStatus.rejected] == frozenset()
    assert TRANSITIONS[VersionStatus.approved] == frozenset()
    assert TRANSITIONS[VersionStatus.superseded] == frozenset()
    assert TRANSITIONS[VersionStatus.withdrawn] == frozenset()


@pytest.mark.parametrize("src", list(VersionStatus))
@pytest.mark.parametrize("dst", list(VersionStatus))
def test_all_8x8_status_pairs(src: VersionStatus, dst: VersionStatus):
    """Exhaustively verify every 8x8 status pair against TRANSITIONS."""
    allowed = dst in TRANSITIONS[src]
    if allowed:
        assert_transition(src, dst)
    else:
        with pytest.raises(InvalidStateError) as exc_info:
            assert_transition(src, dst)
        assert exc_info.value.code == "invalid_state"
        assert exc_info.value.details["current"] == src.value
        assert exc_info.value.details["target"] == dst.value


def test_approved_status_unreachable():
    """Verify that 'approved' is reserved and completely unreachable from any status."""
    for s in VersionStatus:
        assert VersionStatus.approved not in TRANSITIONS[s]


@pytest.mark.parametrize(
    "action,current,expected_target",
    [
        (Action.SUBMIT, VersionStatus.draft, VersionStatus.in_review),
        (Action.SUBMIT, VersionStatus.changes_requested, VersionStatus.in_review),
        (Action.APPROVE, VersionStatus.in_review, VersionStatus.published),
        (Action.REQUEST_CHANGES, VersionStatus.in_review, VersionStatus.changes_requested),
        (Action.REJECT, VersionStatus.in_review, VersionStatus.rejected),
        (Action.WITHDRAW, VersionStatus.published, VersionStatus.withdrawn),
    ],
)
def test_valid_next_status(action: Action, current: VersionStatus, expected_target: VersionStatus):
    """Test all valid action-driven status transitions."""
    assert next_status(action, current) == expected_target
    # Test string input support
    assert next_status(action.value, current.value) == expected_target


@pytest.mark.parametrize(
    "action,current",
    [
        (Action.SUBMIT, VersionStatus.in_review),
        (Action.SUBMIT, VersionStatus.published),
        (Action.SUBMIT, VersionStatus.rejected),
        (Action.APPROVE, VersionStatus.draft),
        (Action.APPROVE, VersionStatus.changes_requested),
        (Action.APPROVE, VersionStatus.published),
        (Action.REQUEST_CHANGES, VersionStatus.draft),
        (Action.REQUEST_CHANGES, VersionStatus.published),
        (Action.REJECT, VersionStatus.draft),
        (Action.REJECT, VersionStatus.published),
        (Action.WITHDRAW, VersionStatus.draft),
        (Action.WITHDRAW, VersionStatus.in_review),
        (Action.EDIT, VersionStatus.draft),  # EDIT does not produce a next status
        (Action.CREATE_REVISION, VersionStatus.published),  # CREATE_REVISION creates a new version
    ],
)
def test_invalid_next_status_raises(action: Action, current: VersionStatus):
    """Verify illegal transitions raise InvalidStateError with details."""
    with pytest.raises(InvalidStateError) as exc_info:
        next_status(action, current)
    assert exc_info.value.code == "invalid_state"
    assert exc_info.value.details["status"] == current.value
    assert exc_info.value.details["action"] == action.value


def test_status_predicates():
    """Verify is_editable, is_open, is_frozen partitioned sets."""
    for s in VersionStatus:
        if s in EDITABLE_STATUSES:
            assert is_editable(s) is True
            assert is_open(s) is True
            assert is_frozen(s) is False
        elif s == VersionStatus.in_review:
            assert is_editable(s) is False
            assert is_open(s) is True
            assert is_frozen(s) is True  # in_review content is frozen
        elif s == VersionStatus.approved:
            assert is_editable(s) is False
            assert is_open(s) is False
            assert is_frozen(s) is False
        else:
            assert is_editable(s) is False
            assert is_open(s) is False
            assert is_frozen(s) is True
