from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_PUBLISHED
from app.models.machine import Machine, MachineCategory
from app.models.user import User
from app.modules.assistant.models import KnowledgeChunk, KnowledgeSource
from app.modules.assistant.providers.llm_base import LLMResponse
from app.modules.assistant.services.retrieval_service import RetrievalQuery, RetrievalService
from app.modules.assistant.services.indexing_service import IndexingService
from app.services.synthetic_demo import (
    SYNTHETIC_DEMO_MARKER,
    SYNTHETIC_MACHINE_CASES,
    build_restricted_synthetic_source_ref,
    build_synthetic_knowledge_draft,
)
from app.services.source_verification import prepare_source_refs_for_save
from scripts import seed_synthetic_machine_demo as seed_script


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    csrf = response.cookies.get(settings.CSRF_COOKIE_NAME)
    assert csrf
    return csrf


def _add_synthetic_machine(db: Session, case: dict[str, str]) -> Machine:
    if not db.get(MachineCategory, "SYNTHETIC-DEMO"):
        db.add(MachineCategory(id="SYNTHETIC-DEMO", name="Synthetic Demo", description=SYNTHETIC_DEMO_MARKER))
    machine = Machine(
        id=case["id"],
        name=f"{case['machine_name']} — {SYNTHETIC_DEMO_MARKER}",
        code=case["machine_code"],
        model_number=case["model_number"],
        serial_number=case["serial_number"],
        manufacturer=case["manufacturer"],
        category="SYNTHETIC-DEMO",
        is_demo=True,
        status="ACTIVE",
        location=SYNTHETIC_DEMO_MARKER,
    )
    db.add(machine)
    db.commit()
    return machine


def test_synthetic_seed_is_repeatable_and_refuses_unmarked_or_unsafe_targets(tmp_path: Path, monkeypatch):
    demo_path = tmp_path / "isolated" / "gurukul_synthetic_demo.db"
    monkeypatch.setattr(seed_script, "SYNTHETIC_DEMO_DB_PATH", demo_path)
    monkeypatch.setattr(settings, "ENVIRONMENT", "synthetic-demo")
    monkeypatch.setenv("GURUKUL_SYNTHETIC_DEMO", "1")
    monkeypatch.setenv("SYNTHETIC_DEMO_AUTHOR_PASSWORD", "DemoAuthorPassword#2026")
    monkeypatch.setenv("SYNTHETIC_DEMO_REVIEWER_PASSWORD", "DemoReviewerPassword#2026")
    monkeypatch.setenv("SYNTHETIC_DEMO_TRAINEE_PASSWORD", "DemoTraineePassword#2026")

    first = seed_script.seed_demo_database()
    second = seed_script.seed_demo_database()
    assert first["machines"] == 4 and first["users"] == 3
    assert second["machines"] == second["users"] == second["roles"] == 0
    assert seed_script._has_valid_marker(demo_path)

    from sqlalchemy import create_engine, func
    from sqlalchemy.orm import Session as SQLAlchemySession

    engine = create_engine(f"sqlite:///{demo_path.as_posix()}")
    try:
        with SQLAlchemySession(engine) as db:
            machines = db.query(Machine).all()
            assert {machine.code for machine in machines} == {case["machine_code"] for case in SYNTHETIC_MACHINE_CASES}
            assert len({machine.id for machine in machines}) == 4
            assert all(machine.is_demo and SYNTHETIC_DEMO_MARKER in machine.name for machine in machines)
            assert db.query(func.count(KnowledgeItem.id)).scalar() == 0
    finally:
        engine.dispose()

    unsafe = tmp_path / "unmarked.db"
    unsafe.write_bytes(b"not a Gurukul demo database")
    with pytest.raises(RuntimeError, match="fixed synthetic demo SQLite path"):
        seed_script.seed_demo_database(unsafe)
    assert unsafe.read_bytes() == b"not a Gurukul demo database"
    assert seed_script.reset_demo_database() is True
    assert not demo_path.exists()


def test_seed_requires_explicit_demo_environment(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.delenv("GURUKUL_SYNTHETIC_DEMO", raising=False)
    with pytest.raises(RuntimeError, match="GURUKUL_SYNTHETIC_DEMO=1"):
        seed_script.seed_demo_database()


@pytest.mark.parametrize("case", SYNTHETIC_MACHINE_CASES, ids=lambda case: case["key"])
def test_synthetic_knowledge_lifecycle_is_machine_scoped_and_cited(
    case: dict[str, str],
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    monkeypatch.setenv("GURUKUL_SYNTHETIC_DEMO", "1")
    monkeypatch.setattr("app.modules.assistant.services.retrieval_service.settings.RETRIEVAL_MODE", "keyword")
    machine = _add_synthetic_machine(db_session, case)
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()

    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    preview_response = client.get(f"/api/v1/knowledge/synthetic-demo/templates/{machine.id}")
    assert preview_response.status_code == 200, preview_response.text
    preview = preview_response.json()
    assert preview["machine_id"] == machine.id
    assert SYNTHETIC_DEMO_MARKER in preview["title"]
    assert SYNTHETIC_DEMO_MARKER in preview["source_refs"][0]["source_title"]
    assert preview["source_refs"][0]["pdf_pages"] == [case["page"]]
    assert db_session.query(KnowledgeItem).filter_by(machine_id=machine.id).count() == 0

    create_response = client.post("/api/v1/knowledge", headers={settings.CSRF_HEADER_NAME: author_csrf}, json=preview)
    assert create_response.status_code == 201, create_response.text
    created = create_response.json()
    version_id = created["version"]["id"]
    item = db_session.get(KnowledgeItem, created["id"])
    version = db_session.get(KnowledgeVersion, version_id)
    assert item.is_demo is True and item.author_id == author.id
    assert created["machine_id"] == machine.id and version.machine_id == machine.id
    assert version.created_by == author.id and version.status == "draft"
    assert "\n\n" in version.content and SYNTHETIC_DEMO_MARKER in version.content
    assert version.source_refs[0]["verification"]["audience_clearance"] == "demo_only"
    assert version.source_refs[0]["verification"]["verified_by_user_id"] == author.id
    assert item.current_published_version_id is None
    assert db_session.query(KnowledgeSource).filter_by(knowledge_version_id=version_id).first() is None

    _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    assert client.get(f"/api/v1/knowledge/{item.id}").status_code in (403, 404)
    assert RetrievalService.retrieve_chunks(
        RetrievalQuery(query=case["machine_code"], user_id=trainee.id, machine_id=machine.id), db_session
    ) == []
    assert client.get(f"/api/v1/knowledge/synthetic-demo/templates/{machine.id}").status_code in (401, 403)

    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    submitted = client.post(f"/api/v1/knowledge/{item.id}/submit", headers={settings.CSRF_HEADER_NAME: author_csrf})
    assert submitted.status_code == 200, submitted.text
    self_review = client.post(
        f"/api/v1/reviews/{item.id}/decision",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
        json={"decision": "APPROVED", "comments": "Self-review must be refused."},
    )
    assert self_review.status_code in (403, 404)
    assert db_session.get(KnowledgeVersion, version_id).status != STATUS_PUBLISHED

    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    approved = client.post(
        f"/api/v1/reviews/{item.id}/decision",
        headers={settings.CSRF_HEADER_NAME: reviewer_csrf},
        json={"decision": "APPROVED", "comments": "Reviewed synthetic fixture only."},
    )
    assert approved.status_code == 200, approved.text
    db_session.expire_all()
    item = db_session.get(KnowledgeItem, item.id)
    version = db_session.get(KnowledgeVersion, version_id)
    assert version.status == STATUS_PUBLISHED and item.current_published_version_id == version.id
    source = db_session.query(KnowledgeSource).filter_by(knowledge_version_id=version.id).one()
    assert source.machine_id == machine.id and source.status == "published"
    chunks = db_session.query(KnowledgeChunk).filter_by(source_id=source.id, is_active=True).all()
    assert chunks
    citation_chunk = next(chunk for chunk in chunks if case["page"] in chunk.text)
    assert case["document_id"] in citation_chunk.text
    assert case["page"] in citation_chunk.text and SYNTHETIC_DEMO_MARKER in citation_chunk.text

    retrieved = RetrievalService.retrieve_chunks(
        RetrievalQuery(query=f"{case['machine_code']} source matching training statement", user_id=trainee.id, machine_id=machine.id),
        db_session,
    )
    assert any(row.source_id == source.id and row.machine_id == machine.id for row in retrieved)
    assert RetrievalService.retrieve_chunks(
        RetrievalQuery(query=f"{case['machine_code']} source matching training statement", user_id=trainee.id, machine_id="another-machine"),
        db_session,
    ) == []

    class CitationProvider:
        def generate(self, _request):
            return LLMResponse(
                f"The synthetic source says to match {case['machine_code']} and retain its fictional page reference. [CHUNK:{citation_chunk.id}]",
                "mock",
                "synthetic-demo-test",
                1,
            )

    monkeypatch.setattr("app.services.ai_orchestrator.ai_orchestrator._llm_factory", lambda _provider=None: CitationProvider())
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    tutor = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"message": f"What source-matching training statement is in the synthetic {case['machine_name']} record?", "machine_id": machine.id},
    )
    assert tutor.status_code == 200, tutor.text
    tutor_body = tutor.json()
    assert tutor_body["insufficient_evidence"] is False
    assert any(row["source_id"] == source.id and row["machine_id"] == machine.id for row in tutor_body["sources"])
    assert any(case["page"] in (row.get("section_label") or row.get("section") or "") for row in tutor_body["sources"])

    unsupported = RetrievalService.retrieve_chunks(
        RetrievalQuery(query="Beam voltage?", user_id=trainee.id, machine_id=machine.id),
        db_session,
    )
    assert unsupported == []
    missing_evidence = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"message": "Beam voltage?", "machine_id": machine.id},
    )
    assert missing_evidence.status_code == 200, missing_evidence.text
    assert missing_evidence.json()["insufficient_evidence"] is True
    assert missing_evidence.json()["sources"] == []
    assert "verified" in missing_evidence.json()["answer"].casefold()


@pytest.mark.parametrize("case", SYNTHETIC_MACHINE_CASES, ids=lambda case: case["key"])
def test_restricted_synthetic_source_cannot_be_submitted_or_seen_by_trainee(
    case: dict[str, str],
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    monkeypatch.setenv("GURUKUL_SYNTHETIC_DEMO", "1")
    machine = _add_synthetic_machine(db_session, case)
    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    draft = build_synthetic_knowledge_draft(machine, db=db_session)
    draft["source_refs"] = [build_restricted_synthetic_source_ref(machine, db=db_session)]
    created = client.post("/api/v1/knowledge", headers={settings.CSRF_HEADER_NAME: author_csrf}, json=draft)
    assert created.status_code == 201, created.text
    item_id = created.json()["id"]

    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    assert client.get(f"/api/v1/knowledge/{item_id}").status_code in (403, 404)
    assert not any(row["id"] == item_id for row in client.get("/api/v1/knowledge").json()["items"])
    assert RetrievalService.retrieve_chunks(
        RetrievalQuery(query="restricted fixture source", user_id=trainee.id, machine_id=machine.id), db_session
    ) == []

    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    submission = client.post(f"/api/v1/knowledge/{item_id}/submit", headers={settings.CSRF_HEADER_NAME: author_csrf})
    assert submission.status_code in (400, 422)
    assert db_session.query(KnowledgeSource).filter_by(knowledge_version_id=created.json()["version"]["id"]).first() is None


def test_demo_only_source_is_blocked_outside_demo_environment(db_session: Session, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    monkeypatch.setenv("GURUKUL_SYNTHETIC_DEMO", "1")
    case = SYNTHETIC_MACHINE_CASES[0]
    machine = _add_synthetic_machine(db_session, case)
    source_refs = build_synthetic_knowledge_draft(machine, db=db_session)["source_refs"]
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    with pytest.raises(ValidationError, match="isolated synthetic demo database"):
        prepare_source_refs_for_save(source_refs, machine_id=machine.id, db=db_session, user=db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one())


def test_synthetic_machine_retrieval_does_not_cross_contaminate_published_demo_items(
    db_session: Session,
    monkeypatch,
):
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    monkeypatch.setenv("GURUKUL_SYNTHETIC_DEMO", "1")
    monkeypatch.setattr("app.modules.assistant.services.retrieval_service.settings.RETRIEVAL_MODE", "keyword")
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()
    published_sources = {}

    for case in SYNTHETIC_MACHINE_CASES[:2]:
        machine = _add_synthetic_machine(db_session, case)
        template = build_synthetic_knowledge_draft(machine, db=db_session)
        item = KnowledgeItem(
            title=template["title"],
            machine_id=machine.id,
            author_id=author.id,
            is_demo=True,
            category="GENERAL",
        )
        db_session.add(item)
        db_session.flush()
        version = KnowledgeVersion(
            item_id=item.id,
            title=item.title,
            version_no=1,
            status=STATUS_PUBLISHED,
            origin="expert",
            machine_id=machine.id,
            summary=template["summary"],
            content=template["content"],
            common_mistakes=template["common_mistakes"],
            source_refs=template["source_refs"],
            created_by=author.id,
            author_id=author.id,
            published_at=datetime.now(timezone.utc),
        )
        db_session.add(version)
        db_session.flush()
        item.current_published_version_id = version.id
        db_session.commit()
        source = IndexingService.index_knowledge_version(version.id, db_session, user_id=author.id)
        published_sources[case["key"]] = (machine, source)

    ct_machine, ct_source = published_sources["ctscan11"]
    mri_machine, mri_source = published_sources["mri"]
    ct_results = RetrievalService.retrieve_chunks(
        RetrievalQuery(
            query="SYNTH-DEMO-CT-01 exact synthetic source model reference",
            user_id=trainee.id,
            machine_id=ct_machine.id,
        ),
        db_session,
    )
    mri_results = RetrievalService.retrieve_chunks(
        RetrievalQuery(
            query="SYNTH-DEMO-CT-01 exact synthetic source model reference",
            user_id=trainee.id,
            machine_id=mri_machine.id,
        ),
        db_session,
    )
    assert any(result.source_id == ct_source.id for result in ct_results)
    assert all(result.source_id != ct_source.id for result in mri_results)
    assert all(result.machine_id == mri_machine.id for result in mri_results)
