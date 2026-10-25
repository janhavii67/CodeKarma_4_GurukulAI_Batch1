import uuid
from datetime import datetime, timezone
import pytest
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, DBAPIError
from app.models import KnowledgeItem, KnowledgeVersion, ApprovalRecord, User
from app.core.db_errors import map_db_error
from app.core.exceptions import InvalidStateError, OpenVersionExistsError, ConflictError


@pytest.fixture
def test_item_and_author(db_session: Session):
    """Fixture providing a test user and a test knowledge item."""
    author = db_session.query(User).first()
    assert author is not None

    item_id = str(uuid.uuid4())
    item = KnowledgeItem(
        id=item_id,
        title="Test Item for Constraints",
        category="MAINTENANCE",
        author_id=author.id,
        current_version=1,
    )
    db_session.add(item)
    db_session.flush()
    return item, author


def test_db_second_published_version_rejected(db_session: Session, test_item_and_author):
    """Verify partial unique index uq_versions_one_published_per_item rejects a second published version for an item."""
    item, author = test_item_and_author

    v1 = KnowledgeVersion(
        id=str(uuid.uuid4()),
        item_id=item.id,
        version_no=1,
        title="Version 1 Published",
        status="published",
        origin="expert",
        created_by=author.id,
        published_at=datetime.now(timezone.utc),
    )
    db_session.add(v1)
    db_session.flush()

    v2 = KnowledgeVersion(
        id=str(uuid.uuid4()),
        item_id=item.id,
        version_no=2,
        title="Version 2 Published (Illegal Duplicate)",
        status="published",
        origin="expert",
        created_by=author.id,
        published_at=datetime.now(timezone.utc),
    )
    db_session.add(v2)
    with pytest.raises((IntegrityError, DBAPIError)) as exc_info:
        db_session.flush()

    db_session.rollback()
    mapped = map_db_error(exc_info.value)
    assert isinstance(mapped, ConflictError)


def test_db_second_open_version_rejected(db_session: Session, test_item_and_author):
    """Verify partial unique index uq_versions_one_open_per_item rejects a second open version for an item."""
    item, author = test_item_and_author

    v1 = KnowledgeVersion(
        id=str(uuid.uuid4()),
        item_id=item.id,
        version_no=1,
        title="Version 1 Draft",
        status="draft",
        origin="expert",
        created_by=author.id,
    )
    db_session.add(v1)
    db_session.flush()

    v2 = KnowledgeVersion(
        id=str(uuid.uuid4()),
        item_id=item.id,
        version_no=2,
        title="Version 2 In Review (Illegal Duplicate Open)",
        status="in_review",
        origin="expert",
        created_by=author.id,
    )
    db_session.add(v2)
    with pytest.raises((IntegrityError, DBAPIError)) as exc_info:
        db_session.flush()

    db_session.rollback()
    mapped = map_db_error(exc_info.value)
    assert isinstance(mapped, OpenVersionExistsError)


def test_db_freeze_trigger_blocks_content_edit_on_published(db_session: Session, test_item_and_author):
    """Verify freeze trigger prevents modifying content/title/steps on a published version while allowing status updates."""
    item, author = test_item_and_author

    v1 = KnowledgeVersion(
        id=str(uuid.uuid4()),
        item_id=item.id,
        version_no=1,
        title="Immutable Published SOP",
        summary="Initial content",
        steps="Initial steps",
        content="Initial content",
        status="published",
        origin="expert",
        created_by=author.id,
        published_at=datetime.now(timezone.utc),
    )
    db_session.add(v1)
    db_session.flush()

    # Attempt to modify steps/content directly in DB on published row
    sp = db_session.begin_nested()
    v1.steps = "Malicious unreviewed edit to published SOP"
    with pytest.raises((IntegrityError, DBAPIError)) as exc_info:
        db_session.flush()

    sp.rollback()
    mapped = map_db_error(exc_info.value)
    assert isinstance(mapped, InvalidStateError)
    assert "frozen" in mapped.message.lower()

    # But status change (e.g. published -> superseded or withdrawn) is permitted
    v1.status = "superseded"
    db_session.flush()  # Must succeed
    assert v1.status == "superseded"


def test_db_append_only_approval_records(db_session: Session, test_item_and_author):
    """Verify approval_records table is append-only: updates and deletes are blocked by triggers."""
    item, author = test_item_and_author
    rec_id = str(uuid.uuid4())
    record = ApprovalRecord(
        id=rec_id,
        item_id=item.id,
        reviewer_id=author.id,
        decision="approved",
        comment="Approved as baseline",
    )
    db_session.add(record)
    db_session.flush()

    # Try UPDATE
    sp = db_session.begin_nested()
    record.comment = "Tampered comment"
    with pytest.raises((IntegrityError, DBAPIError)) as exc_info:
        db_session.flush()
    sp.rollback()

    mapped = map_db_error(exc_info.value)
    assert isinstance(mapped, InvalidStateError)
    assert "append-only" in mapped.message.lower()

    # Try DELETE
    sp_del = db_session.begin_nested()
    db_session.delete(record)
    with pytest.raises((IntegrityError, DBAPIError)) as exc_info_del:
        db_session.flush()
    sp_del.rollback()

    mapped_del = map_db_error(exc_info_del.value)
    assert isinstance(mapped_del, InvalidStateError)
    assert "append-only" in mapped_del.message.lower()


def test_db_check_comment_required_on_rejection(db_session: Session, test_item_and_author):
    """Verify check constraint enforces non-empty comment for rejection / change requests."""
    item, author = test_item_and_author
    bad_record = ApprovalRecord(
        id=str(uuid.uuid4()),
        item_id=item.id,
        reviewer_id=author.id,
        decision="rejected",
        comment="   ",  # Blank comment is illegal on rejection
    )
    db_session.add(bad_record)
    with pytest.raises((IntegrityError, DBAPIError)) as exc_info:
        db_session.flush()

    db_session.rollback()
    mapped = map_db_error(exc_info.value)
    assert isinstance(mapped, InvalidStateError)
    assert "comment" in mapped.message.lower()
