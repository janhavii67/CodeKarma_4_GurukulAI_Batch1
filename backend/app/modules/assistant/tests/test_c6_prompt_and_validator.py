import pytest
from app.modules.assistant.prompts.prompt_builder import (
    PromptBuilder,
    DEFAULT_SYSTEM_PROMPT,
    PROMPT_VERSION_V1,
)
from app.modules.assistant.validation.answer_validator import (
    AnswerValidator,
    ValidationResult,
)
from app.modules.assistant.services.retrieval_service import RetrievedChunk
from app.modules.assistant.models import (
    EVIDENCE_STATUS_SUFFICIENT,
    EVIDENCE_STATUS_INSUFFICIENT,
    EVIDENCE_STATUS_CONFLICT,
)


def _make_chunk(
    chunk_id: str,
    text: str,
    title: str = "CNC Lathe SOP",
    section: str = "Operating Parameters",
    machine_id: str = "lathe-01",
    timestamp_start: float = None,
    timestamp_end: float = None,
) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        source_id="src-" + chunk_id,
        knowledge_version_id="ver-" + chunk_id,
        title=title,
        section_label=section,
        text=text,
        score=0.85,
        rank=1,
        machine_id=machine_id,
        timestamp_start=timestamp_start,
        timestamp_end=timestamp_end,
    )


def test_prompt_builder_chunk_delimiters_and_metadata():
    builder = PromptBuilder()
    chunk1 = _make_chunk(
        chunk_id="chunk-abc-1",
        text="Set the spindle speed to 1200 RPM and coolant flow to 20 PSI.",
        title="Turning Procedure",
        section="Speed & Feed",
        machine_id="HAAS-VF2",
    )
    chunk2 = _make_chunk(
        chunk_id="chunk-abc-2",
        text="Ensure door interlock is engaged. Wear safety goggles.",
        title="Audio Safety Briefing",
        section="Safety Warning",
        timestamp_start=14.5,
        timestamp_end=28.0,
    )

    request = builder.build_llm_request(
        question="What speed should I set?",
        chunks=[chunk1, chunk2],
        machine_name="HAAS VF2",
    )

    assert request.system_prompt == DEFAULT_SYSTEM_PROMPT
    assert request.temperature == 0.0

    prompt = request.prompt
    # Must contain delimiters
    assert "[CHUNK:chunk-abc-1]" in prompt
    assert "[/CHUNK]" in prompt
    assert "Turning Procedure" in prompt
    assert "HAAS-VF2" in prompt
    assert "1200 RPM" in prompt

    assert "[CHUNK:chunk-abc-2]" in prompt
    assert "14.5s - 28.0s" in prompt
    assert "safety goggles" in prompt

    assert "OPERATOR QUESTION: What speed should I set?" in prompt
    assert "TARGET MACHINE: HAAS VF2" in prompt


def test_prompt_builder_sanitizes_and_truncates_question():
    builder = PromptBuilder(max_question_chars=50)
    long_q = "How do I calibrate the pressure relief valve on machine A-102 when the hydraulic pump fluctuates?"
    sanitized = builder.sanitize_question(long_q)
    assert len(sanitized) <= 50
    assert sanitized.startswith("How do I calibrate")


def test_prompt_builder_history_formatting():
    builder = PromptBuilder(max_history_turns=2)
    history = [
        {"role": "user", "content": "Hello, how do I start?"},
        {"role": "assistant", "content": "Please verify power switch is on."},
        {"role": "user", "content": "It is on now."},
        {"role": "assistant", "content": "Next check hydraulic fluid."},
    ]

    prompt = builder.build_user_prompt(
        question="What is step 3?",
        chunks=[],
        history=history,
    )

    # Only last 2 turns should appear
    assert "Hello, how do I start?" not in prompt
    assert "Operator: It is on now." in prompt
    assert "Assistant: Next check hydraulic fluid." in prompt
    assert "OPERATOR QUESTION: What is step 3?" in prompt


def test_answer_validator_valid_citations():
    validator = AnswerValidator()
    chunk1 = _make_chunk("c1", "Adjust valve pressure to 50 PSI.")
    chunk2 = _make_chunk("c2", "Confirm oil level is at 80% mark.")

    raw_response = "Set pressure to 50 PSI [CHUNK:c1] and check oil level is 80% [CHUNK:c2]."
    result = validator.validate(raw_response, [chunk1, chunk2])

    assert result.is_valid is True
    assert result.evidence_status == EVIDENCE_STATUS_SUFFICIENT
    assert result.cited_chunk_ids == ["c1", "c2"]
    assert result.hallucinated_citations == []
    assert result.hallucinated_numbers == []


def test_answer_validator_detects_and_strips_hallucinated_citations():
    validator = AnswerValidator()
    chunk1 = _make_chunk("c1", "Adjust valve pressure to 50 PSI.")

    # Model hallucinated citation c999
    raw_response = "Set valve to 50 PSI [CHUNK:c1]. Also verify clamp [CHUNK:c999]."
    result = validator.validate(raw_response, [chunk1])

    assert result.is_valid is False
    assert result.cited_chunk_ids == ["c1"]
    assert result.hallucinated_citations == ["c999"]
    # Hallucinated citation tag should be stripped from sanitized answer
    assert "[CHUNK:c999]" not in result.sanitized_content
    assert "[CHUNK:c1]" in result.sanitized_content


def test_answer_validator_detects_hallucinated_numbers():
    validator = AnswerValidator(strict_numbers=True)
    chunk1 = _make_chunk("c1", "Tighten bolts to 45 Nm in a star pattern.")

    # 45 Nm is in chunk, but 900 RPM is hallucinated
    raw_response = "1. Tighten bolts to 45 Nm [CHUNK:c1].\n2. Spin motor at 900 RPM."
    result = validator.validate(raw_response, [chunk1])

    assert "45" not in result.hallucinated_numbers
    assert "900" in result.hallucinated_numbers


def test_answer_validator_handles_insufficient_evidence():
    validator = AnswerValidator()
    chunk1 = _make_chunk("c1", "Cleaning protocol for workspace.")

    raw_response = "The verified technical knowledge base does not contain sufficient information to answer this question about hydraulic pressure."
    result = validator.validate(raw_response, [chunk1])

    assert result.evidence_status == EVIDENCE_STATUS_INSUFFICIENT
    assert result.is_valid is True


def test_answer_validator_handles_conflicting_evidence():
    validator = AnswerValidator()
    chunk1 = _make_chunk("c1", "Manual says 50 PSI.")
    chunk2 = _make_chunk("c2", "SOP says 75 PSI.")

    raw_response = "There is conflicting information in the documentation: chunk c1 specifies 50 PSI while c2 specifies 75 PSI. Consult supervisor."
    result = validator.validate(raw_response, [chunk1, chunk2])

    assert result.evidence_status == EVIDENCE_STATUS_CONFLICT


def test_answer_validator_json_response_parsing():
    validator = AnswerValidator()
    chunk1 = _make_chunk("c1", "Turn power switch clockwise to ON position.")

    json_response = '{"answer": "Turn power switch clockwise [CHUNK:c1].", "citations": ["c1"], "evidence_status": "sufficient"}'
    result = validator.validate(json_response, [chunk1])

    assert result.is_valid is True
    assert result.evidence_status == EVIDENCE_STATUS_SUFFICIENT
    assert result.sanitized_content == "Turn power switch clockwise [CHUNK:c1]."
    assert result.cited_chunk_ids == ["c1"]
