from typing import Union
from app.core.enums import (
    VersionStatus,
    Action,
    EDITABLE_STATUSES,
    OPEN_STATUSES,
    FROZEN_STATUSES,
)
from app.core.exceptions import InvalidStateError


TRANSITIONS: dict[VersionStatus, frozenset[VersionStatus]] = {
    VersionStatus.draft: frozenset({VersionStatus.in_review}),
    VersionStatus.changes_requested: frozenset({VersionStatus.in_review}),
    VersionStatus.in_review: frozenset({
        VersionStatus.published,
        VersionStatus.changes_requested,
        VersionStatus.rejected,
    }),
    VersionStatus.published: frozenset({
        VersionStatus.superseded,
        VersionStatus.withdrawn,
    }),
    VersionStatus.rejected: frozenset(),
    VersionStatus.approved: frozenset(),
    VersionStatus.superseded: frozenset(),
    VersionStatus.withdrawn: frozenset(),
}

ACTION_TARGET: dict[Action, VersionStatus] = {
    Action.SUBMIT: VersionStatus.in_review,
    Action.APPROVE: VersionStatus.published,
    Action.REQUEST_CHANGES: VersionStatus.changes_requested,
    Action.REJECT: VersionStatus.rejected,
    Action.WITHDRAW: VersionStatus.withdrawn,
}


def next_status(
    action: Union[Action, str],
    current: Union[VersionStatus, str],
) -> VersionStatus:
    """
    Determine the next VersionStatus resulting from an action applied to the current status.
    Raises InvalidStateError if the action is not recognized or the transition is forbidden.
    """
    curr = VersionStatus(current)
    act = Action(action)

    if act not in ACTION_TARGET:
        raise InvalidStateError(
            message=f"Action '{act.value}' cannot transition version from '{curr.value}'.",
            details={"status": curr.value, "action": act.value},
        )

    target = ACTION_TARGET[act]
    if target not in TRANSITIONS.get(curr, frozenset()):
        raise InvalidStateError(
            message=f"Illegal transition: '{curr.value}' cannot transition to '{target.value}' via action '{act.value}'.",
            details={"status": curr.value, "action": act.value},
        )

    return target


def assert_transition(
    current: Union[VersionStatus, str],
    target: Union[VersionStatus, str],
) -> None:
    """
    Assert that a transition from current to target is valid.
    Used for system transitions (e.g. published -> superseded).
    Raises InvalidStateError if the transition is illegal.
    """
    curr = VersionStatus(current)
    tgt = VersionStatus(target)

    if tgt not in TRANSITIONS.get(curr, frozenset()):
        raise InvalidStateError(
            message=f"Illegal system transition from '{curr.value}' to '{tgt.value}'.",
            details={"current": curr.value, "target": tgt.value},
        )


def is_editable(status: Union[VersionStatus, str]) -> bool:
    """Return True if the version status is editable by its author (draft, changes_requested)."""
    return VersionStatus(status) in EDITABLE_STATUSES


def is_open(status: Union[VersionStatus, str]) -> bool:
    """Return True if the version is open / pending in the authoring/review pipeline."""
    return VersionStatus(status) in OPEN_STATUSES


def is_frozen(status: Union[VersionStatus, str]) -> bool:
    """Return True if the version content is immutable / frozen."""
    return VersionStatus(status) in FROZEN_STATUSES
