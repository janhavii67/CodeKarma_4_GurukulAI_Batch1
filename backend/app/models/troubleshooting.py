from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Boolean, Integer, Float, ForeignKey, DateTime, UniqueConstraint, JSON, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


# Status constants for strict state machine
GUIDE_STATUS_DRAFT = "draft"
GUIDE_STATUS_IN_REVIEW = "in_review"
GUIDE_STATUS_PUBLISHED = "published"
GUIDE_STATUS_WITHDRAWN = "withdrawn"
GUIDE_STATUS_SUPERSEDED = "superseded"

SESSION_STATUS_IN_PROGRESS = "in_progress"
SESSION_STATUS_WAITING_FOR_INFO = "waiting_for_information"
SESSION_STATUS_BLOCKED = "blocked"
SESSION_STATUS_ESCALATED = "escalated"
SESSION_STATUS_RESOLVED = "resolved"
SESSION_STATUS_UNRESOLVED = "unresolved"
SESSION_STATUS_CLOSED = "closed"

CAUSE_STATUS_SUSPECTED = "suspected"
CAUSE_STATUS_UNDER_INVESTIGATION = "under_investigation"
CAUSE_STATUS_CONFIRMED = "confirmed"

NODE_TYPE_CHECK = "check"
NODE_TYPE_QUESTION = "question"
NODE_TYPE_ACTION = "action"
NODE_TYPE_STOP = "stop"
NODE_TYPE_ESCALATION = "escalation"
NODE_TYPE_END = "end"


class TroubleshootingGuide(Base, TimestampMixin):
    """
    Manufacturing standard troubleshooting guide master record.
    Bound to specific machines, processes, or product families.
    """
    __tablename__ = "troubleshooting_guides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), index=True, nullable=False)
    problem_category: Mapped[str] = mapped_column(String(64), index=True, nullable=False)  # MECHANICAL, ELECTRICAL, etc.
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True, index=True)
    process_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("manufacturing_processes.id"), nullable=True, index=True)
    product_family: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(32), default="MEDIUM", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    difficulty: Mapped[str] = mapped_column(String(16), default="INTERMEDIATE", server_default="INTERMEDIATE", nullable=False)  # BEGINNER, INTERMEDIATE, ADVANCED
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # comma separated
    cover_media_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    estimated_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    # Mission settings for the trainee troubleshooting simulator (briefing, objective, xp, skills, enabled).
    simulation: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    current_published_version_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    # Relationships
    machine = relationship("Machine", foreign_keys=[machine_id])
    process = relationship("ManufacturingProcess", back_populates="troubleshooting_guides", foreign_keys=[process_id])
    owner = relationship("User", foreign_keys=[owner_id])
    versions: Mapped[List["TroubleshootingVersion"]] = relationship(
        "TroubleshootingVersion",
        back_populates="guide",
        cascade="all, delete-orphan",
        order_by="TroubleshootingVersion.version_number",
        foreign_keys="[TroubleshootingVersion.guide_id]",
    )


class TroubleshootingVersion(Base):
    """
    Versioned, immutable decision tree snapshot once published.
    Sessions strictly bind to a single immutable version.
    """
    __tablename__ = "troubleshooting_versions"
    __table_args__ = (
        UniqueConstraint("guide_id", "version_number", name="uq_troubleshooting_guide_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    guide_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_guides.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=GUIDE_STATUS_DRAFT, index=True, nullable=False)  # draft, in_review, published, withdrawn, superseded
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON or text summary
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    revision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    guide: Mapped["TroubleshootingGuide"] = relationship("TroubleshootingGuide", back_populates="versions", foreign_keys=[guide_id])
    author = relationship("User", foreign_keys=[author_id])
    nodes: Mapped[List["TroubleshootingNode"]] = relationship(
        "TroubleshootingNode",
        back_populates="version",
        cascade="all, delete-orphan",
        foreign_keys="[TroubleshootingNode.version_id]",
    )
    edges: Mapped[List["TroubleshootingEdge"]] = relationship(
        "TroubleshootingEdge",
        back_populates="version",
        cascade="all, delete-orphan",
        foreign_keys="[TroubleshootingEdge.version_id]",
        order_by="TroubleshootingEdge.sort_order",
    )
    sessions: Mapped[List["TroubleshootingSession"]] = relationship(
        "TroubleshootingSession",
        back_populates="guide_version",
    )


decision_tree_node_media = Table(
    "decision_tree_node_media", Base.metadata,
    Column("node_id", String(36), ForeignKey("troubleshooting_nodes.id", ondelete="CASCADE"), primary_key=True),
    Column("media_id", String(36), ForeignKey("media_assets.id", ondelete="CASCADE"), primary_key=True),
    Column("sort_order", Integer, server_default="0", nullable=False),
)


class TroubleshootingNode(Base):
    """
    Diagnostic node in a troubleshooting decision tree DAG.
    Types: check | question | action | stop | escalation | end.
    """
    __tablename__ = "troubleshooting_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_versions.id", ondelete="CASCADE"), nullable=True, index=True)
    case_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_cases.id", ondelete="CASCADE"), nullable=True, index=True)

    node_type: Mapped[str] = mapped_column(String(32), nullable=False)  # check, question, action, stop, escalation, end
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    instructions: Mapped[str] = mapped_column(Text, default="", nullable=False)
    safety_notice: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    safety_warning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_observation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    input_type: Mapped[str] = mapped_column(String(32), default="choice", nullable=False)  # yes_no, choice, numeric
    input_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON defining valid options or min/max
    cause_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # suspected, under_investigation, confirmed
    source_reference: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    linked_knowledge_version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("knowledge_versions.id", ondelete="SET NULL"), nullable=True)
    linked_workflow_version_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    is_start: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    outcome: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # resolved, unresolved, escalated

    # Canvas position for visual builder
    position_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    position_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    help_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Type-specific fields, e.g. ppe / possible_causes / recommended_actions / technical_terms.
    details: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    # expert | ai_draft | ai_reviewed. AI-drafted steps must be reviewed before submission.
    origin: Mapped[str] = mapped_column(String(16), default="expert", server_default="expert", nullable=False)

    # Backward compatibility fields
    is_root: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Migration 004 created this legacy column NOT NULL; default it so builder nodes can be inserted.
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")

    # Relationships
    version: Mapped[Optional["TroubleshootingVersion"]] = relationship("TroubleshootingVersion", back_populates="nodes", foreign_keys=[version_id])
    case: Mapped[Optional["TroubleshootingCase"]] = relationship("TroubleshootingCase", back_populates="nodes", foreign_keys=[case_id])
    outgoing_edges: Mapped[List["TroubleshootingEdge"]] = relationship(
        "TroubleshootingEdge",
        foreign_keys="[TroubleshootingEdge.from_node_id]",
        back_populates="from_node",
        cascade="all, delete-orphan",
        order_by="TroubleshootingEdge.sort_order",
    )
    incoming_edges: Mapped[List["TroubleshootingEdge"]] = relationship(
        "TroubleshootingEdge",
        foreign_keys="[TroubleshootingEdge.to_node_id]",
        back_populates="to_node",
        cascade="all, delete-orphan",
    )
    media_assets = relationship("MediaAsset", secondary=decision_tree_node_media, lazy="selectin")


class TroubleshootingEdge(Base):
    """
    Deterministic transition edge between diagnostic nodes.
    Conditions: JSON e.g. {"value": "yes"} or {"operator": "<", "value": 6.0}.
    """
    __tablename__ = "troubleshooting_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_versions.id", ondelete="CASCADE"), nullable=True, index=True)
    case_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_cases.id", ondelete="CASCADE"), nullable=True, index=True)
    from_node_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    # Null while an answer exists but its destination has not been chosen yet.
    to_node_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_nodes.id", ondelete="CASCADE"), nullable=True, index=True)
    condition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON condition rule
    label: Mapped[str] = mapped_column(String(128), nullable=False)  # "Yes", "No", "< 6.0 bar", etc.
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    # Relationships
    version: Mapped[Optional["TroubleshootingVersion"]] = relationship("TroubleshootingVersion", back_populates="edges", foreign_keys=[version_id])
    case: Mapped[Optional["TroubleshootingCase"]] = relationship("TroubleshootingCase", back_populates="edges", foreign_keys=[case_id])
    from_node: Mapped["TroubleshootingNode"] = relationship("TroubleshootingNode", foreign_keys=[from_node_id], back_populates="outgoing_edges")
    to_node: Mapped[Optional["TroubleshootingNode"]] = relationship("TroubleshootingNode", foreign_keys=[to_node_id], back_populates="incoming_edges")


class TroubleshootingSession(Base):
    """
    Audited runtime session of a trainee executing a troubleshooting decision tree.
    Permanently bound to the exact immutable guide_version_id it started with.
    """
    __tablename__ = "troubleshooting_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    guide_version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_versions.id"), nullable=True, index=True)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True, index=True)
    process_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("manufacturing_processes.id"), nullable=True, index=True)
    workflow_run_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("procedure_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    workflow_issue_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    problem_category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    reported_symptom: Mapped[str] = mapped_column(Text, nullable=False)
    current_node_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_nodes.id"), nullable=True)
    current_check_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    context: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    checks_snapshot: Mapped[Optional[List[dict]]] = mapped_column(JSON, default=list, nullable=True)
    source_refs: Mapped[Optional[List[dict]]] = mapped_column(JSON, default=list, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=SESSION_STATUS_IN_PROGRESS, index=True, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    guide_version: Mapped["TroubleshootingVersion"] = relationship("TroubleshootingVersion", back_populates="sessions", foreign_keys=[guide_version_id])
    machine = relationship("Machine", foreign_keys=[machine_id])
    current_node = relationship("TroubleshootingNode", foreign_keys=[current_node_id])
    responses: Mapped[List["TroubleshootingResponse"]] = relationship(
        "TroubleshootingResponse",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="TroubleshootingResponse.server_timestamp",
    )
    evidence: Mapped[List["TroubleshootingEvidence"]] = relationship(
        "TroubleshootingEvidence",
        back_populates="session",
        cascade="all, delete-orphan",
    )
    escalation: Mapped[Optional["TroubleshootingEscalation"]] = relationship(
        "TroubleshootingEscalation",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
    )


class TroubleshootingResponse(Base):
    """
    Audit-logged observation response submitted by an operator for a node.
    Stores the exact edge taken and server timestamp.
    """
    __tablename__ = "troubleshooting_responses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    node_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_nodes.id"), nullable=True, index=True)
    check_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    outcome: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    answer: Mapped[str] = mapped_column(Text, nullable=False)  # JSON-encoded operator observation
    server_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    edge_taken_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_edges.id"), nullable=True)

    # Relationships
    session: Mapped["TroubleshootingSession"] = relationship("TroubleshootingSession", back_populates="responses")
    node = relationship("TroubleshootingNode", foreign_keys=[node_id])
    edge_taken = relationship("TroubleshootingEdge", foreign_keys=[edge_taken_id])


class TroubleshootingEvidence(Base):
    """
    Photographic, audio, or document evidence attached to a troubleshooting session.
    Reuses shared media_assets table.
    """
    __tablename__ = "troubleshooting_evidence"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    media_asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("media_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    session: Mapped["TroubleshootingSession"] = relationship("TroubleshootingSession", back_populates="evidence")
    media_asset = relationship("MediaAsset", foreign_keys=[media_asset_id])


class TroubleshootingEscalation(Base):
    """
    Formal safety or unresolved diagnostic escalation record.
    Tracks assigned expert and resolution disposition.
    """
    __tablename__ = "troubleshooting_escalations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_sessions.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    assigned_expert_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True, nullable=False)  # pending, in_progress, resolved, rejected
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    session: Mapped["TroubleshootingSession"] = relationship("TroubleshootingSession", back_populates="escalation")
    assigned_expert = relationship("User", foreign_keys=[assigned_expert_id])


# Preserved legacy prototype model for backward compatibility
class TroubleshootingCase(Base, TimestampMixin):
    __tablename__ = "troubleshooting_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), index=True, nullable=False)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    symptom: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(32), default="MEDIUM", nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    nodes: Mapped[List["TroubleshootingNode"]] = relationship("TroubleshootingNode", back_populates="case", cascade="all, delete-orphan")
    edges: Mapped[List["TroubleshootingEdge"]] = relationship("TroubleshootingEdge", back_populates="case", cascade="all, delete-orphan")


class DecisionTreeAIDraft(Base):
    """Audit record of an AI generation or review request for a decision tree.

    AI output only ever lands in a draft version as ``origin="ai_draft"`` nodes;
    an expert must review those nodes before the version can be submitted.
    """
    __tablename__ = "decision_tree_ai_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    guide_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_guides.id", ondelete="CASCADE"), nullable=False, index=True)
    version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("troubleshooting_versions.id", ondelete="CASCADE"), nullable=True, index=True)
    requested_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # generate | review | assist
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # applied | completed | failed
    provider: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    source_refs: Mapped[Optional[List[dict]]] = mapped_column(JSON, default=list, nullable=True)
    result: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class MissionAttempt(Base):
    """A trainee's run of a published tree as a troubleshooting mission, pinned to one version."""
    __tablename__ = "mission_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    guide_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_guides.id", ondelete="CASCADE"), nullable=False, index=True)
    version_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_versions.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), default="in_progress", nullable=False, index=True)  # in_progress | completed | abandoned
    stage: Mapped[str] = mapped_column(String(16), default="investigate", nullable=False)  # investigate | diagnose | correct | verify | complete
    current_node_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    state: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    score: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    total_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    active_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    resumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class MissionAchievement(Base):
    __tablename__ = "mission_achievements"
    __table_args__ = (UniqueConstraint("user_id", "code", name="uq_mission_achievement_user_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    attempt_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mission_attempts.id", ondelete="SET NULL"), nullable=True)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
