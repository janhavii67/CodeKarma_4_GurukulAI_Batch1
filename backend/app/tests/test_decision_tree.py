"""Decision tree engine: authoring, validation, versioning, AI assistance, trainee walk and permissions.

AI tests use the deterministic FakeLLMProvider; no external model is called.
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.exceptions import AppError, ForbiddenError, ValidationError
from app.models.machine import Machine
from app.models.media import MediaAsset
from app.models.procedure import Procedure
from app.models.troubleshooting import (
    DecisionTreeAIDraft,
    TroubleshootingEdge,
    TroubleshootingEscalation,
    TroubleshootingGuide,
    TroubleshootingNode,
    TroubleshootingResponse,
)
from app.models.user import User
from app.modules.assistant.providers.llm_base import LLMTimeoutError
from app.modules.assistant.providers.llm_fake import FakeLLMProvider
from app.repositories.user_repo import UserRepository
from app.services import decision_tree_ai_service as ai
from app.services import decision_tree_service as svc
from app.services import decision_tree_walk_service as walk


def _user(db, email):
    return db.query(User).filter(User.email == email).one()


def _perms(db, user):
    return UserRepository.get_user_permissions(db, user)


@pytest.fixture
def expert_a(db_session):
    return _user(db_session, settings.EXPERT_A_EMAIL)


@pytest.fixture
def expert_b(db_session):
    return _user(db_session, settings.EXPERT_B_EMAIL)


@pytest.fixture
def trainee(db_session):
    return _user(db_session, settings.TRAINEE_EMAIL)


@pytest.fixture
def machine(db_session):
    return db_session.query(Machine).first()


def _start(version):
    return next(n for n in version.nodes if n.is_start)


def build_valid_tree(db, owner, machine_id=None, severity="MEDIUM"):
    """Start -> Q(vibration?) -Yes-> Safety -> Action -> Result(worn) ; -No-> Result(normal) ; -Not sure-> Result(normal)."""
    guide = svc.create_guide(db, owner=owner, title="Unusual vibration", problem_category="Mechanical",
                             machine_id=machine_id, severity=severity, description="Gantry vibrates during scans.")
    version = guide.versions[0]
    start = _start(version)
    question = svc.add_node(db, version, {"node_type": "question", "title": "Is vibration present while rotating?",
                                          "help_text": "Rotation exposes bearing wear."}, connect_from={"node_id": start.id})
    safety = svc.add_node(db, version, {"node_type": "safety", "title": "Isolate power",
                                        "safety_warning": "Lock out the gantry before touching covers.",
                                        "details": {"ppe": ["Gloves"]}}, connect_from={"node_id": question.id, "label": "Yes"})
    action = svc.add_node(db, version, {"node_type": "action", "title": "Inspect the bearing housing"},
                          connect_from={"node_id": safety.id})
    worn = svc.add_node(db, version, {"node_type": "result", "title": "Bearing wear suspected",
                                      "details": {"possible_causes": ["Worn gantry bearing"],
                                                  "recommended_actions": ["Request service engineer"]}},
                        connect_from={"node_id": action.id})
    normal = svc.add_node(db, version, {"node_type": "result", "title": "Operating normally",
                                        "instructions": "No vibration-related fault found."},
                          connect_from={"node_id": question.id, "label": "No"})
    svc.add_edge(db, version, question.id, "Not sure", normal.id)
    db.refresh(version)
    return guide, version, {"start": start, "question": question, "safety": safety, "action": action, "worn": worn, "normal": normal}


def publish(db, version, author, reviewer):
    svc.change_version_status(db, version, "submit_review", author, _perms(db, author))
    svc.change_version_status(db, version, "approve", reviewer, _perms(db, reviewer))


# ---------------------------------------------------------------------------
# Trees and building
# ---------------------------------------------------------------------------

class TestAuthoring:
    def test_create_generates_start_and_metadata(self, db_session, expert_a, machine):
        guide = svc.create_guide(db_session, owner=expert_a, title="Machine not starting", problem_category="electrical issues",
                                 machine_id=machine.id, difficulty="BEGINNER", tags=["power", " ups "], estimated_minutes=15,
                                 description="Console stays dark.")
        version = guide.versions[0]
        assert [n.node_type for n in version.nodes] == ["start"]
        assert _start(version).instructions == "Console stays dark."
        payload = svc.guide_payload(db_session, guide)
        assert payload["problem_category"] == "ELECTRICAL_ISSUES"
        assert payload["tags"] == ["power", "ups"]
        assert payload["status"] == "draft" and payload["stats"]["steps"] == 1

    def test_multiple_trees_per_machine(self, db_session, expert_a, machine):
        for title in ("Unusual vibration", "Image quality issues", "Temperature problems"):
            svc.create_guide(db_session, owner=expert_a, title=title, problem_category="General", machine_id=machine.id)
        titles = {g["title"] for g in svc.list_guides(db_session, _perms(db_session, expert_a), machine_id=machine.id)}
        assert {"Unusual vibration", "Image quality issues", "Temperature problems"} <= titles

    def test_connect_from_question_adds_answer_and_from_step_inserts(self, db_session, expert_a):
        guide, version, n = build_valid_tree(db_session, expert_a)
        labels = [e.label for e in n["question"].outgoing_edges]
        assert labels == ["Yes", "No", "Not sure"]
        # Inserting after the safety step keeps the chain intact: safety -> check -> action.
        check = svc.add_node(db_session, version, {"node_type": "action", "title": "Check mounting bolts"},
                             connect_from={"node_id": n["safety"].id})
        db_session.refresh(n["safety"])
        assert n["safety"].outgoing_edges[0].to_node_id == check.id
        assert check.outgoing_edges[0].to_node_id == n["action"].id

    def test_connect_from_answer_without_destination(self, db_session, expert_a):
        guide, version, n = build_valid_tree(db_session, expert_a)
        pending = svc.add_edge(db_session, version, n["question"].id, "Intermittent")
        assert pending.to_node_id is None
        follow_up = svc.add_node(db_session, version, {"node_type": "question", "title": "Only at high speed?"},
                                 connect_from={"node_id": n["question"].id, "edge_id": pending.id})
        db_session.refresh(pending)
        assert pending.to_node_id == follow_up.id

    @pytest.mark.parametrize("case", ["second_next", "terminal", "duplicate", "self_loop"])
    def test_branch_rules(self, db_session, expert_a, case):
        guide, version, n = build_valid_tree(db_session, expert_a)
        with pytest.raises(ValidationError):
            if case == "second_next":
                svc.add_edge(db_session, version, n["action"].id, "Other", n["normal"].id)
            elif case == "terminal":
                svc.add_edge(db_session, version, n["worn"].id, "More", n["normal"].id)
            elif case == "duplicate":
                svc.add_edge(db_session, version, n["question"].id, "yes", n["normal"].id)
            else:
                svc.update_edge(db_session, n["question"].outgoing_edges[0], {"to_node_id": n["question"].id})

    def test_delete_step_keeps_answers_for_reconnection(self, db_session, expert_a):
        guide, version, n = build_valid_tree(db_session, expert_a)
        normal_id = n["normal"].id
        svc.delete_node(db_session, n["normal"])
        db_session.expire_all()
        version = svc.get_version(db_session, version.id)
        dangling = [e for e in version.edges if e.to_node_id is None]
        assert {e.label for e in dangling} == {"No", "Not sure"}
        assert db_session.get(TroubleshootingNode, normal_id) is None
        codes = {i["code"] for i in svc.validate_version(db_session, version)}
        assert "missing_destination" in codes
        with pytest.raises(ValidationError):
            svc.delete_node(db_session, _start(version))

    def test_duplicate_step_copies_answers(self, db_session, expert_a):
        guide, version, n = build_valid_tree(db_session, expert_a)
        copy = svc.duplicate_node(db_session, n["question"])
        assert [(e.label, e.to_node_id) for e in copy.outgoing_edges] == [(e.label, e.to_node_id) for e in n["question"].outgoing_edges]

    def test_undo_snapshot_restores_graph(self, db_session, expert_a):
        guide, version, n = build_valid_tree(db_session, expert_a)
        snapshot = svc.version_detail(db_session, version)
        svc.delete_node(db_session, n["action"])
        svc.add_node(db_session, svc.get_version(db_session, version.id), {"node_type": "result", "title": "Extra"})
        restored = svc.replace_graph(db_session, svc.get_version(db_session, version.id), snapshot["nodes"], snapshot["edges"])
        after = svc.version_detail(db_session, restored)
        assert sorted(x["id"] for x in after["nodes"]) == sorted(x["id"] for x in snapshot["nodes"])
        assert sorted((e["from_node_id"], e["to_node_id"], e["label"]) for e in after["edges"]) == \
            sorted((e["from_node_id"], e["to_node_id"], e["label"]) for e in snapshot["edges"])

    def test_snapshot_rejects_broken_connection(self, db_session, expert_a):
        guide, version, n = build_valid_tree(db_session, expert_a)
        snapshot = svc.version_detail(db_session, version)
        snapshot["edges"][0]["to_node_id"] = "missing"
        with pytest.raises(ValidationError):
            svc.replace_graph(db_session, version, snapshot["nodes"], snapshot["edges"])


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class TestValidation:
    def test_complete_tree_has_no_errors(self, db_session, expert_a):
        guide, version, _ = build_valid_tree(db_session, expert_a)
        assert [i for i in svc.validate_version(db_session, version) if i["level"] == "error"] == []

    def test_detects_dead_ends_unreachable_and_missing_results(self, db_session, expert_a):
        guide = svc.create_guide(db_session, owner=expert_a, title="Broken", problem_category="Test")
        version = guide.versions[0]
        question = svc.add_node(db_session, version, {"node_type": "question", "title": "Q"}, connect_from={"node_id": _start(version).id})
        svc.add_node(db_session, version, {"node_type": "action", "title": "Orphan"})
        codes = {i["code"] for i in svc.validate_version(db_session, svc.get_version(db_session, version.id))}
        assert {"question_without_answers", "dead_end", "unreachable", "no_result"} <= codes

    def test_detects_endless_loop_and_marks_intended_loops(self, db_session, expert_a):
        guide, version, n = build_valid_tree(db_session, expert_a)
        # Re-check loop that can still finish: only a warning.
        recheck = svc.add_node(db_session, version, {"node_type": "question", "title": "Did it stop?"},
                               connect_from={"node_id": n["question"].id, "label": "Sometimes"})
        svc.add_edge(db_session, version, recheck.id, "No", n["question"].id)
        svc.add_edge(db_session, version, recheck.id, "Yes", n["normal"].id)
        issues = svc.validate_version(db_session, svc.get_version(db_session, version.id))
        assert any(i["code"] == "loop" and i["level"] == "warning" for i in issues)
        assert not [i for i in issues if i["level"] == "error"]
        # A trap: two actions pointing at each other never reach a result.
        a = svc.add_node(db_session, version, {"node_type": "action", "title": "Trap A"}, connect_from={"node_id": n["question"].id, "label": "Trap"})
        b = svc.add_node(db_session, version, {"node_type": "action", "title": "Trap B"}, connect_from={"node_id": a.id})
        svc.add_edge(db_session, version, b.id, "Next", a.id)
        codes = {i["code"] for i in svc.validate_version(db_session, svc.get_version(db_session, version.id)) if i["level"] == "error"}
        assert "no_ending" in codes

    def test_high_severity_requires_safety_and_workflow_must_be_published(self, db_session, expert_a):
        guide = svc.create_guide(db_session, owner=expert_a, title="Cooling", problem_category="Thermal", severity="CRITICAL")
        version = guide.versions[0]
        draft_workflow = Procedure(title="Draft wf", description="d", author_id=expert_a.id, status="DRAFT")
        db_session.add(draft_workflow)
        db_session.commit()
        svc.add_node(db_session, version, {"node_type": "workflow", "title": "Follow chiller workflow",
                                           "linked_workflow_version_id": draft_workflow.id}, connect_from={"node_id": _start(version).id})
        codes = {i["code"] for i in svc.validate_version(db_session, svc.get_version(db_session, version.id))}
        assert {"safety_required", "workflow_unavailable", "dead_end"} <= codes


# ---------------------------------------------------------------------------
# Versioning and approval
# ---------------------------------------------------------------------------

class TestLifecycle:
    def test_submit_blocked_when_invalid(self, db_session, expert_a):
        guide = svc.create_guide(db_session, owner=expert_a, title="Incomplete", problem_category="Test")
        with pytest.raises(ValidationError) as exc:
            svc.change_version_status(db_session, guide.versions[0], "submit_review", expert_a, _perms(db_session, expert_a))
        assert exc.value.code == "tree_invalid"
        assert exc.value.details["issues"]

    def test_author_cannot_approve_own_tree(self, db_session, expert_a, expert_b):
        guide, version, _ = build_valid_tree(db_session, expert_a)
        svc.change_version_status(db_session, version, "submit_review", expert_a, _perms(db_session, expert_a))
        with pytest.raises(ForbiddenError):
            svc.change_version_status(db_session, version, "approve", expert_a, _perms(db_session, expert_a))
        svc.change_version_status(db_session, version, "approve", expert_b, _perms(db_session, expert_b))
        assert version.status == "published" and guide.current_published_version_id == version.id

    def test_published_versions_are_locked_and_new_drafts_copy_them(self, db_session, expert_a, expert_b, monkeypatch):
        guide, v1, n = build_valid_tree(db_session, expert_a)
        image = MediaAsset(title="Bearing photo", kind="image", mime="image/png", original_name="b.png",
                           storage_key="decision-tree-test/b.png", size_bytes=10, uploaded_by=expert_a.id)
        db_session.add(image)
        db_session.commit()
        svc.update_node(db_session, n["action"], {"media_asset_ids": [image.id]})
        # The record exists but its file is missing from storage: publishing must be blocked.
        assert "media_unavailable" in {i["code"] for i in svc.validate_version(db_session, v1)}
        monkeypatch.setattr(svc, "_media_available", lambda asset: True)
        publish(db_session, v1, expert_a, expert_b)
        with pytest.raises(ValidationError):
            svc.editable_version(db_session, v1.id, expert_a, _perms(db_session, expert_a))
        v2 = svc.create_new_version(db_session, guide, expert_a.id, "Add a bolt check")
        detail = svc.version_detail(db_session, v2)
        assert len(detail["nodes"]) == 6 and len(detail["edges"]) == 6
        assert any(node["media"] and node["media"][0]["id"] == image.id for node in detail["nodes"])
        with pytest.raises(ValidationError):
            svc.create_new_version(db_session, guide, expert_a.id)
        publish(db_session, v2, expert_a, expert_b)
        db_session.refresh(v1)
        assert v1.status == "superseded"

    def test_reject_requires_reason_and_returns_draft(self, db_session, expert_a, expert_b):
        guide, version, _ = build_valid_tree(db_session, expert_a)
        svc.change_version_status(db_session, version, "submit_review", expert_a, _perms(db_session, expert_a))
        with pytest.raises(ValidationError):
            svc.change_version_status(db_session, version, "reject", expert_b, _perms(db_session, expert_b))
        svc.change_version_status(db_session, version, "reject", expert_b, _perms(db_session, expert_b), "Add PPE detail")
        assert version.status == "draft" and version.revision_reason == "Add PPE detail"

    def test_archive_hides_tree_from_trainees_and_duplicate_copies_graph(self, db_session, expert_a, expert_b, trainee):
        guide, version, _ = build_valid_tree(db_session, expert_a)
        publish(db_session, version, expert_a, expert_b)
        trainee_perms = _perms(db_session, trainee)
        assert any(g["id"] == guide.id for g in svc.list_guides(db_session, trainee_perms))
        svc.set_archived(db_session, guide, True)
        assert not any(g["id"] == guide.id for g in svc.list_guides(db_session, trainee_perms))
        copy = svc.duplicate_guide(db_session, guide, expert_a)
        assert copy.versions[0].status == "draft" and len(copy.versions[0].nodes) == 6
        with pytest.raises(ValidationError):
            svc.delete_guide(db_session, guide)


# ---------------------------------------------------------------------------
# AI assistance (fake provider only)
# ---------------------------------------------------------------------------

SOURCES = [{"id": "S1", "title": "CT gantry manual", "section": "Bearings", "text": "Inspect gantry bearings for play.",
            "knowledge_version_id": None, "source_id": "src-1", "score": 0.9}]


class TestAI:
    def _fake(self, payload):
        fake = FakeLLMProvider()
        fake.set_response(payload if isinstance(payload, str) else json.dumps(payload))
        return fake

    def test_generate_draft_creates_reviewable_ai_steps(self, db_session, expert_a, monkeypatch):
        monkeypatch.setattr(ai, "retrieve_sources", lambda *a, **k: SOURCES)
        guide = svc.create_guide(db_session, owner=expert_a, title="Unusual vibration", problem_category="Mechanical")
        version = guide.versions[0]
        draft = {"nodes": [
            {"key": "q1", "type": "question", "title": "Is vibration present?"},
            {"key": "s1", "type": "safety", "title": "Isolate power", "safety_warning": "Lock out"},
            {"key": "a1", "type": "action", "title": "Inspect bearings", "sources": ["S1"]},
            {"key": "r1", "type": "result", "title": "Bearing wear suspected", "details": {"possible_causes": ["Worn bearing"]}},
            {"key": "r2", "type": "result", "title": "Normal"},
            {"key": "bad", "type": "teleport", "title": "Ignored"},
        ], "edges": [
            {"from": "start", "to": "q1", "label": "Next"}, {"from": "q1", "to": "s1", "label": "Yes"},
            {"from": "q1", "to": "r2", "label": "No"}, {"from": "s1", "to": "a1"}, {"from": "s1", "to": "r2"},
            {"from": "a1", "to": "r1"}, {"from": "r1", "to": "q1"}, {"from": "q1", "to": "ghost", "label": "Maybe"},
        ]}
        result = ai.generate_draft(db_session, expert_a, version, "CT vibration", provider=self._fake(f"```json\n{json.dumps(draft)}\n```"))
        nodes = {n["title"]: n for n in result["version"]["nodes"]}
        assert result["summary"]["steps"] == 5 and result["summary"]["branches"] == 5
        assert all(n["origin"] == "ai_draft" for title, n in nodes.items() if title != guide.title)
        assert nodes["Inspect bearings"]["details"]["source_titles"] == ["CT gantry manual"]
        assert nodes["Bearing wear suspected"]["details"]["unsourced"] is True
        version = svc.get_version(db_session, version.id)
        assert "ai_unreviewed" in {i["code"] for i in svc.validate_version(db_session, version)}
        for node in [n for n in version.nodes if n.origin == "ai_draft"]:
            svc.update_node(db_session, node, {"mark_reviewed": True})
        assert "ai_unreviewed" not in {i["code"] for i in svc.validate_version(db_session, svc.get_version(db_session, version.id))}
        assert db_session.query(DecisionTreeAIDraft).filter_by(version_id=version.id, status="applied").count() == 1

    def test_generate_refuses_to_overwrite_and_reports_bad_output(self, db_session, expert_a, monkeypatch):
        monkeypatch.setattr(ai, "retrieve_sources", lambda *a, **k: [])
        guide, version, _ = build_valid_tree(db_session, expert_a)
        with pytest.raises(ValidationError):
            ai.generate_draft(db_session, expert_a, version, "x", provider=self._fake({"nodes": []}))
        empty = svc.create_guide(db_session, owner=expert_a, title="Empty", problem_category="Test").versions[0]
        with pytest.raises(AppError) as exc:
            ai.generate_draft(db_session, expert_a, empty, "x", provider=self._fake("not json"))
        assert exc.value.code == "ai_invalid_output"
        failing = FakeLLMProvider()
        failing.set_error(LLMTimeoutError("slow"))
        with pytest.raises(AppError) as exc:
            ai.generate_draft(db_session, expert_a, empty, "x", provider=failing)
        assert exc.value.status_code == 503

    def test_review_finds_duplicates_and_survives_ai_outage(self, db_session, expert_a, monkeypatch):
        guide, version, n = build_valid_tree(db_session, expert_a)
        svc.duplicate_node(db_session, n["question"])
        failing = FakeLLMProvider()
        failing.set_error(LLMTimeoutError("down"))
        review = ai.review_tree(db_session, expert_a, svc.get_version(db_session, version.id), provider=failing)
        assert review["ai_available"] is False
        assert any(s["type"] == "duplicate" for s in review["suggestions"])
        ok = ai.review_tree(db_session, expert_a, svc.get_version(db_session, version.id), provider=self._fake(
            {"suggestions": [{"node": "N2", "type": "safety", "message": "Add hearing protection", "rationale": "Loud"}]}))
        assert any(s["source"] == "ai" and s["node_id"] for s in ok["suggestions"])


# ---------------------------------------------------------------------------
# Trainee walk-through
# ---------------------------------------------------------------------------

class TestWalk:
    def _published(self, db, expert_a, expert_b, machine):
        guide, version, n = build_valid_tree(db, expert_a, machine.id)
        publish(db, version, expert_a, expert_b)
        return guide, version, n

    @staticmethod
    def _edge(state, label):
        return next(a["id"] for a in state["answers"] if a["label"] == label)

    def test_walk_branch_back_and_report(self, db_session, expert_a, expert_b, trainee, machine):
        guide, version, n = self._published(db_session, expert_a, expert_b, machine)
        session = walk.start_walk(db_session, trainee, guide.id)
        state = walk.walk_state(db_session, session)
        assert state["current_node"]["node_type"] == "start" and state["step_number"] == 1
        state = walk.walk_state(db_session, walk.answer(db_session, session.id, trainee, self._edge(state, "Next")))
        assert state["current_node"]["title"].startswith("Is vibration")
        state = walk.walk_state(db_session, walk.answer(db_session, session.id, trainee, self._edge(state, "No")))
        assert state["is_terminal"] and state["status"] == "resolved"
        # Change the earlier answer: the "No" response is superseded, not deleted.
        state = walk.walk_state(db_session, walk.go_back(db_session, session.id, trainee, 1))
        assert state["status"] == "in_progress" and len(state["path"]) == 1
        assert db_session.query(TroubleshootingResponse).filter_by(session_id=session.id, outcome="superseded").count() == 1
        for label in ("Yes", "Next", "Next"):
            state = walk.walk_state(db_session, walk.answer(db_session, session.id, trainee, self._edge(state, label)))
        report = state["report"]
        assert report["result_title"] == "Bearing wear suspected"
        assert report["observations"] == [{"question": "Is vibration present while rotating?", "answer": "Yes"}]
        assert report["possible_causes"] == ["Worn gantry bearing"]
        assert "Lock out the gantry before touching covers." in report["safety"] and "Gloves" in report["safety"]
        assert [step["answer"] for step in report["decision_path"]] == ["Next", "Yes", "Next", "Next"]
        history = walk.history(db_session, trainee)
        assert history[0]["session_id"] == session.id and history[0]["status"] == "resolved"

    def test_walk_state_exposes_complete_published_tree(self, db_session, expert_a, expert_b, trainee, machine):
        guide, version, n = self._published(db_session, expert_a, expert_b, machine)
        session = walk.start_walk(db_session, trainee, guide.id)
        initial = walk.walk_state(db_session, session)
        tree = initial["tree"]
        assert {node["id"] for node in tree["nodes"]} == {node.id for node in version.nodes}
        assert {edge["id"] for edge in tree["edges"]} == {edge.id for edge in version.edges}
        assert next(node for node in tree["nodes"] if node["id"] == n["start"].id)["status"] == "current"
        assert next(node for node in tree["nodes"] if node["id"] == n["question"].id)["status"] == "available"
        hidden = next(node for node in tree["nodes"] if node["id"] == n["normal"].id)
        assert hidden["status"] == "locked"
        assert hidden["title"] == n["normal"].title
        assert hidden["instructions"] == n["normal"].instructions
        assert all(edge["label"] is not None for edge in tree["edges"])

        next_state = walk.walk_state(db_session, walk.answer(db_session, session.id, trainee, self._edge(initial, "Next")))
        tree = next_state["tree"]
        assert next(node for node in tree["nodes"] if node["id"] == n["question"].id)["status"] == "current"
        assert next(edge for edge in tree["edges"] if edge["label"] == "Yes")["status"] == "available"

    def test_invalid_answers_rejected_and_escalation(self, db_session, expert_a, expert_b, trainee, machine):
        guide, version, n = self._published(db_session, expert_a, expert_b, machine)
        session = walk.start_walk(db_session, trainee, guide.id)
        wrong = next(e for e in version.edges if e.from_node_id == n["question"].id)
        with pytest.raises(ValidationError):
            walk.answer(db_session, session.id, trainee, wrong.id)
        walk.escalate(db_session, session.id, trainee, "Vibration getting worse")
        assert db_session.query(TroubleshootingEscalation).filter_by(session_id=session.id).count() == 1
        with pytest.raises(ValidationError):
            walk.restart(db_session, session.id, trainee)

    def test_explain_marks_unsupported_answers_uncertain(self, db_session, expert_a, expert_b, trainee, machine, monkeypatch):
        guide, version, n = self._published(db_session, expert_a, expert_b, machine)
        session = walk.start_walk(db_session, trainee, guide.id)
        monkeypatch.setattr(ai, "retrieve_sources", lambda *a, **k: SOURCES)
        cited = FakeLLMProvider()
        cited.set_json_response({"answer": "Feel for shaking.", "uncertain": False, "escalate": False, "cited": ["S1"]})
        result = ai.explain_for_trainee(db_session, trainee, session, "What is vibration?", provider=cited)
        assert result["uncertain"] is False and result["sources"][0]["title"] == "CT gantry manual"
        uncited = FakeLLMProvider()
        uncited.set_json_response({"answer": "Probably the motor.", "uncertain": False, "escalate": False, "cited": []})
        result = ai.explain_for_trainee(db_session, trainee, session, "What is broken?", provider=uncited)
        assert result["uncertain"] is True and result["notice"]


# ---------------------------------------------------------------------------
# HTTP permissions
# ---------------------------------------------------------------------------

def _login(client, email, password):
    client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return {"X-CSRF-Token": client.get("/api/v1/auth/csrf").json()["csrf_token"]}


class TestPermissions:
    def test_trainee_sees_only_published_trees(self, client: TestClient, db_session, expert_a, expert_b, machine):
        draft_guide = svc.create_guide(db_session, owner=expert_a, title="Hidden draft", problem_category="Test", machine_id=machine.id)
        live_guide, version, _ = build_valid_tree(db_session, expert_a, machine.id)
        publish(db_session, version, expert_a, expert_b)
        headers = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
        listed = {g["id"] for g in client.get("/api/v1/decision-trees").json()}
        assert live_guide.id in listed and draft_guide.id not in listed
        assert client.get(f"/api/v1/decision-trees/versions/{draft_guide.versions[0].id}").status_code == 404
        assert client.get(f"/api/v1/decision-trees/{draft_guide.id}").status_code == 404
        assert client.post("/api/v1/decision-trees", json={"title": "Nope", "problem_category": "x1"}, headers=headers).status_code == 403
        catalog = client.get("/api/v1/decision-trees/catalog").json()
        assert any(t["id"] == live_guide.id for t in catalog["trees"])
        started = client.post("/api/v1/decision-trees/walk", json={"guide_id": live_guide.id}, headers=headers)
        assert started.status_code == 201 and started.json()["current_node"]["node_type"] == "start"

    def test_other_expert_cannot_edit_but_reviewer_flow_works(self, client: TestClient, db_session, expert_a):
        headers = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
        created = client.post("/api/v1/decision-trees", json={"title": "API tree", "problem_category": "Test"}, headers=headers).json()
        version_id = created["working_version_id"]
        start_id = client.get(f"/api/v1/decision-trees/versions/{version_id}").json()["nodes"][0]["id"]
        added = client.post(f"/api/v1/decision-trees/versions/{version_id}/nodes",
                            json={"node_type": "result", "title": "Done", "connect_from": {"node_id": start_id}}, headers=headers)
        assert added.status_code == 201 and len(added.json()["version"]["edges"]) == 1
        assert client.post(f"/api/v1/decision-trees/versions/{version_id}/status", json={"action": "submit_review"}, headers=headers).status_code == 200
        assert client.post(f"/api/v1/decision-trees/versions/{version_id}/status", json={"action": "approve"}, headers=headers).status_code == 403
        headers_b = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
        assert client.post(f"/api/v1/decision-trees/versions/{version_id}/status", json={"action": "approve"}, headers=headers_b).status_code == 200
