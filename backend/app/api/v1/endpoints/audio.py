import json
from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.base import utc_now
from app.core.permissions import (
    get_current_user,
    require_permission,
    AuthenticatedContext,
    PERM_AUDIO_ANALYZE,
)
from app.core.exceptions import NotFoundError
from app.models import AudioReference, AudioAnalysisJob, Machine
from app.schemas.audio import (
    AudioReferenceResponse,
    AudioAnalysisJobResponse,
    AudioSimulationAnalyzeRequest,
    CandidateScore,
)
from app.services.audio_service import AudioAnalysisService

router = APIRouter(prefix="/audio", tags=["Machine Audio"])


@router.get("/references", response_model=List[AudioReferenceResponse])
def list_audio_references(
    machine_id: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List baseline reference audio recordings with verified acoustic fault labels."""
    query = db.query(AudioReference)
    if machine_id:
        query = query.filter(AudioReference.machine_id == machine_id)
    refs = query.order_by(AudioReference.title).all()

    items = []
    for r in refs:
        mach = db.get(Machine, r.machine_id) if r.machine_id else None
        items.append(
            AudioReferenceResponse(
                id=r.id,
                title=r.title,
                machine_id=r.machine_id,
                machine_name=mach.name if mach else None,
                duration_seconds=r.duration_seconds,
                sample_rate=r.sample_rate,
                fault_label=r.fault_label,
                is_expert_verified=r.is_expert_verified,
                operating_conditions=r.operating_conditions,
                uploaded_by=r.uploaded_by,
                created_at=r.created_at,
            )
        )
    return items


@router.post("/analyze", response_model=AudioAnalysisJobResponse, status_code=status.HTTP_201_CREATED)
def analyze_machine_audio(
    payload: AudioSimulationAnalyzeRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_AUDIO_ANALYZE)),
    db: Session = Depends(get_db),
):
    """
    Submit audio for spectral feature comparison and calibrated reference matching.
    Includes full rejection policies for silence, ambiguous separation, and unknown sounds.
    """
    # Simulate feature profiles from live recordings or test scenarios
    scenario = payload.scenario.lower().strip()
    if scenario == "normal_spindle":
        features = {"centroid": 1450.0, "bandwidth": 1820.0, "rms": 0.048, "zcr": 0.070}
    elif scenario == "bearing_whine":
        features = {"centroid": 2810.0, "bandwidth": 950.0, "rms": 0.080, "zcr": 0.142}
    elif scenario == "cavitation":
        features = {"centroid": 3080.0, "bandwidth": 2350.0, "rms": 0.108, "zcr": 0.188}
    elif scenario == "silence":
        features = {"centroid": 200.0, "bandwidth": 300.0, "rms": 0.002, "zcr": 0.010}
    elif scenario == "ambient_noise":
        features = {"centroid": 800.0, "bandwidth": 3200.0, "rms": 0.030, "zcr": 0.050}
    elif scenario == "speech":
        features = {"centroid": 350.0, "bandwidth": 600.0, "rms": 0.022, "zcr": 0.025}
    else:
        # Default unknown anomalous machine sound
        features = {"centroid": 5800.0, "bandwidth": 3500.0, "rms": 0.090, "zcr": 0.320}

    # Fetch stored references from database
    stored_refs = db.query(AudioReference).all()
    ref_list = []
    for r in stored_refs:
        feat = json.loads(r.features_json) if r.features_json else {}
        mach = db.get(Machine, r.machine_id) if r.machine_id else None
        ref_list.append({
            "id": r.id,
            "title": r.title,
            "fault_label": r.fault_label,
            "machine_id": r.machine_id,
            "machine_name": mach.name if mach else None,
            "features": feat,
        })

    eval_result = AudioAnalysisService.evaluate_features(features, ref_list)

    matched_ref = eval_result["matched_ref"]
    job = AudioAnalysisJob(
        file_path=f"uploads/audio/{scenario}.wav",
        uploaded_by=auth_ctx.user.id,
        status=eval_result["status"],
        matched_reference_id=matched_ref["id"] if matched_ref else None,
        machine_id=matched_ref["machine_id"] if matched_ref else payload.machine_id,
        similarity_score=eval_result["score"],
        reason_code=eval_result["reason_code"],
        message=eval_result["message"],
        requires_expert_review=eval_result["requires_review"],
        candidate_scores_json=json.dumps(eval_result["candidates"]),
        completed_at=utc_now(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    candidates = [
        CandidateScore(
            reference_id=c["reference_id"],
            title=c["title"],
            fault_label=c["fault_label"],
            machine_name=c.get("machine_name"),
            similarity_score=c["similarity_score"],
            confidence_tier=c["confidence_tier"],
        )
        for c in eval_result["candidates"]
    ]

    mach = db.get(Machine, job.machine_id) if job.machine_id else None

    return AudioAnalysisJobResponse(
        id=job.id,
        status=job.status,
        matched_reference_id=job.matched_reference_id,
        matched_reference_title=matched_ref["title"] if matched_ref else None,
        fault_label=matched_ref["fault_label"] if matched_ref else None,
        machine_id=job.machine_id,
        machine_name=mach.name if mach else None,
        similarity_score=job.similarity_score,
        reason_code=job.reason_code,
        message=job.message,
        requires_expert_review=job.requires_expert_review,
        candidate_matches=candidates,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )
