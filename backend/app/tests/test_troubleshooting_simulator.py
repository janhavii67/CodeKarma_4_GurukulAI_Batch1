"""Troubleshooting simulator runtime: branching, evidence, safety, scoring, XP, unlocking and permissions."""
import json

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.models.troubleshooting import MissionAchievement
from app.models.user import User
from app.repositories.user_repo import UserRepository
from app.services import decision_tree_service as svc
from app.services import troubleshooting_simulator_service as sim


def _user(db, email):
    return db.query(User).filter(User.email == email).one()


def _perms(db, user):
    return UserRepository.get_user_permissions(db, user)


def _sim(edge, db, **data):
    svc.update_edge(db, edge, {"condition": json.dumps({"sim": data})})


def build_mission(db, author, reviewer, *, difficulty="INTERMEDIATE", enabled=True, publish=True, title="Gantry vibration"):
    """Start -> Q(min 2 checks: 2 reveals, unsafe, wrong, acceptable->loose, correct->safety) -> safety -> inspect(clue) -> worn."""
    guide = svc.create_guide(db, owner=author, title=title, problem_category="Mechanical", difficulty=difficulty, estimated_minutes=10,
                             simulation={"enabled": enabled, "scenario": "Operator reports shaking during scans.", "skills": ["Vibration analysis"],
                                         "equipment": ["Vibration meter"], "xp_reward": 200})
    v = guide.versions[0]
    start = next(n for n in v.nodes if n.is_start)
    q = svc.add_node(db, v, {"node_type": "question", "title": "Initial assessment", "help_text": "Measure before you open anything.",
                             "details": {"sim_min_checks": 2, "sim_hint": "Start with the indicators that don't need tools."}},
                     connect_from={"node_id": start.id})
    safety = svc.add_node(db, v, {"node_type": "safety", "title": "Isolate the gantry", "safety_warning": "Lock out before opening covers.",
                                  "details": {"ppe": ["Gloves"]}}, connect_from={"node_id": q.id, "label": "Proceed to bearing inspection"})
    inspect = svc.add_node(db, v, {"node_type": "action", "title": "Inspect bearing housing",
                                   "details": {"sim_clue": "Visible play in the main bearing", "sim_zone": "mechanical", "sim_critical": True}},
                           connect_from={"node_id": safety.id})
    worn = svc.add_node(db, v, {"node_type": "result", "title": "Bearing wear",
                                "details": {"possible_causes": ["Worn gantry bearing"],
                                            "recommended_actions": ["Lock out the gantry", "Replace the bearing"],
                                            "verification": "Run a test scan with no vibration alarm"}},
                        connect_from={"node_id": inspect.id})
    loose = svc.add_node(db, v, {"node_type": "result", "title": "Loose cover",
                                 "details": {"possible_causes": ["Loose cover panel"], "recommended_actions": ["Tighten cover fasteners"]}},
                         connect_from={"node_id": q.id, "label": "Check cover panels"})
    reveal1 = svc.add_edge(db, v, q.id, "Read vibration indicator", worn.id)
    reveal2 = svc.add_edge(db, v, q.id, "Listen to recorded sound", worn.id)
    unsafe = svc.add_edge(db, v, q.id, "Open covers while rotating", worn.id)
    wrong = svc.add_edge(db, v, q.id, "Replace the detector", worn.id)
    edges = {e.label: e for e in v.edges if e.from_node_id == q.id}
    _sim(edges["Proceed to bearing inspection"], db, outcome="correct", feedback="Readings point to the bearing.")
    _sim(edges["Check cover panels"], db, outcome="acceptable", feedback="Covers rarely cause this pattern.")
    _sim(reveal1, db, outcome="reveal", clue="7.2 mm/s, above the 4.5 mm/s reference", reading={"label": "Vibration", "value": "7.2", "unit": "mm/s", "normal": "< 4.5"}, zone="sensors")
    _sim(reveal2, db, outcome="reveal", clue="Rhythmic grinding once per rotation", zone="mechanical")
    _sim(unsafe, db, outcome="unsafe", feedback="Never open covers while the gantry rotates.")
    _sim(wrong, db, outcome="wrong", feedback="Detector faults cause image artifacts, not vibration.")
    if publish:
        svc.change_version_status(db, v, "submit_review", author, _perms(db, author))
        svc.change_version_status(db, v, "approve", reviewer, _perms(db, reviewer))
    db.refresh(v)
    return guide, v, {"q": q, "safety": safety, "inspect": inspect, "worn": worn, "loose": loose,
                      "reveal1": reveal1, "reveal2": reveal2, "unsafe": unsafe, "wrong": wrong, "correct": edges["Proceed to bearing inspection"]}


@pytest.fixture
def people(db_session):
    return (_user(db_session, settings.EXPERT_A_EMAIL), _user(db_session, settings.EXPERT_B_EMAIL), _user(db_session, settings.TRAINEE_EMAIL))


def _to_question(db, trainee, guide):
    attempt = sim.start_attempt(db, trainee, guide.id)
    start_edge = sim.attempt_payload(db, attempt)["current"]["actions"][0]["edge_id"]
    return sim.act(db, trainee, attempt.id, start_edge)


def _play_perfect(db, trainee, guide, n, *, hints=()):
    attempt = _to_question(db, trainee, guide)
    for level in hints:
        sim.use_hint(db, trainee, attempt.id, level)
    sim.act(db, trainee, attempt.id, n["reveal1"].id)
    sim.act(db, trainee, attempt.id, n["reveal2"].id)
    sim.act(db, trainee, attempt.id, n["correct"].id)
    safety_edge = n["safety"].outgoing_edges[0].id
    sim.act(db, trainee, attempt.id, safety_edge, acknowledged=True)
    sim.perform(db, trainee, attempt.id)
    sim.act(db, trainee, attempt.id, n["inspect"].outgoing_edges[0].id)
    sim.diagnose(db, trainee, attempt.id, ["Worn gantry bearing"])
    sim.correct_fault(db, trainee, attempt.id, ["Lock out the gantry", "Replace the bearing"])
    return sim.verify(db, trainee, attempt.id)


class TestMissions:
    def test_only_enabled_published_missions_are_listed(self, db_session, people):
        expert_a, expert_b, trainee = people
        live, _, _ = build_mission(db_session, expert_a, expert_b, title="Live mission")
        build_mission(db_session, expert_a, expert_b, title="Draft mission", publish=False)
        build_mission(db_session, expert_a, expert_b, title="Plain tree", enabled=False)
        titles = {m["title"] for m in sim.list_missions(db_session, trainee)}
        assert "Live mission" in titles and "Draft mission" not in titles and "Plain tree" not in titles
        brief = sim.briefing(db_session, trainee, live.id)
        assert brief["scenario"] == "Operator reports shaking during scans."
        assert "Lock out before opening covers." in brief["safety"] and "Gloves" in brief["safety"]
        assert set(brief["zones"]) == {"mechanical", "sensors"}

    def test_actions_never_expose_outcomes_or_the_fault_name(self, db_session, people):
        expert_a, expert_b, trainee = people
        guide, v, n = build_mission(db_session, expert_a, expert_b)
        attempt = _to_question(db_session, trainee, guide)
        payload = sim.attempt_payload(db_session, attempt)
        view = payload["current"]
        assert view["kind"] == "multi_action"
        assert all(set(a) == {"edge_id", "label", "zone", "kind", "done", "attempted_wrong"} for a in view["actions"])
        assert {a["kind"] for a in view["actions"]} == {"check", "advance"}
        tree = payload["tree"]
        authored_nodes = {item["id"] for item in tree["nodes"] if not item.get("runtime_stage")}
        authored_edges = {item["id"] for item in tree["edges"] if not item.get("runtime_stage")}
        assert authored_nodes == {node.id for node in v.nodes}
        assert authored_edges == {edge.id for edge in v.edges}
        assert {item["kind"] for item in tree["nodes"] if item.get("runtime_stage")} == {"corrective_action", "verification", "mission_complete"}
        assert next(item for item in tree["nodes"] if item["id"] == n["q"].id)["status"] == "current"
        assert next(item for item in tree["nodes"] if item["id"] == n["worn"].id)["title"] == "Fault identification"
        assert all(item["title"] != "Bearing wear" for item in tree["nodes"])
        assert all(item["label"] is None for item in tree["edges"] if item["source"] == n["safety"].id)
        assert payload["score_preview"]["total"] >= 0
        assert payload["score_preview"]["xp_projected"] >= 0

    def test_tree_reveals_evidence_and_follows_only_the_selected_branch(self, db_session, people):
        expert_a, expert_b, trainee = people
        guide, v, n = build_mission(db_session, expert_a, expert_b)
        attempt = _to_question(db_session, trainee, guide)
        sim.act(db_session, trainee, attempt.id, n["reveal1"].id)
        tree = sim.attempt_payload(db_session, attempt)["tree"]
        q_node = next(item for item in tree["nodes"] if item["id"] == n["q"].id)
        evidence_edge = next(item for item in tree["edges"] if item["id"] == n["reveal1"].id)
        assert q_node["evidence_found"] is True
        assert evidence_edge["status"] == "evidence_found"
        sim.act(db_session, trainee, attempt.id, n["reveal2"].id)
        sim.act(db_session, trainee, attempt.id, n["correct"].id)
        tree = sim.attempt_payload(db_session, attempt)["tree"]
        assert next(item for item in tree["nodes"] if item["id"] == n["safety"].id)["status"] == "current"
        assert next(item for item in tree["edges"] if item["id"] == n["correct"].id)["status"] == "completed"
        assert next(item for item in tree["nodes"] if item["id"] == n["loose"].id)["status"] == "locked"
        attempt = sim.act(db_session, trainee, attempt.id, n["safety"].outgoing_edges[0].id, acknowledged=True)
        sim.perform(db_session, trainee, attempt.id)
        attempt = sim.act(db_session, trainee, attempt.id, n["inspect"].outgoing_edges[0].id)
        sim.diagnose(db_session, trainee, attempt.id, ["Worn gantry bearing"])
        tree = sim.attempt_payload(db_session, attempt)["tree"]
        assert tree["current_node_id"] == "$runtime:corrective"
        assert next(item for item in tree["nodes"] if item["id"] == "$runtime:corrective")["status"] == "current"


class TestGameplay:
    def test_branching_consequences_safety_and_completion(self, db_session, people):
        expert_a, expert_b, trainee = people
        guide, v, n = build_mission(db_session, expert_a, expert_b)
        attempt = _to_question(db_session, trainee, guide)
        sim.act(db_session, trainee, attempt.id, n["reveal1"].id)
        # Deciding before the required checks keeps the trainee on the step.
        attempt = sim.act(db_session, trainee, attempt.id, n["correct"].id)
        assert attempt.current_node_id == n["q"].id and attempt.state["counts"]["premature"] == 1
        attempt = sim.act(db_session, trainee, attempt.id, n["unsafe"].id)
        assert attempt.state["counts"]["violations"] == 1 and attempt.current_node_id == n["q"].id
        attempt = sim.act(db_session, trainee, attempt.id, n["wrong"].id)
        assert attempt.state["events"][-1]["feedback"].startswith("Detector faults")
        sim.act(db_session, trainee, attempt.id, n["reveal2"].id)
        sim.act(db_session, trainee, attempt.id, n["reveal2"].id)  # repeat = unnecessary
        attempt = sim.act(db_session, trainee, attempt.id, n["correct"].id)
        assert attempt.current_node_id == n["safety"].id
        with pytest.raises(ValidationError) as exc:
            sim.act(db_session, trainee, attempt.id, n["safety"].outgoing_edges[0].id)
        assert exc.value.code == "safety_checkpoint"
        attempt = sim.act(db_session, trainee, attempt.id, n["safety"].outgoing_edges[0].id, acknowledged=True)
        attempt = sim.act(db_session, trainee, attempt.id, n["inspect"].outgoing_edges[0].id)
        assert attempt.current_node_id == n["inspect"].id  # must inspect first
        sim.perform(db_session, trainee, attempt.id)
        attempt = sim.act(db_session, trainee, attempt.id, n["inspect"].outgoing_edges[0].id)
        assert attempt.stage == "diagnose"
        payload = sim.attempt_payload(db_session, attempt)
        assert payload["current"]["title"] == "Fault identification"
        assert set(payload["diagnosis"]["options"]) == {"Worn gantry bearing", "Loose cover panel"}
        sim.diagnose(db_session, trainee, attempt.id, ["Worn gantry bearing"])
        sim.correct_fault(db_session, trainee, attempt.id, ["Replace the bearing", "Tighten cover fasteners"])
        attempt = sim.verify(db_session, trainee, attempt.id)
        assert attempt.stage == "correct" and attempt.status == "in_progress"  # not restored yet
        sim.correct_fault(db_session, trainee, attempt.id, ["Lock out the gantry", "Replace the bearing"])
        attempt = sim.verify(db_session, trainee, attempt.id)
        assert attempt.status == "completed"
        score = attempt.score
        assert score["breakdown"]["root_cause"] == 30
        assert score["breakdown"]["safety"] == 10
        # wrong (5) + two premature moves (2 each: before the checks, before inspecting) + one repeated check (1)
        assert score["breakdown"]["decisions"] == 20 - 5 - 2 * 2 - 1
        assert score["breakdown"]["evidence"] == 10 and score["evidence_available"] == 3
        assert score["breakdown"]["corrective"] == 10 - 2
        assert score["breakdown"]["efficiency"] == 0  # speed is never rewarded after a safety violation
        report = sim.attempt_payload(db_session, attempt)["report"]
        assert any(m["why"] == "Never open covers while the gantry rotates." for m in report["mistakes"])
        assert report["replay"][1]["approved_choice"] == "Proceed to bearing inspection" and report["replay"][1]["matches"]
        codes = {a.code for a in db_session.query(MissionAchievement).filter_by(user_id=trainee.id)}
        assert {"first_responder", "root_cause_master", "sharp_observer"} <= codes and "safety_first" not in codes

    def test_wrong_branch_and_wrong_diagnosis_score_low(self, db_session, people):
        expert_a, expert_b, trainee = people
        guide, v, n = build_mission(db_session, expert_a, expert_b)
        attempt = _to_question(db_session, trainee, guide)
        sim.act(db_session, trainee, attempt.id, n["reveal1"].id)
        sim.act(db_session, trainee, attempt.id, n["reveal2"].id)
        attempt = sim.act(db_session, trainee, attempt.id, next(e.id for e in v.edges if e.label == "Check cover panels"))
        assert attempt.current_node_id == n["loose"].id
        sim.diagnose(db_session, trainee, attempt.id, ["Loose cover panel"])
        # The corrective stage reveals the scenario's real fault; its approved procedure is required to restore the machine.
        payload = sim.attempt_payload(db_session, sim.get_attempt(db_session, trainee, attempt.id))
        assert payload["corrective"]["fault"] == "Bearing wear"
        sim.correct_fault(db_session, trainee, attempt.id, ["Lock out the gantry", "Replace the bearing"])
        attempt = sim.verify(db_session, trainee, attempt.id)
        assert attempt.state["diagnosis"]["reached_target"] is False
        assert attempt.score["breakdown"]["root_cause"] == 0
        assert "Isolate the gantry" in attempt.score["missed_checkpoints"]

    def test_hints_xp_and_replays(self, db_session, people):
        expert_a, expert_b, trainee = people
        guide, v, n = build_mission(db_session, expert_a, expert_b)
        attempt = _to_question(db_session, trainee, guide)
        _, text = sim.use_hint(db_session, trainee, attempt.id, 3)
        assert "Proceed to bearing inspection" in text
        _, smart = sim.use_hint(db_session, trainee, attempt.id, 2)
        assert smart == "Start with the indicators that don't need tools."
        sim.abandon(db_session, trainee, attempt.id)
        first = _play_perfect(db_session, trainee, guide, n, hints=(2,))
        assert first.score["breakdown"]["assistance"] == 4 and first.xp_awarded > 0
        second = _play_perfect(db_session, trainee, guide, n)
        # Only the improvement over the personal best plus new achievements earns XP on a replay.
        assert second.total_score > first.total_score
        assert second.xp_awarded == (second.score["xp_earned"] - first.score["xp_earned"]) + 50  # independent_investigator
        profile = sim.profile(db_session, trainee)
        assert profile["total_xp"] == first.xp_awarded + second.xp_awarded
        assert profile["skills"][0]["skill"] == "Vibration analysis"

    def test_attempt_resumes_and_stays_on_its_version(self, db_session, people):
        expert_a, expert_b, trainee = people
        guide, v1, n = build_mission(db_session, expert_a, expert_b)
        attempt = _to_question(db_session, trainee, guide)
        v2 = svc.create_new_version(db_session, guide, expert_a.id)
        svc.change_version_status(db_session, v2, "submit_review", expert_a, _perms(db_session, expert_a))
        svc.change_version_status(db_session, v2, "approve", expert_b, _perms(db_session, expert_b))
        resumed = sim.start_attempt(db_session, trainee, guide.id)
        assert resumed.id == attempt.id and resumed.version_id == v1.id
        fresh = sim.start_attempt(db_session, trainee, guide.id, restart=True)
        assert fresh.version_id == v2.id
        sim.set_paused(db_session, trainee, fresh.id, True)
        with pytest.raises(ValidationError):
            sim.act(db_session, trainee, fresh.id, n["reveal1"].id)

    def test_harder_missions_unlock_after_passing_easier_ones(self, db_session, people):
        expert_a, expert_b, trainee = people
        easy, _, n = build_mission(db_session, expert_a, expert_b, difficulty="BEGINNER", title="Easy one")
        hard, _, _ = build_mission(db_session, expert_a, expert_b, difficulty="ADVANCED", title="Hard one")
        hard_summary = next(m for m in sim.list_missions(db_session, trainee) if m["id"] == hard.id)
        assert hard_summary["locked"] and "Beginner" in hard_summary["locked_reason"]
        with pytest.raises(ValidationError):
            sim.start_attempt(db_session, trainee, hard.id)
        _play_perfect(db_session, trainee, easy, n)
        assert not next(m for m in sim.list_missions(db_session, trainee) if m["id"] == hard.id)["locked"]


def _login(client, email, password):
    client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return {"X-CSRF-Token": client.get("/api/v1/auth/csrf").json()["csrf_token"]}


class TestPermissions:
    def test_trainee_plays_but_cannot_see_drafts_or_other_attempts(self, client: TestClient, db_session, people):
        expert_a, expert_b, trainee = people
        guide, _, _ = build_mission(db_session, expert_a, expert_b)
        draft, _, _ = build_mission(db_session, expert_a, expert_b, title="Unreleased", publish=False)
        headers = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
        assert client.get(f"/api/v1/simulator/missions/{draft.id}").status_code == 404
        started = client.post(f"/api/v1/simulator/missions/{guide.id}/attempts", json={}, headers=headers)
        assert started.status_code == 201 and started.json()["current"]["kind"] == "start"
        attempt_id = started.json()["id"]
        headers_b = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
        assert client.get(f"/api/v1/simulator/attempts/{attempt_id}").status_code in (403, 404)
        with pytest.raises(NotFoundError):
            sim.get_attempt(db_session, expert_b, attempt_id)


def test_checks_and_wrong_answers_need_no_destination(db_session, people):
    """Experts don't have to wire a next step for answers that never move the trainee."""
    expert_a, expert_b, trainee = people
    guide, v, n = build_mission(db_session, expert_a, expert_b, publish=False)
    check = svc.add_edge(db_session, v, n["q"].id, "Check the alarm log")
    _sim(check, db_session, outcome="reveal", clue="Alarm 214: bearing temperature high")
    pending = svc.add_edge(db_session, v, n["q"].id, "Undecided answer")
    codes = [(i["code"], i.get("edge_id")) for i in svc.validate_version(db_session, svc.get_version(db_session, v.id))]
    assert ("missing_destination", pending.id) in codes and ("missing_destination", check.id) not in codes
    svc.delete_edge(db_session, pending)
    svc.change_version_status(db_session, v, "submit_review", expert_a, _perms(db_session, expert_a))
    svc.change_version_status(db_session, v, "approve", expert_b, _perms(db_session, expert_b))
    attempt = _to_question(db_session, trainee, guide)
    assert any(a["edge_id"] == check.id for a in sim.attempt_payload(db_session, attempt)["current"]["actions"])
    attempt = sim.act(db_session, trainee, attempt.id, check.id)
    assert attempt.state["evidence"][-1]["clue"] == "Alarm 214: bearing temperature high"
