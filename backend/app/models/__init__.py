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
)
from app.models.procedure import Procedure, ProcedureStep, ProcedureRun, ProcedureRunStep
from app.models.troubleshooting import TroubleshootingCase, TroubleshootingNode, TroubleshootingEdge
from app.models.audio import AudioReference, AudioAnalysisJob
from app.models.simulation import SimulationScenario, SimulationAttempt
from app.models.learning import LearningPath, LearningItem, LearningAssignment
from app.models.notification import Notification
from app.models.media import MediaAsset
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
    "ProcessingJob",
    "Transcript",
    "TranscriptSegment",
    "KnowledgeEmbedding",
]
