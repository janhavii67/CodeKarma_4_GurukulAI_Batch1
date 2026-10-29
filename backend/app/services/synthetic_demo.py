"""Isolated, non-operational synthetic data for the Tutor workflow demo."""

import os
from pathlib import Path
from typing import Any, Optional

from app.core.config import BACKEND_DIR, settings


SYNTHETIC_DEMO_ENVIRONMENT = "synthetic-demo"
SYNTHETIC_DEMO_MARKER = "SYNTHETIC DEMO DATA — NOT FOR REAL MACHINE OPERATION"
SYNTHETIC_DEMO_CODE_PREFIX = "SYNTH-DEMO-"
SYNTHETIC_DEMO_DB_PATH = BACKEND_DIR / "data" / "synthetic_demo" / "gurukul_synthetic_demo.db"


SYNTHETIC_MACHINE_CASES = (
    {
        "key": "ctscan11",
        "id": "d15c0000-0000-4000-8000-000000000001",
        "machine_name": "CT-SCAN 11",
        "machine_code": "SYNTH-DEMO-CT-01",
        "manufacturer": "DEMO-MFG-CT-01",
        "model_number": "DEMO-MODEL-CT-01",
        "serial_number": "DEMO-SERIAL-CT-01",
        "document_id": "SYNTH-DOC-CT-01",
        "page": "SYNTHETIC PAGE CT-01",
        "section": "Fictional source matching example CT-01",
    },
    {
        "key": "mri",
        "id": "d15c0000-0000-4000-8000-000000000002",
        "machine_name": "MRI",
        "machine_code": "SYNTH-DEMO-MRI-01",
        "manufacturer": "DEMO-MFG-MRI-01",
        "model_number": "DEMO-MODEL-MRI-01",
        "serial_number": "DEMO-SERIAL-MRI-01",
        "document_id": "SYNTH-DOC-MRI-01",
        "page": "SYNTHETIC PAGE MRI-01",
        "section": "Fictional source matching example MRI-01",
    },
    {
        "key": "ecg",
        "id": "d15c0000-0000-4000-8000-000000000003",
        "machine_name": "ECG",
        "machine_code": "SYNTH-DEMO-ECG-01",
        "manufacturer": "DEMO-MFG-ECG-01",
        "model_number": "DEMO-MODEL-ECG-01",
        "serial_number": "DEMO-SERIAL-ECG-01",
        "document_id": "SYNTH-DOC-ECG-01",
        "page": "SYNTHETIC PAGE ECG-01",
        "section": "Fictional source matching example ECG-01",
    },
    {
        "key": "xray",
        "id": "d15c0000-0000-4000-8000-000000000004",
        "machine_name": "Xray",
        "machine_code": "SYNTH-DEMO-XRAY-01",
        "manufacturer": "DEMO-MFG-XRAY-01",
        "model_number": "DEMO-MODEL-XRAY-01",
        "serial_number": "DEMO-SERIAL-XRAY-01",
        "document_id": "SYNTH-DOC-XRAY-01",
        "page": "SYNTHETIC PAGE XRAY-01",
        "section": "Fictional source matching example XRAY-01",
    },
)


def case_for_machine_code(code: Optional[str]) -> Optional[dict[str, str]]:
    return next((case for case in SYNTHETIC_MACHINE_CASES if case["machine_code"] == code), None)


def synthetic_demo_environment_enabled(db: Any = None) -> bool:
    """Allow synthetic behavior only with an explicit flag and isolated SQLite DB."""
    enabled = os.environ.get("GURUKUL_SYNTHETIC_DEMO") == "1"
    environment = str(settings.ENVIRONMENT).casefold()
    if not enabled or environment not in {SYNTHETIC_DEMO_ENVIRONMENT, "test"}:
        return False
    if db is None:
        return environment == SYNTHETIC_DEMO_ENVIRONMENT

    try:
        bind = db.get_bind()
        database_url = getattr(bind, "url", None) or bind.engine.url
        if not database_url.drivername.startswith("sqlite"):
            return False
        database = database_url.database
    except (AttributeError, TypeError):
        return False

    # In-memory databases are allowed only as disposable test fixtures.
    if database in (None, "", ":memory:"):
        return environment == "test"
    if environment != SYNTHETIC_DEMO_ENVIRONMENT:
        return False
    return Path(database).resolve() == SYNTHETIC_DEMO_DB_PATH.resolve()


def is_synthetic_demo_machine(
    machine: Any,
    *,
    db: Any = None,
    require_demo_environment: bool = True,
) -> bool:
    if not machine or not bool(getattr(machine, "is_demo", False)):
        return False
    case = case_for_machine_code(getattr(machine, "code", None))
    if not case:
        return False
    if require_demo_environment and not synthetic_demo_environment_enabled(db):
        return False
    return True


def build_synthetic_knowledge_draft(machine: Any, *, db: Any = None) -> dict[str, Any]:
    """Build a private, high-level sample draft; contains no device instructions."""
    case = case_for_machine_code(getattr(machine, "code", None))
    if not case or not is_synthetic_demo_machine(machine, db=db):
        raise ValueError("A machine from the isolated synthetic demo registry is required.")

    machine_label = f"{SYNTHETIC_DEMO_MARKER} — {case['machine_name']}"
    title = f"{machine_label} — Source Review Example"
    training_statement = (
        f"Training statement: Match the exact synthetic machine identifier {case['machine_code']} and model "
        "to the source metadata, then retain its fictional page or section reference."
    )
    purpose_statement = (
        f"Synthetic purpose label: This fictional {case['machine_name']} record demonstrates source review "
        "and citation handling only."
    )
    common_mistakes = {
        "ctscan11": "Common-mistake example: Treating a document title that says CT as proof it matches a specific scanner is a source-review error.",
        "mri": "Common-mistake example: Assuming a revision label grants trainee access without checking its clearance is a source-review error.",
        "ecg": "Common-mistake example: Collapsing line breaks can make an extracted training statement harder to compare with its cited passage.",
        "xray": "Common-mistake example: Citing a document identifier without its fictional page or section reference makes the example incomplete.",
    }
    common_mistake = common_mistakes[case["key"]]
    non_operational = (
        "This fixture contains no real operating, clinical, maintenance, repair, tolerance, or safety guidance."
    )
    content = "\n\n".join((SYNTHETIC_DEMO_MARKER, purpose_statement, training_statement, common_mistake, non_operational))
    source_title = f"{SYNTHETIC_DEMO_MARKER} — {case['machine_name']} Training Reference"
    source_ref = {
        "type": "document",
        "synthetic_demo": True,
        "source_title": source_title,
        "manual_number": case["document_id"],
        "revision": "SYNTHETIC REVISION 1 (fictional)",
        "pdf_pages": [case["page"]],
        "printed_pages": [f"FICTIONAL PRINTED PAGE {case['key'].upper()}-A"],
        "section": case["section"],
        "verification": {
            "status": "verified",
            "audience_clearance": "demo_only",
            "source_provenance": "Synthetic fixture generated for an isolated workflow demo; no source document exists.",
            "source_manufacturer": case["manufacturer"],
            "source_model": case["model_number"],
            "machine_manufacturer": case["manufacturer"],
            "machine_model": case["model_number"],
            "machine_identity_basis": "trusted_registry",
            "machine_identity_reference": "Synthetic demo registry row only; not real equipment evidence.",
        },
    }

    question = (
        f"What source-matching training statement is in the synthetic {case['machine_name']} record?"
    )
    expected_answer = (
        f"{training_statement} {non_operational}"
    )
    unsupported_question = "Beam voltage?"

    return {
        "title": title,
        "machine_id": machine.id,
        "category": "GENERAL",
        "tags": "synthetic_demo,not_for_machine_operation",
        "summary": f"{SYNTHETIC_DEMO_MARKER}. Fictional source-review and citation example only.",
        "content": content,
        "common_mistakes": f"{SYNTHETIC_DEMO_MARKER}\n{common_mistake}",
        "source_refs": [source_ref],
        "demo_questions": [
            {
                "id": f"{case['key']}-source-match",
                "question": question,
                "expected_grounded_answer": expected_answer,
                "expects_evidence": True,
            },
            {
                "id": f"{case['key']}-unsupported-setting",
                "question": unsupported_question,
                "expected_grounded_answer": (
                    f"The Tutor should say the synthetic knowledge base has no verified information for {case['machine_name']} "
                    "and request an appropriate source; it must not provide a real setting."
                ),
                "expects_evidence": False,
            },
        ],
    }


def build_restricted_synthetic_source_ref(machine: Any, *, db: Any = None) -> dict[str, Any]:
    """A non-publishable restricted source fixture for isolated access tests."""
    case = case_for_machine_code(getattr(machine, "code", None))
    if not case or not is_synthetic_demo_machine(machine, db=db):
        raise ValueError("A machine from the isolated synthetic demo registry is required.")
    return {
        "type": "document",
        "synthetic_demo": True,
        "source_title": f"{SYNTHETIC_DEMO_MARKER} — Restricted Source Test Fixture {case['key'].upper()}",
        "manual_number": f"SYNTH-RESTRICTED-{case['key'].upper()}",
        "revision": "SYNTHETIC RESTRICTED REVISION (fictional)",
        "section": f"Fictional restricted fixture section {case['key'].upper()}",
        "pdf_pages": [f"SYNTHETIC RESTRICTED PAGE {case['key'].upper()}"],
        "verification": {
            "status": "unverified",
            "audience_clearance": "restricted",
            "source_provenance": "Synthetic restricted-access test fixture only; no source exists.",
            "source_manufacturer": case["manufacturer"],
            "source_model": case["model_number"],
            "machine_manufacturer": case["manufacturer"],
            "machine_model": case["model_number"],
            "machine_identity_basis": "trusted_registry",
            "machine_identity_reference": "Synthetic demo registry row only.",
        },
    }


def build_synthetic_question_payload(machine: Any, *, db: Any = None) -> dict[str, Any]:
    draft = build_synthetic_knowledge_draft(machine, db=db)
    return {
        "label": SYNTHETIC_DEMO_MARKER,
        "questions": draft["demo_questions"],
    }
