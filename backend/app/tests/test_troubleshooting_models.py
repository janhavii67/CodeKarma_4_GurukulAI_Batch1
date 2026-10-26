import json
import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.user import User
from app.models.machine import Machine
from app.models.media import MediaAsset
from app.models.process import ManufacturingProcess
from app.models.troubleshooting import (
    TroubleshootingGuide,
    TroubleshootingVersion,
    TroubleshootingNode,
    TroubleshootingEdge,
    TroubleshootingSession,
    TroubleshootingResponse,
    TroubleshootingEvidence,
    TroubleshootingEscalation,
    GUIDE_STATUS_DRAFT,
    GUIDE_STATUS_PUBLISHED,
    SESSION_STATUS_IN_PROGRESS,
    SESSION_STATUS_RESOLVED,
    CAUSE_STATUS_SUSPECTED,
    CAUSE_STATUS_CONFIRMED,
    NODE_TYPE_CHECK,
    NODE_TYPE_ACTION,
    NODE_TYPE_STOP,
    NODE_TYPE_END,
)

# Mandatory Safety Rule Label for all test fixture data
TEST_PROCEDURE_LABEL = "ILLUSTRATIVE — NOT A REAL PROCEDURE"


def test_manufacturing_process_model(db_session: Session):
    """Test creation and unique constraints of shared ManufacturingProcess entity."""
    proc = ManufacturingProcess(
        name="Laser Catheter Micro-Welding (ILLUSTRATIVE — NOT A REAL PROCEDURE)",
        code="PROC-WELD-TEST",
        description="Precision micro-welding process test fixture",
    )
    db_session.add(proc)
    db_session.commit()
    db_session.refresh(proc)

    assert proc.id is not None
    assert proc.name.startswith("Laser Catheter")
    assert proc.code == "PROC-WELD-TEST"

    # Verify unique constraint on name
    duplicate_proc = ManufacturingProcess(
        name="Laser Catheter Micro-Welding (ILLUSTRATIVE — NOT A REAL PROCEDURE)",
        code="PROC-WELD-TEST-DUP",
    )
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(duplicate_proc)
            db_session.flush()


def test_troubleshooting_guide_and_version_lifecycle(db_session: Session):
    """Test creation of guides, immutable versions, and unique version numbers."""
    expert = db_session.query(User).filter(User.role_id == "EXPERT").first()
    assert expert is not None
    machine = db_session.query(Machine).first()

    proc = ManufacturingProcess(
        name="Precision CNC Lathe Turning (ILLUSTRATIVE — NOT A REAL PROCEDURE)",
        code="PROC-TURN-01",
    )
    db_session.add(proc)
    db_session.flush()

    guide = TroubleshootingGuide(
        title=f"Spindle Vibration Diagnostics ({TEST_PROCEDURE_LABEL})",
        problem_category="MECHANICAL",
        machine_id=machine.id if machine else None,
        process_id=proc.id,
        product_family="Cardiovascular Stents",
        owner_id=expert.id,
        severity="HIGH",
    )
    db_session.add(guide)
    db_session.commit()
    db_session.refresh(guide)

    assert guide.id is not None
    assert guide.severity == "HIGH"
    assert guide.owner_id == expert.id

    # Create Version 1 (Draft)
    v1 = TroubleshootingVersion(
        guide_id=guide.id,
        version_number=1,
        status=GUIDE_STATUS_DRAFT,
        content=f"Initial draft ({TEST_PROCEDURE_LABEL})",
        author_id=expert.id,
        revision_reason="Initial baseline draft",
    )
    db_session.add(v1)
    db_session.commit()
    db_session.refresh(v1)
    assert v1.version_number == 1
    assert v1.status == GUIDE_STATUS_DRAFT

    # Enforce uniqueness: duplicate version number for same guide must fail
    v1_dup = TroubleshootingVersion(
        guide_id=guide.id,
        version_number=1,
        status=GUIDE_STATUS_DRAFT,
        author_id=expert.id,
    )
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(v1_dup)
            db_session.flush()

    # Create Version 2 (Published)
    v2 = TroubleshootingVersion(
        guide_id=guide.id,
        version_number=2,
        status=GUIDE_STATUS_PUBLISHED,
        content=f"Published version ({TEST_PROCEDURE_LABEL})",
        author_id=expert.id,
        revision_reason="Approved and published for training",
        published_at=datetime.now(timezone.utc),
    )
    db_session.add(v2)
    db_session.commit()
    db_session.refresh(v2)

    # Bind guide to current published version
    guide.current_published_version_id = v2.id
    db_session.commit()
    db_session.refresh(guide)

    assert guide.current_published_version_id == v2.id
    assert len(guide.versions) >= 1


def test_troubleshooting_nodes_and_edges_dag(db_session: Session):
    """Test node types, deterministic edge conditions, and cause status invariants."""
    expert = db_session.query(User).filter(User.role_id == "EXPERT").first()
    guide = TroubleshootingGuide(
        title=f"Hydraulic Pressure Drop ({TEST_PROCEDURE_LABEL})",
        problem_category="HYDRAULIC",
        owner_id=expert.id,
        severity="MEDIUM",
    )
    db_session.add(guide)
    db_session.flush()

    version = TroubleshootingVersion(
        guide_id=guide.id,
        version_number=1,
        status=GUIDE_STATUS_DRAFT,
        author_id=expert.id,
    )
    db_session.add(version)
    db_session.flush()

    # Node 1: Start Check Node
    n_start = TroubleshootingNode(
        version_id=version.id,
        node_type=NODE_TYPE_CHECK,
        title=f"Check Main Hydraulic Pressure ({TEST_PROCEDURE_LABEL})",
        instructions="Inspect digital hydraulic gauge on primary pump manifold.",
        expected_observation="Pressure gauge display in bar",
        input_type="numeric",
        input_rules=json.dumps({"min": 0, "max": 100, "unit": "bar", "target": 25}),
        is_start=True,
    )

    # Node 2: Stop & Safety Halt
    n_stop = TroubleshootingNode(
        version_id=version.id,
        node_type=NODE_TYPE_STOP,
        title=f"Hazardous Pressure Over-Limit ({TEST_PROCEDURE_LABEL})",
        instructions="Emergency halt: immediately trip E-stop circuit.",
        safety_notice="DO NOT attempt manual valve bleed while energized.",
        cause_status=CAUSE_STATUS_SUSPECTED,  # Safety rule: suspected is never confirmed
        outcome="escalated",
    )

    # Node 3: Corrective Action Node
    n_action = TroubleshootingNode(
        version_id=version.id,
        node_type=NODE_TYPE_ACTION,
        title=f"Inspect Pressure Relief Bypass Valve ({TEST_PROCEDURE_LABEL})",
        instructions="Verify bypass valve seat seal integrity.",
        cause_status=CAUSE_STATUS_CONFIRMED,
        outcome=None,
    )

    # Node 4: End Node
    n_end = TroubleshootingNode(
        version_id=version.id,
        node_type=NODE_TYPE_END,
        title=f"Procedure Resolution ({TEST_PROCEDURE_LABEL})",
        instructions="Pressure restored to calibrated setpoint.",
        outcome="resolved",
    )

    db_session.add_all([n_start, n_stop, n_action, n_end])
    db_session.flush()

    # Edges
    edge_high = TroubleshootingEdge(
        version_id=version.id,
        from_node_id=n_start.id,
        to_node_id=n_stop.id,
        condition=json.dumps({"operator": ">", "value": 35.0}),
        label="Pressure > 35 bar (Critical Hazard)",
    )
    edge_low = TroubleshootingEdge(
        version_id=version.id,
        from_node_id=n_start.id,
        to_node_id=n_action.id,
        condition=json.dumps({"operator": "<", "value": 20.0}),
        label="Pressure < 20 bar (Deficit)",
    )
    edge_resolve = TroubleshootingEdge(
        version_id=version.id,
        from_node_id=n_action.id,
        to_node_id=n_end.id,
        condition=json.dumps({"value": "resolved"}),
        label="Pressure verified 25 bar",
    )
    db_session.add_all([edge_high, edge_low, edge_resolve])
    db_session.commit()

    # Verifications
    assert n_start.is_start is True
    assert n_stop.cause_status == CAUSE_STATUS_SUSPECTED
    assert len(n_start.outgoing_edges) == 2
    assert len(n_action.incoming_edges) == 1


def test_troubleshooting_session_responses_and_escalations(db_session: Session):
    """Test session binding, server-timestamped responses, evidence, and escalations."""
    trainee = db_session.query(User).filter(User.role_id == "TRAINEE").first()
    expert = db_session.query(User).filter(User.role_id == "EXPERT").first()
    assert trainee is not None
    assert expert is not None

    guide = TroubleshootingGuide(
        title=f"Coolant Leakage Guide ({TEST_PROCEDURE_LABEL})",
        problem_category="MECHANICAL",
        owner_id=expert.id,
        severity="MEDIUM",
    )
    db_session.add(guide)
    db_session.flush()

    version = TroubleshootingVersion(
        guide_id=guide.id,
        version_number=1,
        status=GUIDE_STATUS_PUBLISHED,
        author_id=expert.id,
        published_at=datetime.now(timezone.utc),
    )
    db_session.add(version)
    db_session.flush()

    node = TroubleshootingNode(
        version_id=version.id,
        node_type=NODE_TYPE_CHECK,
        title=f"Check Hose Fittings ({TEST_PROCEDURE_LABEL})",
        instructions="Inspect braided stainless coolant line union.",
        input_type="yes_no",
        is_start=True,
    )
    db_session.add(node)
    db_session.flush()

    # 1. Start Session (strictly bound to version.id)
    session = TroubleshootingSession(
        user_id=trainee.id,
        guide_version_id=version.id,
        reported_symptom="Puddle observed beneath lower turret cover",
        current_node_id=node.id,
        status=SESSION_STATUS_IN_PROGRESS,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    assert session.status == SESSION_STATUS_IN_PROGRESS
    assert session.started_at is not None
    assert session.guide_version_id == version.id

    # 2. Record Response with Server Timestamp
    resp = TroubleshootingResponse(
        session_id=session.id,
        node_id=node.id,
        answer=json.dumps({"value": "leak_detected", "notes": "Fitting loose"}),
        server_timestamp=datetime.now(timezone.utc),
    )
    db_session.add(resp)
    db_session.commit()
    db_session.refresh(resp)

    assert resp.session_id == session.id
    assert resp.server_timestamp is not None
    assert len(session.responses) == 1

    # 3. Create Evidence link to MediaAsset
    media = MediaAsset(
        title=f"Fitting Photo ({TEST_PROCEDURE_LABEL})",
        kind="image",
        file_path="media/test_leak.jpg",
        original_name="test_leak.jpg",
        mime_type="image/jpeg",
        size_bytes=1024,
        uploaded_by=trainee.id,
    )
    db_session.add(media)
    db_session.flush()

    evidence = TroubleshootingEvidence(
        session_id=session.id,
        media_asset_id=media.id,
        note="Visual droplet formation at union fitting",
    )
    db_session.add(evidence)
    db_session.commit()
    db_session.refresh(evidence)

    assert len(session.evidence) == 1
    assert session.evidence[0].media_asset_id == media.id

    # 4. Formal Escalation
    escalation = TroubleshootingEscalation(
        session_id=session.id,
        reason="Replacement high-pressure fitting unavailable in workshop kanban",
        assigned_expert_id=expert.id,
        status="pending",
    )
    db_session.add(escalation)
    session.status = "escalated"
    db_session.commit()
    db_session.refresh(session)

    assert session.status == "escalated"
    assert session.escalation is not None
    assert session.escalation.assigned_expert_id == expert.id
