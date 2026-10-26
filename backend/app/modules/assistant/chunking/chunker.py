import re
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any


@dataclass
class ChunkPayload:
    chunk_index: int
    text: str
    section_label: Optional[str] = None
    timestamp_start: Optional[float] = None
    timestamp_end: Optional[float] = None
    token_count: int = 0
    search_vector: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


def _build_search_vector(text: str, context: str = "") -> str:
    """Extract lowercased alphanumeric keywords for FTS matching."""
    full = f"{context} {text}".lower()
    cleaned = re.sub(r"[^\w\s]", " ", full)
    words = [w for w in cleaned.split() if len(w) > 1]
    # Unique tokens preserved in order
    seen = set()
    unique = []
    for w in words:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    return " ".join(unique)


def _approx_token_count(text: str) -> int:
    """Approximate tokens as word count * 1.3."""
    words = len(text.split())
    return max(1, int(words * 1.3))


def chunk_text(
    text: str,
    title: str = "",
    target_words: int = 250,
    overlap_words: int = 40,
    section_label: Optional[str] = None,
) -> List[ChunkPayload]:
    """
    Split arbitrary markdown or plain text into coherent semantic chunks.
    Respects Markdown headers, paragraphs, and sentence boundaries.
    """
    if not text or not text.strip():
        return []

    # First split by major headers (#, ##, ###)
    sections = re.split(r"(?m)^(?=#{1,3}\s+)", text.strip())
    chunks: List[ChunkPayload] = []
    current_index = 0

    for sec in sections:
        sec = sec.strip()
        if not sec:
            continue

        # Extract section label if header present
        header_match = re.match(r"^#{1,3}\s+(.+)$", sec, re.MULTILINE)
        cur_label = header_match.group(1).strip() if header_match else section_label

        # If section is small enough, keep as single chunk
        words = sec.split()
        if len(words) <= target_words + 50:
            chunks.append(
                ChunkPayload(
                    chunk_index=current_index,
                    text=sec,
                    section_label=cur_label,
                    token_count=_approx_token_count(sec),
                    search_vector=_build_search_vector(sec, title),
                    metadata={"title": title},
                )
            )
            current_index += 1
        else:
            # Paragraph-based rolling window
            paragraphs = [p.strip() for p in sec.split("\n\n") if p.strip()]
            window_words: List[str] = []
            for p in paragraphs:
                p_words = p.split()
                if len(window_words) + len(p_words) > target_words and window_words:
                    chunk_body = " ".join(window_words)
                    chunks.append(
                        ChunkPayload(
                            chunk_index=current_index,
                            text=chunk_body,
                            section_label=cur_label,
                            token_count=_approx_token_count(chunk_body),
                            search_vector=_build_search_vector(chunk_body, title),
                            metadata={"title": title},
                        )
                    )
                    current_index += 1
                    # Overlap
                    window_words = window_words[-overlap_words:] + p_words
                else:
                    window_words.extend(p_words)

            if window_words:
                chunk_body = " ".join(window_words)
                chunks.append(
                    ChunkPayload(
                        chunk_index=current_index,
                        text=chunk_body,
                        section_label=cur_label,
                        token_count=_approx_token_count(chunk_body),
                        search_vector=_build_search_vector(chunk_body, title),
                        metadata={"title": title},
                    )
                )
                current_index += 1

    return chunks


def chunk_knowledge_version(
    title: str,
    summary: Optional[str] = None,
    description: Optional[str] = None,
    steps: Optional[Any] = None,
    version_no: int = 1,
    content: Optional[str] = None,
    safety_warnings: Optional[str] = None,
    operating_conditions: Optional[str] = None,
    prerequisites: Optional[str] = None,
    common_mistakes: Optional[str] = None,
    corrective_actions: Optional[str] = None,
) -> List[ChunkPayload]:
    """
    Intelligently chunk a KnowledgeVersion record, ensuring ALL data sent by the user
    (overview, parameters, safety warnings, steps, troubleshooting) is grounded in RAG.
    """
    chunks: List[ChunkPayload] = []
    idx = 0

    # 1. Overview chunk: summary and description
    overview_parts = []
    if summary and summary.strip():
        overview_parts.append(f"Summary: {summary.strip()}")
    if description and description.strip():
        overview_parts.append(f"Description: {description.strip()}")

    if overview_parts:
        overview_text = f"{title} (Version {version_no})\n" + "\n\n".join(overview_parts)
        chunks.append(
            ChunkPayload(
                chunk_index=idx,
                text=overview_text,
                section_label="Overview",
                token_count=_approx_token_count(overview_text),
                search_vector=_build_search_vector(overview_text, title),
                metadata={"type": "overview", "version_no": version_no},
            )
        )
        idx += 1

    # 2. Safety Warnings & Invariants Chunk
    if safety_warnings and safety_warnings.strip():
        safety_text = f"{title} (Version {version_no}) - Safety Warnings & Invariants\n{safety_warnings.strip()}"
        chunks.append(
            ChunkPayload(
                chunk_index=idx,
                text=safety_text,
                section_label="Safety Warnings",
                token_count=_approx_token_count(safety_text),
                search_vector=_build_search_vector(safety_text, f"{title} safety warnings danger caution"),
                metadata={"type": "safety_warnings", "version_no": version_no, "is_critical": True},
            )
        )
        idx += 1

    # 3. Operating Conditions & Machine Parameters Chunk
    if operating_conditions and operating_conditions.strip():
        op_text = f"{title} (Version {version_no}) - Operating Conditions & Parameters\n{operating_conditions.strip()}"
        chunks.append(
            ChunkPayload(
                chunk_index=idx,
                text=op_text,
                section_label="Operating Conditions",
                token_count=_approx_token_count(op_text),
                search_vector=_build_search_vector(op_text, f"{title} operating conditions parameters machine settings"),
                metadata={"type": "operating_conditions", "version_no": version_no},
            )
        )
        idx += 1

    # 4. Prerequisites & Required Tools / PPE
    if prerequisites and prerequisites.strip():
        pre_text = f"{title} (Version {version_no}) - Prerequisites & Equipment\n{prerequisites.strip()}"
        chunks.append(
            ChunkPayload(
                chunk_index=idx,
                text=pre_text,
                section_label="Prerequisites",
                token_count=_approx_token_count(pre_text),
                search_vector=_build_search_vector(pre_text, f"{title} prerequisites tools ppe equipment required"),
                metadata={"type": "prerequisites", "version_no": version_no},
            )
        )
        idx += 1

    # 5. Common Mistakes & Corrective Actions (Troubleshooting)
    troubleshoot_parts = []
    if common_mistakes and common_mistakes.strip():
        troubleshoot_parts.append(f"Common Mistakes:\n{common_mistakes.strip()}")
    if corrective_actions and corrective_actions.strip():
        troubleshoot_parts.append(f"Corrective Actions:\n{corrective_actions.strip()}")

    if troubleshoot_parts:
        troubleshoot_text = f"{title} (Version {version_no}) - Troubleshooting & Recovery\n" + "\n\n".join(troubleshoot_parts)
        chunks.append(
            ChunkPayload(
                chunk_index=idx,
                text=troubleshoot_text,
                section_label="Troubleshooting",
                token_count=_approx_token_count(troubleshoot_text),
                search_vector=_build_search_vector(troubleshoot_text, f"{title} troubleshooting mistakes errors corrective actions recovery"),
                metadata={"type": "troubleshooting", "version_no": version_no},
            )
        )
        idx += 1

    # 6. User Markdown Content (if provided)
    if content and content.strip():
        # Avoid duplicating if content is identical to summary or description
        is_dup = (summary and content.strip() == summary.strip()) or (description and content.strip() == description.strip())
        if not is_dup:
            content_chunks = chunk_text(content.strip(), title=title, target_words=200, section_label="Content")
            for cc in content_chunks:
                cc.chunk_index = idx
                cc.metadata["type"] = "content"
                cc.metadata["version_no"] = version_no
                chunks.append(cc)
                idx += 1

    # 7. Step chunks: individual operational steps preserving step numbers, safety notes, tools, parameters
    parsed_steps = steps
    if isinstance(parsed_steps, str):
        try:
            import json
            parsed_steps = json.loads(parsed_steps)
        except Exception:
            parsed_steps = []

    if parsed_steps and isinstance(parsed_steps, list):
        for s in parsed_steps:
            if not isinstance(s, dict):
                continue
            step_no = s.get("order") or s.get("step") or s.get("step_no") or (idx + 1)
            step_title = s.get("title") or s.get("name") or f"Step {step_no}"
            step_text = s.get("instruction") or s.get("text") or s.get("action") or s.get("description") or ""
            notes = s.get("safety_warning") or s.get("warning") or s.get("safety_note") or s.get("notes") or ""
            tools_val = s.get("tools") or s.get("tool") or ""
            if isinstance(tools_val, list):
                tool = ", ".join(str(t) for t in tools_val if t)
            else:
                tool = str(tools_val)
            parameters = s.get("parameters") or s.get("parameter") or s.get("settings") or ""
            tolerance = s.get("tolerance") or ""
            expected_result = s.get("expected_result") or ""

            body = f"{title} - Step {step_no}: {step_title}\n{step_text}"
            if tool:
                body += f"\nTools/Equipment: {tool}"
            if parameters:
                body += f"\nParameters/Settings: {parameters}"
            if tolerance:
                body += f"\nTolerance: {tolerance}"
            if expected_result:
                body += f"\nExpected Result: {expected_result}"
            if notes:
                body += f"\nSafety/Caution: {notes}"

            section_name = f"Step {step_no}: {step_title}"
            chunks.append(
                ChunkPayload(
                    chunk_index=idx,
                    text=body,
                    section_label=section_name,
                    token_count=_approx_token_count(body),
                    search_vector=_build_search_vector(body, f"{title} {section_name} {tool} {parameters}"),
                    metadata={
                        "type": "procedure_step",
                        "step_no": step_no,
                        "has_safety_note": bool(notes),
                        "has_parameters": bool(parameters or tolerance),
                        "version_no": version_no,
                    },
                )
            )
            idx += 1

    return chunks


def chunk_transcript_segments(
    segments: List[Any],
    transcript_title: str = "Voice Transcript",
    segments_per_chunk: int = 4,
) -> List[ChunkPayload]:
    """
    Chunk audio transcript segments into windows while recording precise start/end timestamps.
    """
    chunks: List[ChunkPayload] = []
    if not segments:
        return chunks

    idx = 0
    for i in range(0, len(segments), segments_per_chunk):
        window = segments[i : i + segments_per_chunk]
        if not window:
            continue

        start_s = getattr(window[0], "start_s", 0.0)
        end_s = getattr(window[-1], "end_s", start_s)

        # Assemble text
        texts = []
        for seg in window:
            t = getattr(seg, "edited_text", None) or getattr(seg, "original_text", "")
            if t.strip():
                texts.append(t.strip())

        if not texts:
            continue

        full_text = " ".join(texts)
        sec_label = f"Audio {int(start_s // 60)}:{int(start_s % 60):02d} - {int(end_s // 60)}:{int(end_s % 60):02d}"

        chunks.append(
            ChunkPayload(
                chunk_index=idx,
                text=f"{transcript_title} ({sec_label})\n{full_text}",
                section_label=sec_label,
                timestamp_start=float(start_s),
                timestamp_end=float(end_s),
                token_count=_approx_token_count(full_text),
                search_vector=_build_search_vector(full_text, transcript_title),
                metadata={"type": "transcript", "start_s": start_s, "end_s": end_s},
            )
        )
        idx += 1

    return chunks
