from app.db.base import Base
from app.models.user import Role, Permission, RolePermission, User, UserPermission
from app.models.session import SessionModel
from app.models.audit import AuditLog
from app.models.machine import MachineCategory, Machine, Tool
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    ApprovalRecord,
    ReviewComment,
    KnowledgeArticle,
    KnowledgeRevision,
    KnowledgeAttachment,
    ReviewRecord,
    STATUS_DRAFT,
    STATUS_IN_REVIEW,
    STATUS_CHANGES_REQUESTED,
    STATUS_REJECTED,
    STATUS_APPROVED,
    STATUS_PUBLISHED,
    STATUS_SUPERSEDED,
    STATUS_WITHDRAWN,
    ALL_STATUSES,
    OPEN_DRAFT_STATUSES,
    EDITABLE_STATUSES,
    ORIGIN_EXPERT,
    ORIGIN_AI_DRAFT,
    ORIGIN_AI_DRAFT_EDITED,
    ALL_ORIGINS,
)
from app.models.procedure import Procedure, ProcedureStep, ProcedureRun, ProcedureRunStep
from app.models.troubleshooting import TroubleshootingCase, TroubleshootingNode, TroubleshootingEdge
from app.models.audio import AudioReference, AudioAnalysisJob
from app.models.simulation import SimulationScenario, SimulationAttempt
from app.models.learning import LearningPath, LearningItem, LearningAssignment
from app.models.notification import Notification
from app.models.media import (
    MediaAsset,
    KIND_AUDIO,
    KIND_VIDEO,
    KIND_IMAGE,
    KIND_DOCUMENT,
    ALL_KINDS,
)
from app.models.processing_job import ProcessingJob
from app.models.transcript import Transcript, TranscriptSegment
from app.models.embedding import KnowledgeEmbedding

__all__ = [
    "Base",
    "Role",
    "Permission",
    "RolePermission",
    "User",
    "UserPermission",
    "SessionModel",
    "AuditLog",
    "MachineCategory",
    "Machine",
    "Tool",
    "KnowledgeItem",
    "KnowledgeVersion",
    "ApprovalRecord",
    "ReviewComment",
    "KnowledgeArticle",
    "KnowledgeRevision",
    "KnowledgeAttachment",
    "ReviewRecord",
    "STATUS_DRAFT",
    "STATUS_IN_REVIEW",
    "STATUS_CHANGES_REQUESTED",
    "STATUS_REJECTED",
    "STATUS_APPROVED",
    "STATUS_PUBLISHED",
    "STATUS_SUPERSEDED",
    "STATUS_WITHDRAWN",
    "ALL_STATUSES",
    "OPEN_DRAFT_STATUSES",
    "EDITABLE_STATUSES",
    "ORIGIN_EXPERT",
    "ORIGIN_AI_DRAFT",
    "ORIGIN_AI_DRAFT_EDITED",
    "ALL_ORIGINS",
    "Procedure",
    "ProcedureStep",
    "ProcedureRun",
    "ProcedureRunStep",
    "TroubleshootingCase",
    "TroubleshootingNode",
    "TroubleshootingEdge",
    "AudioReference",
    "AudioAnalysisJob",
    "SimulationScenario",
    "SimulationAttempt",
    "LearningPath",
    "LearningItem",
    "LearningAssignment",
    "Notification",
    "MediaAsset",
    "KIND_AUDIO",
    "KIND_VIDEO",
    "KIND_IMAGE",
    "KIND_DOCUMENT",
    "ALL_KINDS",
    "ProcessingJob",
    "Transcript",
    "TranscriptSegment",
    "KnowledgeEmbedding",
]
