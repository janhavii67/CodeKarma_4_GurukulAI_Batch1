"""Troubleshooting simulator (Mission Control): trainee missions built on published decision trees."""
from typing import List

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.permissions import (
    AuthenticatedContext,
    csrf_protect,
    require_any_permission,
    PERM_SIMULATION_ATTEMPT,
    PERM_TROUBLESHOOT_USE,
)
from app.db.session import get_db
from app.services import troubleshooting_simulator_service as sim

router = APIRouter(prefix="/simulator", tags=["Troubleshooting Simulator"])
player = require_any_permission(PERM_SIMULATION_ATTEMPT, PERM_TROUBLESHOOT_USE)
csrf = [Depends(csrf_protect)]


class StartRequest(BaseModel):
    restart: bool = False


class ActRequest(BaseModel):
    edge_id: str
    acknowledged: bool = False


class HintRequest(BaseModel):
    level: int = Field(..., ge=2, le=3)


class DiagnoseRequest(BaseModel):
    causes: List[str] = Field(..., min_length=1, max_length=20)


class CorrectRequest(BaseModel):
    actions: List[str] = Field(..., min_length=1, max_length=20)


class ExplainRequest(BaseModel):
    question: str = Field("", max_length=1000)


def _payload(db: Session, attempt) -> dict:
    return sim.attempt_payload(db, attempt)


@router.get("/missions")
def list_missions(auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return sim.list_missions(db, auth.user)


@router.get("/profile")
def profile(auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return sim.profile(db, auth.user)


@router.get("/missions/{guide_id}")
def mission_briefing(guide_id: str, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return sim.briefing(db, auth.user, guide_id)


@router.get("/missions/{guide_id}/leaderboard")
def mission_leaderboard(guide_id: str, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return sim.leaderboard(db, guide_id)


@router.post("/missions/{guide_id}/attempts", status_code=status.HTTP_201_CREATED, dependencies=csrf)
def start_mission(guide_id: str, payload: StartRequest, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.start_attempt(db, auth.user, guide_id, restart=payload.restart))


@router.get("/attempts/{attempt_id}")
def get_attempt(attempt_id: str, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.get_attempt(db, auth.user, attempt_id))


@router.post("/attempts/{attempt_id}/inspect", dependencies=csrf)
def inspect(attempt_id: str, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.perform(db, auth.user, attempt_id))


@router.post("/attempts/{attempt_id}/act", dependencies=csrf)
def act(attempt_id: str, payload: ActRequest, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.act(db, auth.user, attempt_id, payload.edge_id, acknowledged=payload.acknowledged))


@router.post("/attempts/{attempt_id}/hint", dependencies=csrf)
def hint(attempt_id: str, payload: HintRequest, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    attempt, text = sim.use_hint(db, auth.user, attempt_id, payload.level)
    return {"hint": text, "attempt": _payload(db, attempt)}


@router.post("/attempts/{attempt_id}/diagnose", dependencies=csrf)
def diagnose(attempt_id: str, payload: DiagnoseRequest, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.diagnose(db, auth.user, attempt_id, payload.causes))


@router.post("/attempts/{attempt_id}/correct", dependencies=csrf)
def correct(attempt_id: str, payload: CorrectRequest, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.correct_fault(db, auth.user, attempt_id, payload.actions))


@router.post("/attempts/{attempt_id}/verify", dependencies=csrf)
def verify(attempt_id: str, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.verify(db, auth.user, attempt_id))


@router.post("/attempts/{attempt_id}/pause", dependencies=csrf)
def pause(attempt_id: str, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.set_paused(db, auth.user, attempt_id, True))


@router.post("/attempts/{attempt_id}/resume", dependencies=csrf)
def resume(attempt_id: str, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.set_paused(db, auth.user, attempt_id, False))


@router.post("/attempts/{attempt_id}/abandon", dependencies=csrf)
def abandon(attempt_id: str, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    return _payload(db, sim.abandon(db, auth.user, attempt_id))


@router.post("/attempts/{attempt_id}/explain", dependencies=csrf)
def explain(attempt_id: str, payload: ExplainRequest, auth: AuthenticatedContext = Depends(player), db: Session = Depends(get_db)):
    from app.services.decision_tree_ai_service import explain_mission
    return explain_mission(db, auth.user, sim.get_attempt(db, auth.user, attempt_id), payload.question)
