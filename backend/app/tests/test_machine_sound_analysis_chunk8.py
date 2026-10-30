import io
import json
import tempfile

import numpy as np
import pytest
import soundfile as sf

from app.core.config import settings
from app.db.base import utc_now
from app.integrations.storage import set_storage_service
from app.integrations.storage.local import LocalStorageService
from app.models.audio import AudioAnalysisJob, AudioReference
from app.models.machine import Machine
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.models.user import User
from app.modules.assistant.models import KnowledgeChunk, KnowledgeSource, SOURCE_TYPE_KNOWLEDGE_VERSION
from app.services.audio_service import AudioInputError, FEATURE_VERSION, compare_features, extract_features


def _wav(frequency: float = 440.0, duration: float = 1.2, sample_rate: int = 16_000) -> bytes:
    t = np.arange(int(duration * sample_rate), dtype=np.float32) / sample_rate
    audio = 0.45 * np.sin(2 * np.pi * frequency * t)
    out = io.BytesIO()
    sf.write(out, audio, sample_rate, format="WAV", subtype="PCM_16")
    return out.getvalue()


def _flac(frequency: float = 440.0, duration: float = 1.2, sample_rate: int = 16_000) -> bytes:
    t = np.arange(int(duration * sample_rate), dtype=np.float32) / sample_rate
    audio = 0.45 * np.sin(2 * np.pi * frequency * t)
    out = io.BytesIO()
    sf.write(out, audio, sample_rate, format="FLAC")
    return out.getvalue()


def _login(client, email: str, password: str) -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return client.get("/api/v1/auth/csrf").json()["csrf_token"]


def _published_source(db, author: User, machine_id: str | None = None):
    item = KnowledgeItem(title="Approved Spindle Inspection", category="MAINTENANCE", machine_id=machine_id, author_id=author.id, status="APPROVED")
    db.add(item)
    db.flush()
    version = KnowledgeVersion(
        item_id=item.id, version_no=1, title=item.title, machine_id=machine_id, status="published", origin="expert",
        created_by=author.id, summary="Documented spindle inspection observation and escalation guidance.",
        content="Compare the operating sound to this approved machine reference and contact a supervisor if the sound differs.",
        published_at=utc_now(), source_refs=[], steps=[],
    )
    db.add(version)
    db.flush()
    item.current_published_version_id = version.id
    db.commit()
    return item, version


def _machine(db_session, code: str = "MACH-CT12") -> Machine:
    machine = db_session.query(Machine).filter(Machine.code == code, Machine.is_active.is_(True)).first()
    if machine is None:
        machine = Machine(name="CT-Scan", code=code, category="Medical Imaging", status="ACTIVE", is_active=True)
        db_session.add(machine)
        db_session.flush()
    return machine


def _mock_audio_observation(monkeypatch):
    monkeypatch.setattr(
        "app.api.v1.endpoints.audio._observe_audio",
        lambda _features, _machine: "A steady, low-pitched tone is audible.",
    )


@pytest.fixture
def audio_storage():
    temp = tempfile.TemporaryDirectory()
    previous = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = temp.name
    storage = LocalStorageService(temp.name)
    set_storage_service(storage)
    yield storage
    set_storage_service(None)
    settings.MEDIA_ROOT = previous
    temp.cleanup()


def test_decoded_log_mel_profile_and_similarity_are_deterministic():
    left = extract_features(_wav(440))
    same = extract_features(_wav(440))
    other = extract_features(_wav(1_200))
    assert left["version"] == FEATURE_VERSION
    assert len(left["vector"]) == 48 + 16  # mel bands + rhythm (modulation) bands
    assert left["normalized_sample_rate"] == 16_000
    result = compare_features(left, [
        {"feature_version": FEATURE_VERSION, "features_json": json.dumps({"version": same["version"], "vector": same["vector"]}), "title": "same"},
        {"feature_version": FEATURE_VERSION, "features_json": json.dumps({"version": other["version"], "vector": other["vector"]}), "title": "other"},
    ])
    assert result["candidates"][0]["title"] == "same"
    assert result["candidates"][0]["similarity_score"] == 1.0
    assert "MATCHED" == result["status"]
    assert extract_features(_flac())["mime"] == "audio/flac"
    normalized = left["normalized_audio_wav"]
    assert normalized[:4] == b"RIFF"
    assert normalized[8:12] == b"WAVE"
    assert left["normalized_sample_rate"] == 16_000


def test_audio_observation_uses_normalized_audio_and_falls_back_when_provider_fails(monkeypatch):
    from types import SimpleNamespace
    from app.api.v1.endpoints import audio as audio_endpoint

    features = extract_features(_wav())
    captured = {}

    def observe(request):
        captured["request"] = request
        return SimpleNamespace(status="succeeded", result="A steady tone is audible.", error_code=None)

    monkeypatch.setattr(audio_endpoint.ai_orchestrator, "execute", observe)
    assert audio_endpoint._observe_audio(features, SimpleNamespace(name="CT-Scan")) == "A steady tone is audible."
    request = captured["request"].payload
    assert request.media_parts[0]["mime_type"] == "audio/wav"
    assert request.media_parts[0]["data"][:4] == b"RIFF"
    assert "Do not label the machine normal, faulty" in request.prompt

    def fail(_request):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(audio_endpoint.ai_orchestrator, "execute", fail)
    assert audio_endpoint._observe_audio(features, SimpleNamespace(name="CT-Scan")) is None


def test_similarly_scored_approved_references_are_ambiguous_not_a_match():
    features = extract_features(_wav())
    ref = {"feature_version": FEATURE_VERSION, "features_json": json.dumps({"version": features["version"], "vector": features["vector"]})}
    result = compare_features(features, [dict(ref, title="reference one"), dict(ref, title="reference two")])
    assert result["status"] == "AMBIGUOUS_MATCH"
    assert result["matched_reference"] is None
    assert result["reason_code"] == "CLOSE_REFERENCE_SCORES"


def test_audio_validation_rejects_corrupt_empty_silent_and_short_uploads():
    for data, code in [(b"not audio", "unsupported_audio_format"), (b"", "empty_audio"), (_wav(440, 0.2), "audio_too_short")]:
        with pytest.raises(AudioInputError) as error:
            extract_features(data)
        assert error.value.code == code
    silence = io.BytesIO()
    sf.write(silence, np.zeros(20_000, dtype=np.float32), 16_000, format="WAV", subtype="PCM_16")
    with pytest.raises(AudioInputError) as error:
        extract_features(silence.getvalue())
    assert error.value.code == "silent_audio"


def test_analyze_upload_returns_clear_size_and_format_errors(client, db_session, audio_storage, monkeypatch):
    _mock_audio_observation(monkeypatch)
    machine_id = _machine(db_session).id
    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    no_csrf = client.post(
        "/api/v1/audio/analyze",
        data={"machine_id": machine_id},
        files={"file": ("machine.wav", _wav(), "audio/wav")},
    )
    assert no_csrf.status_code == 403
    assert no_csrf.json()["error"]["code"] == "csrf_failed"
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 32)
    oversized = client.post(
        "/api/v1/audio/analyze",
        data={"machine_id": machine_id},
        files={"file": ("large.wav", b"x" * 33, "audio/wav")},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "payload_too_large"

    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 100 * 1024 * 1024)
    malformed = client.post(
        "/api/v1/audio/analyze",
        data={"machine_id": machine_id},
        files={"file": ("broken.wav", b"not audio", "audio/wav")},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "unsupported_audio_format"

    flac = client.post(
        "/api/v1/audio/analyze",
        data={"machine_id": machine_id},
        files={"file": ("machine.flac", _flac(), "audio/flac")},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert flac.status_code == 201, flac.text
    assert flac.json()["status"] == "NO_RELIABLE_MATCH"
    assert flac.json()["audio_observation"] == "A steady, low-pitched tone is audible."
    assert flac.json()["processing_metadata"]["normalized_sample_rate"] == 16_000
    job = db_session.get(AudioAnalysisJob, flac.json()["id"])
    assert job.audio_sha256
    assert job.file_path is None
    assert job.submission_media_id is None
    assert not [path for path in audio_storage.media_root.rglob("*") if path.is_file()]
    assert db_session.query(AudioAnalysisJob).count() == 1


def test_audio_matching_service_failure_does_not_create_a_result(client, db_session, monkeypatch):
    _mock_audio_observation(monkeypatch)
    machine_id = _machine(db_session).id
    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)

    def fail_comparison(*_args, **_kwargs):
        raise RuntimeError("internal matching details must not leak")

    monkeypatch.setattr("app.api.v1.endpoints.audio.compare_features", fail_comparison)
    response = client.post(
        "/api/v1/audio/analyze",
        data={"machine_id": machine_id},
        files={"file": ("machine.wav", _wav(), "audio/wav")},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "audio_engine_error"
    assert "internal matching details" not in response.text
    assert db_session.query(AudioAnalysisJob).count() == 0


def test_feature_version_mismatch_is_not_reported_as_a_match():
    result = compare_features(extract_features(_wav()), [
        {"feature_version": "old-profile", "features_json": json.dumps({"version": "old-profile", "vector": [1]})}
    ])
    assert result["status"] == "FAILED"
    assert result["reason_code"] == "REFERENCE_FEATURES_UNAVAILABLE"
    assert result["matched_reference"] is None


def test_audio_matching_publishes_only_peer_approved_references_and_is_owner_scoped(client, db_session, audio_storage, monkeypatch):
    _mock_audio_observation(monkeypatch)
    machine_id = _machine(db_session).id
    expert_a = db_session.query(User).filter_by(email=settings.EXPERT_A_EMAIL).one()
    expert_b = db_session.query(User).filter_by(email=settings.EXPERT_B_EMAIL).one()
    trainee_email = settings.TRAINEE_EMAIL
    source_item, source_version = _published_source(db_session, expert_b, machine_id)
    source_version_id = source_version.id

    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    headers = {settings.CSRF_HEADER_NAME: author_csrf}
    data = {
        "title": "VF-2 idle acoustic reference",
        "interpretation": "Expert recorded a steady idle sound under the listed conditions.",
        "source_version_ids": source_version_id,
        "machine_id": machine_id,
        "operation": "idle",
        "operating_conditions": "No cutting operation.",
    }
    created = client.post("/api/v1/audio/references", data=data, files={"file": ("reference.wav", _wav(), "audio/wav")}, headers=headers)
    assert created.status_code == 201, created.text
    reference_id = created.json()["id"]
    item_id = created.json()["knowledge_item_id"]
    assert created.json()["status"] == "draft"
    assert client.get("/api/v1/audio/references").json() == []

    submitted = client.post(f"/api/v1/audio/references/{reference_id}/submit", headers=headers)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "in_review"
    assert client.get("/api/v1/audio/references").json() == []

    self_review = client.post(f"/api/v1/reviews/{item_id}/decision", json={"decision": "APPROVED"}, headers=headers)
    assert self_review.status_code == 403
    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    published = client.post(
        f"/api/v1/reviews/{item_id}/decision",
        json={"decision": "APPROVED", "comments": "Compared with the approved source and recording."},
        headers={settings.CSRF_HEADER_NAME: reviewer_csrf},
    )
    assert published.status_code == 200, published.text
    assert db_session.get(AudioReference, reference_id).status == "published"
    assert db_session.get(KnowledgeItem, item_id).current_published_version_id == db_session.get(AudioReference, reference_id).knowledge_version_id

    library = client.get("/api/v1/audio/references")
    assert library.status_code == 200
    assert len(library.json()) == 1
    assert library.json()[0]["source_references"][0]["knowledge_version_id"] == source_version_id

    stored_reference = db_session.get(AudioReference, reference_id)
    stored_reference.feature_version = "old_log_profile"
    db_session.commit()
    reprocessed = client.post(f"/api/v1/audio/references/{reference_id}/reprocess", headers={settings.CSRF_HEADER_NAME: reviewer_csrf})
    assert reprocessed.status_code == 200, reprocessed.text
    assert reprocessed.json()["feature_version"] == FEATURE_VERSION

    operator_csrf = _login(client, trainee_email, settings.TRAINEE_PASSWORD)
    match = client.post("/api/v1/audio/analyze", data={"machine_id": machine_id}, files={"file": ("query.wav", _wav(), "audio/wav")}, headers={settings.CSRF_HEADER_NAME: operator_csrf})
    assert match.status_code == 201, match.text
    result = match.json()
    assert result["status"] == "MATCHED"
    assert result["matched_reference"]["reference_id"] == reference_id
    assert result["matched_reference"]["similarity_score"] == 1.0
    assert any(source["knowledge_version_id"] == source_version_id for source in result["matched_reference"]["knowledge_sources"])
    assert "not a diagnosis" in result["limitation"].lower()

    # Audio follow-up retrieval is constrained to the exact approved reference;
    # only its job ID is linked to the chat message, never the uploaded bytes.
    reference_version_id = result["matched_reference"]["knowledge_version_id"]
    reference_source = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id=item_id,
        knowledge_version_id=reference_version_id,
        title="VF-2 idle acoustic reference",
        machine_id=machine_id,
        status="published",
    )
    db_session.add(reference_source)
    db_session.flush()
    reference_chunk = KnowledgeChunk(
        source_id=reference_source.id,
        chunk_index=0,
        text="The approved VF-2 idle sound reference describes the documented spindle observation. Escalate if the sound differs from this reference.",
        token_count=20,
        is_active=True,
    )
    db_session.add(reference_chunk)
    db_session.commit()

    trainee_csrf = _login(client, trainee_email, settings.TRAINEE_PASSWORD)
    explanation = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={
            "message": "Explain what the documented sound observation may indicate. Do not claim it is a confirmed fault.",
            "audio_analysis_job_id": result["id"],
        },
    )
    assert explanation.status_code == 200, explanation.text
    explanation_data = explanation.json()
    assert explanation_data["audio_analysis"]["id"] == result["id"]
    assert explanation_data["audio_analysis"]["matched_reference"]["reference_id"] == reference_id
    assert [source["chunk_id"] for source in explanation_data["sources"]] == [reference_chunk.id]
    assert explanation_data["sources"][0]["title"] == "VF-2 idle acoustic reference"
    history = client.get(f"/api/v1/assistant/conversations/{explanation_data['conversation_id']}")
    assert history.status_code == 200
    restored = next(message for message in history.json()["messages"] if message["id"] == explanation_data["message_id"])
    assert restored["audio_analysis"]["id"] == result["id"]
    assert restored["audio_analysis"]["matched_reference"]["reference_id"] == reference_id

    streamed = client.post(
        "/api/v1/assistant/chat/stream",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={
            "message": "Summarize the approved sound observation and clearly label the match as possible.",
            "conversation_id": explanation_data["conversation_id"],
            "audio_analysis_job_id": result["id"],
        },
    )
    assert streamed.status_code == 200, streamed.text
    sources_line = next(line for line in streamed.text.splitlines() if line.startswith("data: {") and "audio_analysis" in line)
    streamed_sources = json.loads(sources_line.removeprefix("data: "))
    assert streamed_sources["audio_analysis"]["id"] == result["id"]
    assert [source["chunk_id"] for source in streamed_sources["sources"]] == [reference_chunk.id]
    streamed_history = client.get(f"/api/v1/assistant/conversations/{explanation_data['conversation_id']}")
    assert streamed_history.status_code == 200
    streamed_answer = next(message for message in streamed_history.json()["messages"] if message["id"] == streamed_sources["message_id"])
    assert streamed_answer["audio_analysis"]["id"] == result["id"]
    assert db_session.get(AudioAnalysisJob, result["id"]).file_path is None
    assert db_session.get(AudioAnalysisJob, result["id"]).submission_media_id is None

    # An analysis result and its source/audio identifiers cannot be enumerated across users.
    other_csrf = _login(client, "operator@demo.local", "Operator@Gurukul2026!")
    forbidden_result = client.get(f"/api/v1/audio/analysis-jobs/{result['id']}", headers={settings.CSRF_HEADER_NAME: other_csrf})
    assert forbidden_result.status_code == 404
    forbidden_chat = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: other_csrf},
        json={"message": "Explain this audio", "audio_analysis_job_id": result["id"]},
    )
    assert forbidden_chat.status_code == 404

    revision_author_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    revision = client.post(
        f"/api/v1/audio/references/{reference_id}/revisions",
        data={"title": "VF-2 idle acoustic reference", "interpretation": "Expert reviewed a later recording of the same documented operation.", "source_version_ids": source_version_id},
        files={"file": ("reference-revision.wav", _wav(600), "audio/wav")},
        headers={settings.CSRF_HEADER_NAME: revision_author_csrf},
    )
    assert revision.status_code == 201, revision.text
    new_reference_id = revision.json()["id"]
    new_item_id = revision.json()["knowledge_item_id"]
    assert revision.json()["status"] == "draft"
    assert client.get("/api/v1/audio/references").json()[0]["id"] == reference_id
    submitted_revision = client.post(f"/api/v1/audio/references/{new_reference_id}/submit", headers={settings.CSRF_HEADER_NAME: revision_author_csrf})
    assert submitted_revision.status_code == 200, submitted_revision.text
    _login(client, "admin@demo.local", "Admin@Gurukul2026!")
    revision_approved = client.post(
        f"/api/v1/reviews/{new_item_id}/decision",
        json={"decision": "APPROVED", "comments": "Reviewed revised recording."},
        headers={settings.CSRF_HEADER_NAME: client.get("/api/v1/auth/csrf").json()["csrf_token"]},
    )
    assert revision_approved.status_code == 200, revision_approved.text
    assert db_session.get(AudioReference, reference_id).status == "superseded"
    assert db_session.get(AudioReference, new_reference_id).status == "published"
    assert [row["id"] for row in client.get("/api/v1/audio/references").json()] == [new_reference_id]
    refreshed_analysis = client.get(f"/api/v1/audio/analysis-jobs/{result['id']}")
    assert refreshed_analysis.status_code == 200, refreshed_analysis.text
    assert refreshed_analysis.json()["status"] == "NO_RELIABLE_MATCH"
    assert refreshed_analysis.json()["reason_code"] == "REFERENCE_REVISION_CHANGED"
    assert refreshed_analysis.json()["matched_reference"] is None
    assert refreshed_analysis.json()["candidate_matches"] == []
    _login(client, trainee_email, settings.TRAINEE_PASSWORD)
    stale_history = client.get(f"/api/v1/assistant/conversations/{explanation_data['conversation_id']}")
    assert stale_history.status_code == 200
    stale_answer = next(message for message in stale_history.json()["messages"] if message["id"] == explanation_data["message_id"])
    assert stale_answer["audio_analysis"]["reason_code"] == "REFERENCE_REVISION_CHANGED"
    assert stale_answer["sources"] == []
    assert "no longer current" in stale_answer["content"]


def test_operator_can_submit_unmatched_sample_without_auto_promoting_it(client, db_session, audio_storage, monkeypatch):
    _mock_audio_observation(monkeypatch)
    machine_id = _machine(db_session).id
    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    sample = _wav(3_000)
    analyzed = client.post("/api/v1/audio/analyze", data={"machine_id": machine_id}, files={"file": ("machine.wav", sample, "audio/wav")}, headers={settings.CSRF_HEADER_NAME: csrf})
    assert analyzed.status_code == 201, analyzed.text
    result = analyzed.json()
    assert result["status"] == "NO_RELIABLE_MATCH"
    assert result["candidate_matches"] == []

    def unexpected_model_call(*_args, **_kwargs):
        pytest.fail("An unmatched audio result must not invoke language-model generation.")

    monkeypatch.setattr("app.api.v1.endpoints.assistant.ai_orchestrator.execute", unexpected_model_call)
    recorded = client.post(
        "/api/v1/assistant/chat",
        json={
            "message": "Save this machine audio comparison result. Do not diagnose a fault or suggest a procedure.",
            "audio_analysis_job_id": result["id"],
        },
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert recorded.status_code == 200, recorded.text
    recorded_data = recorded.json()
    assert recorded_data["audio_analysis"]["id"] == result["id"]
    assert recorded_data["audio_analysis"]["status"] == "NO_RELIABLE_MATCH"
    assert recorded_data["answer"] == "Audio comparison saved. No fault diagnosis was generated."
    assert recorded_data["sources"] == []
    assert recorded_data["insufficient_evidence"] is False

    history = client.get(f"/api/v1/assistant/conversations/{recorded_data['conversation_id']}")
    assert history.status_code == 200
    saved = next(message for message in history.json()["messages"] if message["id"] == recorded_data["message_id"])
    assert saved["audio_analysis"]["status"] == "NO_RELIABLE_MATCH"
    assert saved["content"] == "Audio comparison saved. No fault diagnosis was generated."

    streamed = client.post(
        "/api/v1/assistant/chat/stream",
        json={
            "message": "Save the same comparison result without diagnosis.",
            "conversation_id": recorded_data["conversation_id"],
            "audio_analysis_job_id": result["id"],
        },
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert streamed.status_code == 200, streamed.text
    assert '"status": "NO_RELIABLE_MATCH"' in streamed.text or '"status":"NO_RELIABLE_MATCH"' in streamed.text
    assert "event: done" in streamed.text

    submitted = client.post(
        f"/api/v1/audio/analysis-jobs/{result['id']}/submit-review",
        files={"file": ("machine.wav", sample, "audio/wav")},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert submitted.status_code == 201, submitted.text
    job = db_session.get(AudioAnalysisJob, result["id"])
    assert job.review_status == "pending"
    assert db_session.query(AudioReference).filter(AudioReference.status == "published").count() == 0

    # Wrong owner cannot fetch or submit the private sample, including by its ID.
    _login(client, "operator@demo.local", "Operator@Gurukul2026!")
    inaccessible = client.get(f"/api/v1/audio/media/{job.submission_media_id}")
    assert inaccessible.status_code == 404
    csrf2 = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    deletion = client.delete(f"/api/v1/audio/analysis-jobs/{result['id']}/submission", headers={settings.CSRF_HEADER_NAME: csrf2})
    assert deletion.status_code == 204


def test_permissions_block_reference_authoring_for_trainees(client, audio_storage):
    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    response = client.post(
        "/api/v1/audio/references",
        data={"title": "Unauthorized", "interpretation": "No", "source_version_ids": "missing"},
        files={"file": ("ref.wav", _wav(), "audio/wav")},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert response.status_code == 403


def test_rhythm_features_prevent_false_match_between_similar_spectra():
    """The noisy turbine-blade chip used to MATCH the syringe pump step skip on spectrum alone (0.918)."""
    from pathlib import Path
    from app.services.audio_service import compare_features, extract_features, FEATURE_VERSION

    samples = Path(__file__).resolve().parents[2] / "test_audio_samples"
    references = []
    for path in sorted(samples.glob("[0-9][0-9]_*.wav")):
        features = extract_features(path.read_bytes(), path.name)
        references.append({"id": path.name[:2], "feature_version": FEATURE_VERSION,
                           "features_json": json.dumps({"version": features["version"], "vector": features["vector"]})})

    def match(name):
        path = next(samples.glob(f"{name}_*.wav"))
        return compare_features(extract_features(path.read_bytes(), path.name), references)

    turbine = match("T14")
    assert turbine["status"] != "MATCHED"
    assert [candidate["id"] for candidate in turbine["candidates"]].index("14") <= 1
    for query, expected in (("T01", "01"), ("T04", "04"), ("T06", "06")):
        result = match(query)
        assert result["status"] == "MATCHED", (query, result["reason_code"])
        assert result["matched_reference"]["id"] == expected
