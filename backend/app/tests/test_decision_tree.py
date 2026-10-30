"""Unit tests for the decision tree builder service layer.

Uses the shared db_session fixture from conftest (seeded with demo data).
"""
import json
import pytest

from app.models.machine import Machine
from app.models.media import MediaAsset
from app.models.troubleshooting import (
    GUIDE_STATUS_DRAFT,
    GUIDE_STATUS_IN_REVIEW,
    GUIDE_STATUS_PUBLISHED,
    GUIDE_STATUS_SUPERSEDED,
    GUIDE_STATUS_WITHDRAWN,
    TroubleshootingGuide,
    TroubleshootingNode,
)
from app.models.user import User
from app.services import decision_tree_service as svc


def _expert(db):
    """Return the seeded expert user."""
    return db.query(User).filter(User.role_id == "EXPERT").first()


def _trainee(db):
    return db.query(User).filter(User.role_id == "TRAINEE").first()


def _machine(db):
    return db.query(Machine).first()


# ---------------------------------------------------------------------------
# Guide CRUD
# ---------------------------------------------------------------------------

class TestGuideCRUD:
    def test_create_and_list(self, db_session):
        m = _machine(db_session)
        guide = svc.create_guide(db_session, owner=_expert(db_session), title="Vibration Check",
                                 problem_category="MECHANICAL", machine_id=m.id)
        assert guide.title == "Vibration Check"
        assert guide.severity == "MEDIUM"
        assert len(guide.versions) == 1
        assert guide.versions[0].status == GUIDE_STATUS_DRAFT
        items = svc.list_guides(db_session, machine_id=m.id)
        assert any(i["title"] == "Vibration Check" for i in items)

    def test_create_sets_auto_draft(self, db_session):
        guide = svc.create_guide(db_session, owner=_expert(db_session), title="Noise Diagnosis",
                                 problem_category="ELECTRICAL")
        detail = svc.guide_detail(db_session, guide.id)
        assert detail["draft_version_id"] is not None
        assert detail["current_published_version_id"] is None

    def test_update_guide(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="Old Title", problem_category="MECHANICAL")
        svc.update_guide(db_session, guide.id, user.id, title="New Title", severity="HIGH")
        updated = svc.get_guide(db_session, guide.id)
        assert updated.title == "New Title"
        assert updated.severity == "HIGH"

    def test_delete_guide_no_published(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="Temp", problem_category="TEST")
        gid = guide.id
        svc.delete_guide(db_session, gid, user.id)
        assert db_session.get(TroubleshootingGuide, gid) is None

    def test_delete_published_blocked(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="Published", problem_category="TEST")
        version = guide.versions[0]
        svc.add_node(db_session, version.id, title="Start", node_type="question", is_start=True)
        svc.change_version_status(db_session, version.id, "submit_review", user)
        svc.change_version_status(db_session, version.id, "approve", user)
        with pytest.raises(Exception, match="Withdraw"):
            svc.delete_guide(db_session, guide.id, user.id)


# ---------------------------------------------------------------------------
# Version lifecycle
# ---------------------------------------------------------------------------

class TestVersionLifecycle:
    def _setup(self, db):
        user = _expert(db)
        guide = svc.create_guide(db, owner=user, title="LifecycleTest", problem_category="TEST")
        version = guide.versions[0]
        svc.add_node(db, version.id, title="Start?", node_type="question", is_start=True)
        return guide, version, user

    def test_submit_and_approve(self, db_session):
        guide, version, user = self._setup(db_session)
        svc.change_version_status(db_session, version.id, "submit_review", user)
        assert version.status == GUIDE_STATUS_IN_REVIEW
        svc.change_version_status(db_session, version.id, "approve", user)
        assert version.status == GUIDE_STATUS_PUBLISHED
        db_session.refresh(guide)
        assert guide.current_published_version_id == version.id

    def test_reject_returns_to_draft(self, db_session):
        guide, version, user = self._setup(db_session)
        svc.change_version_status(db_session, version.id, "submit_review", user)
        svc.change_version_status(db_session, version.id, "reject", user, reason="Needs more detail")
        assert version.status == GUIDE_STATUS_DRAFT
        assert version.revision_reason == "Needs more detail"

    def test_submit_without_start_node_fails(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="NoStart", problem_category="TEST")
        version = guide.versions[0]
        with pytest.raises(Exception, match="start node"):
            svc.change_version_status(db_session, version.id, "submit_review", user)

    def test_new_version_copies_published(self, db_session):
        guide, version, user = self._setup(db_session)
        n2 = svc.add_node(db_session, version.id, title="End", node_type="end")
        start_node = [n for n in version.nodes if n.is_start][0]
        svc.add_edge(db_session, version.id, start_node.id, n2.id, label="Done")
        svc.change_version_status(db_session, version.id, "submit_review", user)
        svc.change_version_status(db_session, version.id, "approve", user)
        v2 = svc.create_new_version(db_session, guide.id, user.id, "Improve wording")
        detail = svc.version_detail(db_session, v2.id)
        assert len(detail["nodes"]) == 2
        assert len(detail["edges"]) == 1
        assert detail["status"] == GUIDE_STATUS_DRAFT

    def test_supersede_old_on_new_publish(self, db_session):
        guide, v1, user = self._setup(db_session)
        svc.change_version_status(db_session, v1.id, "submit_review", user)
        svc.change_version_status(db_session, v1.id, "approve", user)
        v2 = svc.create_new_version(db_session, guide.id, user.id)
        svc.add_node(db_session, v2.id, title="Start2", node_type="question", is_start=True)
        svc.change_version_status(db_session, v2.id, "submit_review", user)
        svc.change_version_status(db_session, v2.id, "approve", user)
        db_session.refresh(v1)
        assert v1.status == GUIDE_STATUS_SUPERSEDED

    def test_withdraw(self, db_session):
        guide, v1, user = self._setup(db_session)
        svc.change_version_status(db_session, v1.id, "submit_review", user)
        svc.change_version_status(db_session, v1.id, "approve", user)
        svc.change_version_status(db_session, v1.id, "withdraw", user)
        db_session.refresh(guide)
        assert guide.current_published_version_id is None
        assert v1.status == GUIDE_STATUS_WITHDRAWN


# ---------------------------------------------------------------------------
# Node & Edge CRUD
# ---------------------------------------------------------------------------

class TestNodeEdgeCRUD:
    def test_add_update_delete_node(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="NodeTest", problem_category="TEST")
        version = guide.versions[0]
        node = svc.add_node(db_session, version.id, title="Check vibration?", node_type="question",
                            is_start=True, position_x=100.0, position_y=200.0)
        assert node.position_x == 100.0
        svc.update_node(db_session, node.id, title="Check vibration level?", position_x=150.0)
        db_session.refresh(node)
        assert node.title == "Check vibration level?"
        assert node.position_x == 150.0
        nid = node.id
        svc.delete_node(db_session, nid)
        assert db_session.get(TroubleshootingNode, nid) is None

    def test_add_edge_validation(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="EdgeTest", problem_category="TEST")
        version = guide.versions[0]
        n1 = svc.add_node(db_session, version.id, title="Q1", node_type="question", is_start=True)
        n2 = svc.add_node(db_session, version.id, title="A1", node_type="action")
        edge = svc.add_edge(db_session, version.id, n1.id, n2.id, label="Yes")
        assert edge.label == "Yes"
        with pytest.raises(Exception, match="itself"):
            svc.add_edge(db_session, version.id, n1.id, n1.id, label="Loop")

    def test_edit_published_version_blocked(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="Published", problem_category="TEST")
        version = guide.versions[0]
        svc.add_node(db_session, version.id, title="Start", node_type="question", is_start=True)
        svc.change_version_status(db_session, version.id, "submit_review", user)
        svc.change_version_status(db_session, version.id, "approve", user)
        with pytest.raises(Exception, match="draft"):
            svc.add_node(db_session, version.id, title="New", node_type="action")

    def test_batch_position_update(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="PosTest", problem_category="TEST")
        version = guide.versions[0]
        n1 = svc.add_node(db_session, version.id, title="Q1", node_type="question", is_start=True)
        n2 = svc.add_node(db_session, version.id, title="Q2", node_type="action")
        svc.batch_update_positions(db_session, version.id, [
            {"id": n1.id, "position_x": 10.0, "position_y": 20.0},
            {"id": n2.id, "position_x": 30.0, "position_y": 40.0},
        ])
        db_session.refresh(n1)
        db_session.refresh(n2)
        assert n1.position_x == 10.0
        assert n2.position_y == 40.0


# ---------------------------------------------------------------------------
# Trainee walk-through
# ---------------------------------------------------------------------------

class TestTraineeWalk:
    def _build_published_tree(self, db):
        user = _expert(db)
        m = _machine(db)
        guide = svc.create_guide(db, owner=user, title="Walk Test", problem_category="MECHANICAL", machine_id=m.id)
        v = guide.versions[0]
        start = svc.add_node(db, v.id, title="Is vibration present?", node_type="question", is_start=True)
        end = svc.add_node(db, v.id, title="Machine is normal", node_type="end")
        action = svc.add_node(db, v.id, title="Inspect bearings", node_type="action",
                              safety_warning="Wear hearing protection")
        e1 = svc.add_edge(db, v.id, start.id, end.id, label="No")
        e2 = svc.add_edge(db, v.id, start.id, action.id, label="Yes")
        e3 = svc.add_edge(db, v.id, action.id, end.id, label="Done")
        svc.change_version_status(db, v.id, "submit_review", user)
        svc.change_version_status(db, v.id, "approve", user)
        return guide, v

    def test_start_walk(self, db_session):
        guide, v = self._build_published_tree(db_session)
        trainee = _trainee(db_session)
        state = svc.start_walk(db_session, trainee, guide.id)
        assert state["status"] == "in_progress"
        assert state["current_node"]["title"] == "Is vibration present?"
        assert len(state["available_edges"]) == 2

    def test_walk_to_end(self, db_session):
        guide, v = self._build_published_tree(db_session)
        trainee = _trainee(db_session)
        state = svc.start_walk(db_session, trainee, guide.id)
        db_session.expire_all()
        v_detail = svc.version_detail(db_session, v.id)
        edge_map = {e["label"]: e["id"] for e in v_detail["edges"]}
        state = svc.answer_walk(db_session, state["session_id"], trainee.id, edge_map["No"])
        assert state["status"] == "resolved"
        assert state["current_node"]["node_type"] == "end"
        assert len(state["path"]) == 1

    def test_walk_through_action(self, db_session):
        guide, v = self._build_published_tree(db_session)
        trainee = _trainee(db_session)
        state = svc.start_walk(db_session, trainee, guide.id)
        db_session.expire_all()
        v_detail = svc.version_detail(db_session, v.id)
        edge_map = {e["label"]: e["id"] for e in v_detail["edges"]}
        state = svc.answer_walk(db_session, state["session_id"], trainee.id, edge_map["Yes"])
        assert state["status"] == "in_progress"
        assert state["current_node"]["title"] == "Inspect bearings"
        assert state["current_node"]["safety_warning"] == "Wear hearing protection"
        state = svc.answer_walk(db_session, state["session_id"], trainee.id, edge_map["Done"])
        assert state["status"] == "resolved"
        assert len(state["path"]) == 2

    def test_walk_invalid_edge_rejected(self, db_session):
        guide, v = self._build_published_tree(db_session)
        trainee = _trainee(db_session)
        state = svc.start_walk(db_session, trainee, guide.id)
        db_session.expire_all()
        v_detail = svc.version_detail(db_session, v.id)
        edge_map = {e["label"]: e["id"] for e in v_detail["edges"]}
        with pytest.raises(Exception, match="not available"):
            svc.answer_walk(db_session, state["session_id"], trainee.id, edge_map["Done"])

    def test_no_published_version_fails(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="Unpublished", problem_category="TEST")
        with pytest.raises(Exception, match="no published"):
            svc.start_walk(db_session, _trainee(db_session), guide.id)


# ---------------------------------------------------------------------------
# Node media
# ---------------------------------------------------------------------------

class TestNodeMedia:
    def test_attach_media_to_node(self, db_session):
        user = _expert(db_session)
        guide = svc.create_guide(db_session, owner=user, title="MediaTest", problem_category="TEST")
        v = guide.versions[0]
        asset = MediaAsset(id="dt_media_test_1", title="Vibration photo", kind="image",
                           mime="image/png", original_name="vib.png",
                           storage_key="uploads/dt_test_vib.png", size_bytes=1024,
                           uploaded_by=user.id)
        db_session.add(asset)
        db_session.flush()
        node = svc.add_node(db_session, v.id, title="Check", node_type="question",
                            is_start=True, media_asset_ids=["dt_media_test_1"])
        payload = svc._node_payload(node)
        assert len(payload["media"]) == 1
        assert payload["media"][0]["title"] == "Vibration photo"
