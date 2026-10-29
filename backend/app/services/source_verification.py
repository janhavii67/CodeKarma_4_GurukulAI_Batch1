"""Validation for source documents used by published knowledge versions."""

from copy import deepcopy
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import ValidationError
from app.db.base import utc_now
from app.models.machine import Machine
from app.models.user import User


_AUDIENCE_CLEARANCES = {"unknown", "trainee_authorized", "expert_only", "restricted", "demo_only"}
_IDENTITY_BASES = {"asset_plate", "trusted_registry"}
_VERIFICATION_FIELDS = (
    "source_provenance",
    "source_manufacturer",
    "source_model",
    "machine_manufacturer",
    "machine_model",
    "machine_identity_basis",
    "machine_identity_reference",
    "audience_clearance",
)


def _clean_value(value: Any, field: str) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError(
            code="source_verification_invalid",
            message=f"Source verification field '{field}' must be text.",
        )
    cleaned = value.strip()
    if len(cleaned) > 500:
        raise ValidationError(
            code="source_verification_invalid",
            message=f"Source verification field '{field}' cannot exceed 500 characters.",
        )
    return cleaned or None


def _same_identity(left: Optional[str], right: Optional[str]) -> bool:
    return bool(left and right and " ".join(left.split()).casefold() == " ".join(right.split()).casefold())


def _validate_verified_document_reference(
    source_ref: dict[str, Any],
    verification: dict[str, Any],
    machine: Optional[Machine],
    *,
    require_attribution: bool,
    db: Optional[Session] = None,
) -> None:
    if not machine:
        raise ValidationError(
            code="source_machine_required",
            message="Link the knowledge draft to a registered machine before verifying a machine-specific source.",
        )

    title = _clean_value(source_ref.get("source_title") or source_ref.get("title"), "source_title")
    revision = _clean_value(source_ref.get("revision"), "revision")
    pages = source_ref.get("pdf_pages") or source_ref.get("pages") or source_ref.get("pdf_page")
    section = _clean_value(source_ref.get("section"), "section")
    if not title or not revision or (not pages and not section):
        raise ValidationError(
            code="source_reference_details_required",
            message="A verified source needs its title, revision, and an exact PDF page or section reference.",
        )

    values = {field: _clean_value(verification.get(field), field) for field in _VERIFICATION_FIELDS}
    if not values["source_provenance"]:
        raise ValidationError(
            code="source_provenance_required",
            message="Record where the source document came from, such as its controlled registry or publisher.",
        )
    if not values["machine_identity_reference"] or values["machine_identity_basis"] not in _IDENTITY_BASES:
        raise ValidationError(
            code="machine_identity_evidence_required",
            message="Record whether the machine identity was checked against its asset plate or a trusted registry, and identify that evidence.",
        )
    if values["audience_clearance"] == "demo_only":
        from app.services.synthetic_demo import (
            SYNTHETIC_DEMO_MARKER,
            is_synthetic_demo_machine,
            synthetic_demo_environment_enabled,
        )

        if (
            not synthetic_demo_environment_enabled(db)
            or not is_synthetic_demo_machine(machine, db=db)
            or source_ref.get("synthetic_demo") is not True
            or SYNTHETIC_DEMO_MARKER not in (title or "")
            or "synthetic" not in (values["source_provenance"] or "").casefold()
        ):
            raise ValidationError(
                code="source_demo_not_isolated",
                message="Demo-only sources can be verified only in the isolated synthetic demo database and against its synthetic machine registry.",
            )
    elif values["audience_clearance"] != "trainee_authorized":
        raise ValidationError(
            code="source_audience_not_authorized",
            message="Only a source confirmed as authorized for Trainee use can be verified for machine-specific guidance.",
        )
    if not all(values[key] for key in ("machine_manufacturer", "machine_model", "source_manufacturer", "source_model")):
        raise ValidationError(
            code="source_identity_details_required",
            message="Record the verified machine and document manufacturer and exact model before marking the source verified.",
        )
    if not _same_identity(values["machine_manufacturer"], values["source_manufacturer"]) or not _same_identity(values["machine_model"], values["source_model"]):
        raise ValidationError(
            code="source_machine_identity_mismatch",
            message="The source manufacturer and exact model must match the verified machine identity.",
        )

    # When the trusted machine registry already has an OEM identity, do not
    # allow a source verification record to conflict with it. Internal asset
    # codes copied into model_number are not treated as OEM model evidence.
    if machine.manufacturer and not _same_identity(values["machine_manufacturer"], machine.manufacturer):
        raise ValidationError(
            code="source_machine_registry_mismatch",
            message="The verified machine manufacturer does not match the registered machine record.",
        )
    registered_model = machine.model_number
    if registered_model and registered_model != machine.code and not _same_identity(values["machine_model"], registered_model):
        raise ValidationError(
            code="source_machine_registry_mismatch",
            message="The verified machine model does not match the registered machine record.",
        )

    if require_attribution and (
        not verification.get("verified_by_user_id")
        or not verification.get("verified_at")
        or verification.get("verified_machine_id") != machine.id
    ):
        raise ValidationError(
            code="source_verification_attribution_missing",
            message="The source verification record is missing its machine binding, verifier, or timestamp.",
        )


def prepare_source_refs_for_save(
    source_refs: Optional[list[dict[str, Any]]],
    *,
    machine_id: Optional[str],
    db: Session,
    user: User,
) -> tuple[list[dict[str, Any]], int]:
    """Sanitize verification metadata and server-attribute explicit verification."""
    result = deepcopy(source_refs or [])
    machine = db.get(Machine, machine_id) if machine_id else None
    verified_count = 0

    for source_ref in result:
        if not isinstance(source_ref, dict) or str(source_ref.get("type", "")).casefold() != "document":
            continue
        raw_verification = source_ref.get("verification")
        if raw_verification is None:
            continue
        if not isinstance(raw_verification, dict):
            raise ValidationError(
                code="source_verification_invalid",
                message="Document source verification details must be an object.",
            )

        status = str(raw_verification.get("status", "unverified")).strip().casefold()
        if status not in {"unverified", "verified"}:
            raise ValidationError(
                code="source_verification_invalid",
                message="Source verification status must be unverified or verified.",
            )
        if status == "verified" and raw_verification.get("verified_machine_id") and raw_verification.get("verified_machine_id") != machine_id:
            # A draft may be explicitly reassociated, but source verification
            # for the old registered machine must not carry over silently.
            status = "unverified"
        clearance = str(raw_verification.get("audience_clearance", "unknown")).strip().casefold()
        if clearance not in _AUDIENCE_CLEARANCES:
            raise ValidationError(
                code="source_audience_clearance_invalid",
                message="Choose whether the source is authorized for Trainees, Expert-only, restricted, or not yet checked.",
            )

        verification: dict[str, Any] = {"status": status, "audience_clearance": clearance}
        for field in _VERIFICATION_FIELDS:
            if field == "audience_clearance":
                continue
            value = _clean_value(raw_verification.get(field), field)
            if value:
                verification[field] = value

        # Client-supplied verifier identity and timestamps are never trusted.
        if status == "verified":
            _validate_verified_document_reference(
                source_ref, verification, machine, require_attribution=False, db=db
            )
            verification["verified_machine_id"] = machine.id
            verification["verified_by_user_id"] = user.id
            verification["verified_by_name"] = user.name
            verification["verified_at"] = utc_now().isoformat()
            verified_count += 1

        source_ref["verification"] = verification

    return result, verified_count


def validate_sources_for_publication(version: Any, item: Any, db: Session) -> None:
    """Block restricted documents and unverified machine-linked document sources."""
    machine_id = version.machine_id or item.machine_id
    machine = db.get(Machine, machine_id) if machine_id else None
    if getattr(item, "is_demo", False):
        from app.services.synthetic_demo import SYNTHETIC_DEMO_MARKER, is_synthetic_demo_machine

        if not is_synthetic_demo_machine(machine, db=db):
            raise ValidationError(
                code="synthetic_demo_not_isolated",
                message="Synthetic demo knowledge can be published only in the isolated synthetic demo database with its matching synthetic machine.",
            )
        if (
            SYNTHETIC_DEMO_MARKER not in str(version.title or item.title or "")
            or SYNTHETIC_DEMO_MARKER not in "\n".join(
                str(getattr(version, field, "") or "")
                for field in ("summary", "description", "content", "common_mistakes")
            )
            or not any(
                isinstance(source_ref, dict)
                and str(source_ref.get("type", "")).casefold() == "document"
                and source_ref.get("synthetic_demo") is True
                and SYNTHETIC_DEMO_MARKER in str(source_ref.get("source_title") or source_ref.get("title") or "")
                and isinstance(source_ref.get("verification"), dict)
                and source_ref["verification"].get("audience_clearance") == "demo_only"
                for source_ref in (version.source_refs or [])
            )
        ):
            raise ValidationError(
                code="synthetic_demo_source_required",
                message="Synthetic demo knowledge must retain its exact synthetic label and demo-only source clearance before publication.",
            )
    for source_ref in version.source_refs or []:
        if not isinstance(source_ref, dict) or str(source_ref.get("type", "")).casefold() != "document":
            continue
        verification = source_ref.get("verification")
        clearance = verification.get("audience_clearance", "unknown") if isinstance(verification, dict) else "unknown"
        is_demo_only = clearance == "demo_only"
        if getattr(item, "is_demo", False) and clearance != "demo_only":
            raise ValidationError(
                code="source_demo_clearance_required",
                message="Synthetic demo sources must retain demo-only clearance and cannot be promoted to real trainee guidance.",
            )
        if is_demo_only and not getattr(item, "is_demo", False):
            raise ValidationError(
                code="source_demo_item_required",
                message="A demo-only source can be used only by a clearly labelled synthetic demo knowledge item.",
            )
        if clearance != "trainee_authorized" and not is_demo_only:
            raise ValidationError(
                code="source_audience_not_authorized",
                message="This source cannot be submitted for publication until it is explicitly cleared for Trainee use.",
            )
        if machine_id:
            if not isinstance(verification, dict) or verification.get("status") != "verified":
                raise ValidationError(
                    code="machine_source_verification_required",
                    message="Machine-linked document sources must have a verified exact manufacturer/model match before review.",
                )
            _validate_verified_document_reference(
                source_ref, verification, machine, require_attribution=True, db=db
            )
        elif isinstance(verification, dict) and verification.get("status") == "verified":
            raise ValidationError(
                code="source_machine_required",
                message="A machine-specific source cannot be verified while the knowledge draft is unassigned.",
            )
