import json
from datetime import timezone, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_PUBLISHED
from app.models.machine import Machine
from app.models.user import User
from app.modules.assistant.services.indexing_service import IndexingService
from app.modules.assistant.services.machine_context import resolve_machine_context
from app.modules.assistant.services.retrieval_service import RetrievalQuery, RetrievalService
from app.modules.assistant.models import ChatConversation, KnowledgeChunk, KnowledgeSource
from app.modules.assistant.providers.llm_base import LLMResponse


def _login(
    client: TestClient,
    email: str = settings.TRAINEE_EMAIL,
    password: str = settings.TRAINEE_PASSWORD,
) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    token = response.cookies.get(settings.CSRF_COOKIE_NAME)
    assert token
    return token


def _machine_knowledge(db: Session, machine: Machine, expert: User, unique_text: str):
    item = KnowledgeItem(
        title=f"{machine.name} Overview {unique_text}",
        machine_id=None,
        author_id=expert.id,
    )
    db.add(item)
    db.flush()
    version = KnowledgeVersion(
        item_id=item.id,
        title=item.title,
        version_no=1,
        status=STATUS_PUBLISHED,
        origin="expert",
        machine_id=machine.id,
        summary=f"Published {unique_text} machine overview.",
        content=f"Purpose: {unique_text} system overview.\n\nMain components: documented components for {unique_text}.\n\nLimits: refer to the approved manufacturer manual.",
        created_by=expert.id,
        author_id=expert.id,
        published_at=datetime.now(timezone.utc),
    )
    db.add(version)
    db.flush()
    item.current_published_version_id = version.id
    db.commit()
    source = IndexingService.index_knowledge_version(version.id, db, user_id=expert.id)
    return item, version, source


def test_version_machine_mapping_and_multiline_knowledge_reach_retrieval(db_session: Session, monkeypatch):
    monkeypatch.setattr("app.modules.assistant.services.retrieval_service.settings.RETRIEVAL_MODE", "keyword")
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    machine = Machine(id="test-ct-machine", name="CT Scan Unit", code="CT-SCAN-TEST-01", status="ACTIVE")
    db_session.add(machine)
    db_session.commit()

    item, version, source = _machine_knowledge(db_session, machine, expert, "ctmultilineproof")
    chunk = db_session.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).one()

    assert item.author_id == expert.id
    assert version.created_by == expert.id
    assert version.machine_id == machine.id
    assert source.machine_id == machine.id
    assert "Main components:" in chunk.text and "\n\nLimits:" in chunk.text

    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()
    results = RetrievalService.retrieve_chunks(
        RetrievalQuery(query="ctmultilineproof main components", user_id=trainee.id, machine_id=machine.id),
        db_session,
    )
    assert any(result.source_id == source.id and result.machine_id == machine.id for result in results)


@pytest.mark.parametrize(
    ("name", "question"),
    [
        ("CT-SCAN11", "What does the CT scan machine do?"),
        ("MRI scanner", "Explain the MRI equipment."),
        ("Xray unit", "How does the X-ray machine work?"),
        ("ECG monitor", "What does this ECG machine do?"),
    ],
)
def test_supported_equipment_names_resolve_to_registered_machine(db_session: Session, name: str, question: str):
    machine = Machine(name=name, code=f"MACHINE-{name.replace(' ', '-').upper()}", status="ACTIVE")
    db_session.add(machine)
    db_session.commit()

    resolved = resolve_machine_context(db_session, question)

    assert resolved.machine_id == machine.id
    assert resolved.clarification is None


def test_machine_filter_does_not_return_another_machine_knowledge(db_session: Session, monkeypatch):
    monkeypatch.setattr("app.modules.assistant.services.retrieval_service.settings.RETRIEVAL_MODE", "keyword")
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()
    ct = Machine(id="test-ct-isolation", name="CT Scan Unit", code="CT-SCAN-ISOLATION", status="ACTIVE")
    mri = Machine(id="test-mri-isolation", name="MRI Scanner", code="MRI-ISOLATION", status="ACTIVE")
    db_session.add_all([ct, mri])
    db_session.commit()
    _ct_item, _ct_version, ct_source = _machine_knowledge(db_session, ct, expert, "isolationcttoken")
    _mri_item, _mri_version, mri_source = _machine_knowledge(db_session, mri, expert, "isolationmritoken")
    unassigned = KnowledgeItem(title="Unassigned machine overview isolationglobal", author_id=expert.id)
    db_session.add(unassigned)
    db_session.flush()
    unassigned_version = KnowledgeVersion(
        item_id=unassigned.id,
        title=unassigned.title,
        version_no=1,
        status=STATUS_PUBLISHED,
        origin="expert",
        summary="General machine overview isolationglobal.",
        created_by=expert.id,
        published_at=datetime.now(timezone.utc),
    )
    db_session.add(unassigned_version)
    db_session.flush()
    unassigned.current_published_version_id = unassigned_version.id
    db_session.commit()
    unassigned_source = IndexingService.index_knowledge_version(unassigned_version.id, db_session, user_id=expert.id)

    results = RetrievalService.retrieve_chunks(
        RetrievalQuery(query="machine overview", user_id=trainee.id, machine_id=mri.id),
        db_session,
    )
    returned_source_ids = {result.source_id for result in results}
    assert mri_source.id in returned_source_ids
    assert ct_source.id not in returned_source_ids
    assert unassigned_source.id not in returned_source_ids


def test_tutor_infers_registered_machine_and_keeps_it_for_follow_up(client: TestClient, db_session: Session, monkeypatch):
    monkeypatch.setattr("app.modules.assistant.services.retrieval_service.settings.RETRIEVAL_MODE", "keyword")
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    machine = Machine(id="test-ct-tutor", name="CT Scan Unit", code="CT-SCAN-TUTOR-01", status="ACTIVE")
    db_session.add(machine)
    db_session.commit()
    _item, _version, source = _machine_knowledge(db_session, machine, expert, "cttutorproof")
    chunk = db_session.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).first()
    assert chunk is not None

    class CitationProvider:
        def generate(self, _request):
            return LLMResponse(
                f"The published overview identifies the purpose and components. [CHUNK:{chunk.id}]",
                "synthetic",
                "synthetic-model",
                1,
            )

    monkeypatch.setattr("app.services.ai_orchestrator.ai_orchestrator._llm_factory", lambda _provider=None: CitationProvider())
    machine_filters = []
    original_retrieve = RetrievalService.retrieve_chunks

    def recording_retrieve(query, db):
        machine_filters.append(query.machine_id)
        return original_retrieve(query, db)

    monkeypatch.setattr("app.api.v1.endpoints.assistant.RetrievalService.retrieve_chunks", recording_retrieve)
    csrf = _login(client)
    first = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "What does the CT scan machine do?"},
    )
    assert first.status_code == 200, first.text
    assert first.json()["insufficient_evidence"] is False
    assert any(row["machine_id"] == machine.id for row in first.json()["sources"])
    conversation_id = first.json()["conversation_id"]
    conversation = db_session.get(ChatConversation, conversation_id)
    assert conversation.machine_id == machine.id
    db_session.add(Machine(id="test-ct-tutor-second", name="CT Scan Unit B", code="CT-SCAN-TUTOR-02", status="ACTIVE"))
    db_session.commit()

    follow_up = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "Summarize the main CT scan components.", "conversation_id": conversation_id},
    )
    assert follow_up.status_code == 200, follow_up.text
    assert machine_filters == [machine.id, machine.id]


def test_tutor_asks_for_registered_machine_when_name_is_ambiguous(client: TestClient, db_session: Session):
    first_machine = Machine(id="test-ct-ambiguous-a", name="CT Scan Unit A", code="CT-SCAN-A", status="ACTIVE")
    second_machine = Machine(id="test-ct-ambiguous-b", name="CT Scanner Unit B", code="CT-SCAN-B", status="ACTIVE")
    db_session.add_all([first_machine, second_machine])
    db_session.commit()
    csrf = _login(client)

    response = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "What does the CT scan machine do?"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["insufficient_evidence"] is True
    assert "Which machine" in response.json()["answer"]
    assert "CT Scan Unit A" in response.json()["answer"]
    assert "CT Scanner Unit B" in response.json()["answer"]


def test_streaming_tutor_asks_for_registered_machine_when_name_is_ambiguous(client: TestClient, db_session: Session):
    db_session.add_all([
        Machine(id="test-ct-stream-a", name="CT Scan Unit A", code="CT-STREAM-A", status="ACTIVE"),
        Machine(id="test-ct-stream-b", name="CT Scanner Unit B", code="CT-STREAM-B", status="ACTIVE"),
    ])
    db_session.commit()
    csrf = _login(client)

    response = client.post(
        "/api/v1/assistant/chat/stream",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "What does the CT scan machine do?"},
    )
    assert response.status_code == 200, response.text
    streamed_answer = "".join(
        json.loads(line.removeprefix("data: "))["token"]
        for line in response.text.splitlines()
        if line.startswith("data: {") and '"token"' in line
    )
    assert "Which machine do you mean?" in streamed_answer
    assert "CT Scan Unit A" in streamed_answer
    assert "CT Scanner Unit B" in streamed_answer
    assert '"insufficient_evidence": true' in response.text


def test_tutor_does_not_search_unrelated_machines_for_unregistered_machine_mention(client: TestClient, monkeypatch):
    retrieval_called = False

    def unexpected_retrieval(*_args, **_kwargs):
        nonlocal retrieval_called
        retrieval_called = True
        return []

    monkeypatch.setattr("app.api.v1.endpoints.assistant.RetrievalService.retrieve_chunks", unexpected_retrieval)
    csrf = _login(client)
    response = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "What does the CT scan machine do?"},
    )
    assert response.status_code == 200, response.text
    assert "couldn't match CT scan to a registered machine" in response.json()["answer"]
    assert response.json()["sources"] == []
    assert retrieval_called is False


@pytest.mark.parametrize(
    ("machine_name", "machine_code", "machine_model"),
    [
        ("CT-SCAN 11", "TEST-CT-SCAN-11", "SYNTHETIC-CT-MODEL"),
        ("MRI", "TEST-MRI", "SYNTHETIC-MRI-MODEL"),
        ("ECG", "TEST-ECG", "SYNTHETIC-ECG-MODEL"),
        ("Xray", "TEST-XRAY", "SYNTHETIC-XRAY-MODEL"),
    ],
)
def test_expert_machine_draft_review_publication_and_tutor_retrieval(
    client: TestClient,
    db_session: Session,
    monkeypatch,
    machine_name: str,
    machine_code: str,
    machine_model: str,
):
    """Synthetic drafts for each registered machine label use the explicit review/index flow."""
    monkeypatch.setattr("app.modules.assistant.services.retrieval_service.settings.RETRIEVAL_MODE", "keyword")
    machine = Machine(
        id=f"test-authoring-{machine_code.lower()}",
        name=machine_name,
        code=machine_code,
        model_number=machine_model,
        manufacturer="Test fixture only",
        category="Medical Equipment",
        status="ACTIVE",
    )
    db_session.add(machine)
    db_session.commit()

    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    content = (
        "Test fixture content only; it is not a machine procedure.\n"
        "Purpose marker: zircon calibration reference.\n\n"
        "Component marker: fixture coil alpha.\n"
        "Source: SAMPLE-CH5-001, revision 1, page 1."
    )
    create_response = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
        json={
            "title": "Machine Authoring Flow Test",
            "machine_id": machine.id,
            "summary": "Deterministic test record.",
            "description": "Draft test description.\nSecond line.",
            "content": content,
            "operating_conditions": "Fixture condition one.\nFixture condition two.",
            "prerequisites": "Test prerequisite A.\nTest prerequisite B.",
            "safety_warnings": "Test warning only.\nNo real safety instructions.",
            "common_mistakes": "Test symptom.\nPossible cause: UNKNOWN.",
            "corrective_actions": "No action; test fixture only.",
            "source_refs": [{
                "type": "document",
                "source_title": "TEST SOURCE ONLY",
                "revision": "fixture revision 2",
                "pdf_pages": [1, 2],
                "printed_pages": [1],
                "section": "Fixture section",
                "verification": {
                    "status": "verified",
                    "audience_clearance": "trainee_authorized",
                    "source_provenance": "Isolated test fixture",
                    "source_manufacturer": "Test fixture only",
                    "source_model": machine_model,
                    "machine_manufacturer": "Test fixture only",
                    "machine_model": machine_model,
                    "machine_identity_basis": "trusted_registry",
                    "machine_identity_reference": "Isolated test machine record",
                },
            }],
        },
    )
    assert create_response.status_code == 201, create_response.text
    created = create_response.json()
    version_id = created["version"]["id"]
    assert created["author_id"] == author.id
    assert created["machine_id"] == machine.id
    assert created["version"]["created_by"] == author.id
    assert created["version"]["content"] == content
    assert created["version"]["operating_conditions"] == "Fixture condition one.\nFixture condition two."
    assert created["version"]["prerequisites"] == "Test prerequisite A.\nTest prerequisite B."
    assert created["version"]["safety_warnings"] == "Test warning only.\nNo real safety instructions."
    assert created["version"]["common_mistakes"] == "Test symptom.\nPossible cause: UNKNOWN."
    assert created["version"]["corrective_actions"] == "No action; test fixture only."
    assert created["version"]["source_refs"][0]["source_title"] == "TEST SOURCE ONLY"

    # The author can still save all version fields through the existing draft API.
    updated_content = content + "\n\nFollow-up line remains separate."
    update_response = client.patch(
        f"/api/v1/knowledge/{created['id']}",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
        json={
            "version_id": version_id,
            "machine_id": machine.id,
            "content": updated_content,
            "operating_conditions": "Updated condition.\nSecond updated line.",
            "prerequisites": "Updated prerequisite.\nSecond prerequisite.",
            "safety_warnings": "Updated test warning.\nStill fixture only.",
            "common_mistakes": "Updated symptom.\nCause status remains unconfirmed.",
            "corrective_actions": "Updated test action.\nNo real machine action.",
            "source_refs": [{
                "type": "document",
                "source_title": "TEST SOURCE ONLY",
                "revision": "fixture revision 2",
                "pdf_pages": [1, 2],
                "printed_pages": [1],
                "section": "Updated fixture section",
                "verification": {
                    "status": "verified",
                    "audience_clearance": "trainee_authorized",
                    "source_provenance": "Isolated test fixture",
                    "source_manufacturer": "Test fixture only",
                    "source_model": machine_model,
                    "machine_manufacturer": "Test fixture only",
                    "machine_model": machine_model,
                    "machine_identity_basis": "trusted_registry",
                    "machine_identity_reference": "Isolated test machine record",
                },
            }],
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()["version"]
    assert updated["content"] == updated_content
    assert updated["operating_conditions"] == "Updated condition.\nSecond updated line."
    assert updated["prerequisites"] == "Updated prerequisite.\nSecond prerequisite."
    assert updated["safety_warnings"] == "Updated test warning.\nStill fixture only."
    assert updated["common_mistakes"] == "Updated symptom.\nCause status remains unconfirmed."
    assert updated["corrective_actions"] == "Updated test action.\nNo real machine action."
    assert updated["source_refs"][0]["section"] == "Updated fixture section"

    _login(client)
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()
    private_draft = client.get(f"/api/v1/knowledge/{created['id']}")
    assert private_draft.status_code in (403, 404)
    assert db_session.query(KnowledgeSource).filter_by(knowledge_version_id=version_id).first() is None
    assert RetrievalService.retrieve_chunks(
        RetrievalQuery(query="zircon calibration reference", user_id=trainee.id, machine_id=machine.id),
        db_session,
    ) == []

    # Only a different, authorized expert can approve; approval indexes this version.
    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    submit_response = client.post(
        f"/api/v1/knowledge/{created['id']}/submit",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
    )
    assert submit_response.status_code == 200, submit_response.text
    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    review_response = client.post(
        f"/api/v1/reviews/{created['id']}/decision",
        headers={settings.CSRF_HEADER_NAME: reviewer_csrf},
        json={"decision": "APPROVED", "comments": "Reviewed deterministic test fixture."},
    )
    assert review_response.status_code == 200, review_response.text

    db_session.expire_all()
    saved_item = db_session.get(KnowledgeItem, created["id"])
    saved_version = db_session.get(KnowledgeVersion, version_id)
    assert saved_item.author_id == author.id
    assert saved_item.current_published_version_id == version_id
    assert saved_version.status == STATUS_PUBLISHED
    source = db_session.query(KnowledgeSource).filter_by(knowledge_version_id=version_id).one()
    assert source.machine_id == machine.id and source.status == "published"
    chunks = db_session.query(KnowledgeChunk).filter_by(source_id=source.id, is_active=True).all()
    content_chunk = next(chunk for chunk in chunks if (chunk.section_label or "").startswith("Content"))
    assert "Purpose marker: zircon calibration reference." in content_chunk.text
    assert "\n\nComponent marker: fixture coil alpha." in content_chunk.text
    assert "Source document: TEST SOURCE ONLY" in content_chunk.text
    assert "PDF page(s) 1, 2" in content_chunk.text

    retrieved = RetrievalService.retrieve_chunks(
        RetrievalQuery(query="zircon calibration reference", user_id=trainee.id, machine_id=machine.id),
        db_session,
    )
    assert any(result.source_id == source.id and result.machine_id == machine.id for result in retrieved)
    assert RetrievalService.retrieve_chunks(
        RetrievalQuery(query="zircon calibration reference", user_id=trainee.id, machine_id="other-machine-id"),
        db_session,
    ) == []

    # The Tutor response uses the published retrieval result and includes its citation.
    content_chunk = next(chunk for chunk in chunks if (chunk.section_label or "").startswith("Content"))

    class CitationProvider:
        def generate(self, _request):
            return LLMResponse(
                f"The test record contains the cited marker. [CHUNK:{content_chunk.id}]",
                "synthetic",
                "synthetic-model",
                1,
            )

    monkeypatch.setattr(
        "app.services.ai_orchestrator.ai_orchestrator._llm_factory",
        lambda _provider=None: CitationProvider(),
    )
    trainee_csrf = _login(client)
    tutor_response = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"message": "What is the zircon calibration reference?", "machine_id": machine.id},
    )
    assert tutor_response.status_code == 200, tutor_response.text
    tutor_body = tutor_response.json()
    assert tutor_body["insufficient_evidence"] is False
    assert any(row["source_id"] == source.id and row["machine_id"] == machine.id for row in tutor_body["sources"])
    assert any("PDF page(s) 1, 2" in row["section_label"] for row in tutor_body["sources"])


def test_ecg_manual_preview_is_not_persisted_until_expert_explicitly_saves(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    excerpt = (
        "[Source PDF page 78; printed page 70]\n"
        "3.20 ECG test excerpt.\n\n"
        "Definition retained as source text.\n"
        "[Source PDF page 81; printed page 73]\n"
        "Preparation and care text remains multiline."
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.knowledge._extract_uga_ecg_manual_excerpt",
        lambda: excerpt,
    )
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    expert_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    response = client.get(
        "/api/v1/knowledge/import-candidates/uganda-ecg-training-manual",
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["machine_id"] is None
    assert preview["content"] == excerpt
    source_ref = preview["source_refs"][0]
    assert source_ref["source_import_key"] == "uga_ecg_training_manual_ecg001_100_01"
    assert source_ref["pdf_pages"] == [13, 78, 79, 80, 81]
    assert source_ref["printed_pages"] == [5, 70, 71, 72, 73]
    assert db_session.query(KnowledgeItem).filter_by(title=preview["title"]).count() == 0

    # Only the Expert's explicit save action creates the author-owned draft.
    save_response = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: expert_csrf},
        json=preview,
    )
    assert save_response.status_code == 201, save_response.text
    candidate = save_response.json()
    version = candidate["version"]
    assert candidate["author_id"] == expert.id
    assert candidate["machine_id"] is None
    assert version["machine_id"] is None
    assert version["status"] == "draft"
    assert version["content"] == excerpt
    assert version["source_refs"] == preview["source_refs"]
    assert candidate["current_published_version_id"] is None
    assert version["submitted_at"] is None
    assert db_session.query(KnowledgeSource).filter_by(knowledge_version_id=version["id"]).first() is None

    trainee_csrf = _login(client)
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()
    assert client.get(f"/api/v1/knowledge/{candidate['id']}").status_code in (403, 404)
    assert RetrievalService.retrieve_chunks(
        RetrievalQuery(query="ECG test excerpt", user_id=trainee.id), db_session
    ) == []

    # Previewing again remains read-only and does not create duplicate rows.
    _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    repeated = client.get(
        "/api/v1/knowledge/import-candidates/uganda-ecg-training-manual",
    )
    assert repeated.status_code == 200, repeated.text
    assert db_session.query(KnowledgeItem).filter_by(id=candidate["id"]).count() == 1

    other_expert_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    unauthorized_edit = client.patch(
        f"/api/v1/knowledge/{candidate['id']}",
        headers={settings.CSRF_HEADER_NAME: other_expert_csrf},
        json={"version_id": version["id"], "content": "attempted unauthorized edit"},
    )
    assert unauthorized_edit.status_code in (403, 404)
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    unauthorized_preview = client.get(
        "/api/v1/knowledge/import-candidates/uganda-ecg-training-manual",
    )
    assert unauthorized_preview.status_code == 403
    assert db_session.query(KnowledgeItem).filter_by(id=candidate["id"]).count() == 1
