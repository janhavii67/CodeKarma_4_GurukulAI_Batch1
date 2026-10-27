import re
import json
from dataclasses import dataclass, field
from typing import List, Set, Optional, Dict, Any
from app.modules.assistant.services.retrieval_service import RetrievedChunk
from app.modules.assistant.models import (
    EVIDENCE_STATUS_SUFFICIENT,
    EVIDENCE_STATUS_INSUFFICIENT,
    EVIDENCE_STATUS_CONFLICT,
    EVIDENCE_STATUS_CLARIFICATION_NEEDED,
)


@dataclass
class ValidationResult:
    """Outcome of validating an AI Assistant response against ground-truth chunks."""
    is_valid: bool
    evidence_status: str
    sanitized_content: str
    cited_chunk_ids: List[str]
    hallucinated_citations: List[str] = field(default_factory=list)
    hallucinated_numbers: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class AnswerValidator:
    """
    Validates model responses for industrial safety and grounding invariants.
    Verifies that:
    1. Every cited chunk actually exists in the retrieved set.
    2. Numerical parameters (PSI, °C, mm, RPM, etc.) are grounded in source chunk text.
    3. Proper evidence status is assigned (sufficient vs insufficient vs conflict).
    4. Safety warnings are preserved when required.
    """

    CITATION_REGEX = re.compile(r"\[CHUNK:\s*([a-zA-Z0-9_\-\.]+)\s*\]", re.IGNORECASE)
    # Extracts numbers optionally followed by units
    NUMBER_UNIT_REGEX = re.compile(
        r"\b(\d+(?:\.\d+)?)\s*(psi|bar|°c|°f|mm|cm|m|rpm|nm|kn|kg|g|v|a|hz|seconds|mins|min|hours|%|ml|liters|l|in|inches)?\b",
        re.IGNORECASE,
    )
    # Phrases indicating model declined to answer due to missing SOP evidence
    INSUFFICIENT_PHRASES = [
        "does not contain sufficient information",
        "insufficient information",
        "no relevant technical documentation",
        "no verified information",
        "unable to find verified",
        "not found in the provided documentation",
        "knowledge base does not contain",
    ]

    CONFLICT_PHRASES = [
        "conflicting information",
        "contradictory instructions",
        "differing specifications",
        "discrepancy between",
        "conflict in the documentation",
    ]

    def __init__(self, strict_numbers: bool = True):
        self.strict_numbers = strict_numbers

    def extract_citations(self, text: str) -> List[str]:
        """Extracts all [CHUNK:id] identifiers in order of appearance."""
        return self.CITATION_REGEX.findall(text)

    def extract_numbers_from_text(self, text: str) -> Set[str]:
        """
        Extracts numeric values from text.
        Returns a set of canonical string numbers (e.g. '50', '75.5').
        """
        matches = self.NUMBER_UNIT_REGEX.findall(text.lower())
        results = set()
        for num_str, _ in matches:
            try:
                # normalize: '50.0' -> '50'
                val = float(num_str)
                if val.is_integer():
                    results.add(str(int(val)))
                results.add(num_str)
            except ValueError:
                pass
        return results

    def extract_numbered_steps(self, text: str) -> Set[str]:
        """Extracts list enumeration indices (e.g. 1, 2, 3) to exclude them from parameter checks."""
        enum_matches = re.findall(r"(?:^|\n)\s*(?:step\s*)?(\d+)[.):\s]", text, re.IGNORECASE)
        return set(enum_matches)

    def validate(
        self,
        raw_response: str,
        retrieved_chunks: List[RetrievedChunk],
    ) -> ValidationResult:
        """
        Validates raw model output against the set of retrieved chunks.
        Supports both JSON-formatted outputs and Markdown plain-text.
        """
        warnings: List[str] = []
        parsed_answer = raw_response.strip()
        declared_evidence_status: Optional[str] = None
        declared_citations: List[str] = []

        # 1. Parse JSON response if present
        if parsed_answer.startswith("{") and parsed_answer.endswith("}"):
            try:
                data = json.loads(parsed_answer)
                if isinstance(data, dict):
                    parsed_answer = data.get("answer", parsed_answer)
                    declared_evidence_status = data.get("evidence_status")
                    if isinstance(data.get("citations"), list):
                        declared_citations = [str(c) for c in data["citations"]]
            except Exception:
                pass  # treat as regular text

        allowed_chunk_map: Dict[str, RetrievedChunk] = {c.chunk_id: c for c in retrieved_chunks}
        allowed_chunk_ids: Set[str] = set(allowed_chunk_map.keys())

        # 2. Extract citations
        text_citations = self.extract_citations(parsed_answer)
        all_cited = list(dict.fromkeys(declared_citations + text_citations))

        valid_citations: List[str] = []
        hallucinated_citations: List[str] = []

        for cid in all_cited:
            if cid in allowed_chunk_ids:
                valid_citations.append(cid)
            else:
                hallucinated_citations.append(cid)

        # Sanitize answer: strip hallucinated [CHUNK:xyz] tags
        sanitized_content = parsed_answer
        for bad_cid in hallucinated_citations:
            bad_tag = re.compile(rf"\[CHUNK:\s*{re.escape(bad_cid)}\s*\]", re.IGNORECASE)
            sanitized_content = bad_tag.sub("", sanitized_content)
            warnings.append(f"Removed hallucinated citation to non-retrieved chunk: '{bad_cid}'.")

        # 3. Check for parameter / numerical hallucinations
        hallucinated_numbers: List[str] = []
        if self.strict_numbers and retrieved_chunks:
            # Collect all numbers appearing in chunk text
            chunk_all_text = " ".join([c.text for c in retrieved_chunks])
            allowed_numbers = self.extract_numbers_from_text(chunk_all_text)

            # Collect numbers from answer, excluding obvious list numbers (1, 2, 3...)
            answer_numbers = self.extract_numbers_from_text(sanitized_content)
            step_numbers = self.extract_numbered_steps(sanitized_content)

            # Check each number
            for num in answer_numbers:
                if num in step_numbers and int(float(num)) <= 10:
                    continue  # benign step numbering like "Step 1"
                # If neither the exact string nor integer normalization appears in source chunks
                if num not in allowed_numbers:
                    hallucinated_numbers.append(num)

            if hallucinated_numbers:
                warnings.append(
                    f"Answer contains numerical parameters not verified in source SOP chunks: {hallucinated_numbers}."
                )

        # 4. Assess Evidence Status
        lower_ans = sanitized_content.lower()

        if not retrieved_chunks:
            evidence_status = EVIDENCE_STATUS_INSUFFICIENT
        elif any(phrase in lower_ans for phrase in self.CONFLICT_PHRASES):
            evidence_status = EVIDENCE_STATUS_CONFLICT
        elif any(phrase in lower_ans for phrase in self.INSUFFICIENT_PHRASES):
            evidence_status = EVIDENCE_STATUS_INSUFFICIENT
        elif declared_evidence_status in {
            EVIDENCE_STATUS_SUFFICIENT,
            EVIDENCE_STATUS_INSUFFICIENT,
            EVIDENCE_STATUS_CONFLICT,
            EVIDENCE_STATUS_CLARIFICATION_NEEDED,
        }:
            evidence_status = declared_evidence_status
        elif not valid_citations and len(retrieved_chunks) > 0 and not hallucinated_numbers:
            # Grounded chunks available but model cited none - fallback to sufficient if plausible or warning
            evidence_status = EVIDENCE_STATUS_SUFFICIENT
        else:
            evidence_status = EVIDENCE_STATUS_SUFFICIENT

        # If too many hallucinated numbers are present on a technical procedure, safety downgrade
        if len(hallucinated_numbers) >= 2:
            warnings.append("Multiple unverified parameters detected. Degrading evidence status to INSUFFICIENT.")
            evidence_status = EVIDENCE_STATUS_INSUFFICIENT

        # 5. Safety warnings preservation check
        has_chunk_safety = any(
            "safety" in (c.section_label or "").lower()
            or any(kw in c.text.lower() for kw in ["warning", "danger", "caution", "ppe", "lockout"])
            for c in retrieved_chunks
        )
        if has_chunk_safety and not any(kw in lower_ans for kw in ["warning", "caution", "danger", "ppe", "safety"]):
            warnings.append("Retrieved technical context contains safety instructions not explicitly reflected in response.")

        is_valid = len(hallucinated_citations) == 0 and len(hallucinated_numbers) < 2

        return ValidationResult(
            is_valid=is_valid,
            evidence_status=evidence_status,
            sanitized_content=sanitized_content.strip(),
            cited_chunk_ids=valid_citations,
            hallucinated_citations=hallucinated_citations,
            hallucinated_numbers=hallucinated_numbers,
            warnings=warnings,
        )
