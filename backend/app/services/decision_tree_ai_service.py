"""AI assistance for decision trees, built on the existing LLM provider and published-knowledge RAG.

Rules enforced here rather than trusted to the model:
- AI output only becomes ``origin="ai_draft"`` steps in a draft version; validation blocks
  submission until an expert reviews each one, and nothing is ever published by AI.
- Steps that cite no approved source are flagged ``unsourced`` so experts supply the facts.
- Trainee explanations never change the tree: they are text only, grounded in published
  knowledge, and report uncertainty / escalation explicitly.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import AppError, ValidationError
from app.models.media import MediaAsset
from app.models.procedure import Procedure
from app.models.troubleshooting import (
    DecisionTreeAIDraft,
    TroubleshootingEdge,
    TroubleshootingNode,
    TroubleshootingSession,
    TroubleshootingVersion,
)
from app.models.user import User
from app.services import decision_tree_service as trees

AI_STEP_TYPES = {"question", "action", "safety", "result"}
MAX_AI_NODES = 40
H_SPACING, V_SPACING = 280, 190

DRAFT_SYSTEM_PROMPT = """You help machine experts draft troubleshooting decision trees.
Return ONLY a JSON object, no prose:
{"nodes":[{"key":"q1","type":"question|action|safety|result","title":"...","instructions":"...",
"help_text":"why this step matters","expected_observation":"what the trainee should observe",
"safety_warning":"...","details":{"possible_causes":["..."],"recommended_actions":["..."],"escalation":"...",
"ppe":["..."],"precautions":["..."]},"sources":["S1"]}],
"edges":[{"from":"start","to":"q1","label":"Next"},{"from":"q1","to":"a1","label":"Yes"}]}
Rules:
- The tree already has a step with key "start"; connect it to the first question with label "Next".
- Questions ask one observable thing and have 2-4 answers (e.g. Yes / No / Not sure); every answer leads somewhere.
- Every path ends at a "result". Results list POSSIBLE causes, never a confirmed diagnosis.
- Use ONLY facts from the numbered SOURCES for machine-specific values, part names, settings or repair steps.
  If the sources do not cover something, keep the step generic and cite no source. Never invent specifications.
- Put a "safety" step before any inspection that involves power, moving parts, pressure, heat or radiation.
- At most 25 steps. Keep titles under 90 characters."""

REVIEW_SYSTEM_PROMPT = """You review a troubleshooting decision tree written by machine experts.
Return ONLY JSON: {"suggestions":[{"node":"N3","type":"missing_branch|safety|clarity|duplicate|contradiction|knowledge",
"message":"short actionable suggestion","rationale":"why it helps a trainee"}]}
Suggest at most 8 improvements. Do not rewrite the tree and do not invent machine-specific facts."""

ASSIST_SYSTEM_PROMPT = """You help an expert improve one step of a troubleshooting decision tree.
Return ONLY JSON: {"answers":["..."],"follow_up_questions":["..."],"safety":["..."],"rationale":"..."}
Answers are short options a trainee could pick. Use only facts from the SOURCES for machine-specific details."""

EXPLAIN_SYSTEM_PROMPT = """You are the SUJANA AI Tutor helping a trainee during an expert-approved troubleshooting session.
Return ONLY JSON: {"answer":"plain-language explanation","uncertain":true|false,"escalate":true|false,"cited":["S1"]}
Rules:
- Explain the current question, terms, or what to observe in simple language.
- Never add new troubleshooting branches, never tell the trainee which answer to pick, never override the tree's results.
- Never give repair or disassembly procedures that are not in the SOURCES or the current step's approved instructions.
- If the SOURCES do not support an answer, say so and set "uncertain": true.
- Set "escalate": true when the situation sounds unsafe or beyond the approved steps; advise contacting an authorised expert."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _provider(provider=None):
    if provider is not None:
        return provider
    from app.modules.assistant.providers.llm_base import LLMError, get_llm_provider
    try:
        return get_llm_provider()
    except LLMError as exc:
        raise AppError(code="ai_unavailable", message=f"The AI assistant is not available: {exc}", status_code=503)


def _call(provider, system_prompt: str, prompt: str, max_tokens: int = 2048) -> tuple[str, Any]:
    from app.modules.assistant.providers.llm_base import LLMError, LLMRequest
    try:
        response = provider.generate(LLMRequest(prompt=prompt, system_prompt=system_prompt, temperature=0.2, max_tokens=max_tokens))
    except LLMError as exc:
        raise AppError(code="ai_unavailable", message="The AI assistant could not respond. Try again later.", status_code=503) from exc
    return response.content, response


def parse_json(text: str) -> Optional[dict]:
    """Parse the first JSON object in a model reply, tolerating code fences and surrounding prose."""
    if not text:
        return None
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    try:
        value = json.loads(cleaned)
        return value if isinstance(value, dict) else None
    except ValueError:
        pass
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        value = json.loads(cleaned[start:end + 1])
        return value if isinstance(value, dict) else None
    except ValueError:
        return None


def retrieve_sources(db: Session, user: User, query: str, machine_id: Optional[str], top_k: int = 8) -> list[dict]:
    """Approved, published knowledge chunks labelled S1..Sn for prompting and citation."""
    from app.modules.assistant.services.retrieval_service import RetrievalQuery, RetrievalService
    try:
        chunks = RetrievalService.retrieve_chunks(
            RetrievalQuery(query=query, user_id=user.id, machine_id=machine_id, top_k=top_k, min_score=0.08), db)
    except Exception:
        return []
    sources = []
    for index, chunk in enumerate(chunks, start=1):
        sources.append({
            "id": f"S{index}",
            "title": chunk.title,
            "section": chunk.section_label,
            "text": chunk.text[:900],
            "knowledge_version_id": chunk.knowledge_version_id,
            "source_id": chunk.source_id,
            "score": round(float(chunk.score), 3),
        })
    return sources


def _sources_block(sources: list[dict]) -> str:
    if not sources:
        return "SOURCES: none available. Keep every step generic and cite no sources."
    lines = ["SOURCES (approved, published knowledge):"]
    for source in sources:
        heading = source["title"] + (f" — {source['section']}" if source.get("section") else "")
        lines.append(f"[{source['id']}] {heading}\n{source['text']}")
    return "\n\n".join(lines)


def _public_source(source: dict) -> dict:
    return {k: source[k] for k in ("id", "title", "section", "knowledge_version_id", "source_id")}


def _record(db: Session, *, guide_id: str, version_id: Optional[str], user: User, kind: str, prompt: Optional[str],
            status: str, response=None, sources: list[dict] | None = None, result: dict | None = None,
            error: Optional[str] = None) -> DecisionTreeAIDraft:
    record = DecisionTreeAIDraft(
        guide_id=guide_id, version_id=version_id, requested_by=user.id, kind=kind, prompt=(prompt or "")[:4000] or None,
        status=status, provider=getattr(response, "provider_name", None), model=getattr(response, "model_name", None),
        source_refs=[_public_source(s) for s in (sources or [])], result=result or {}, error=error,
    )
    db.add(record)
    db.commit()
    return record


def _tokens(text: str) -> set[str]:
    stop = {"the", "and", "for", "are", "with", "this", "that", "does", "there", "any", "from", "have", "machine", "check"}
    return {w for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(w) > 2 and w not in stop}


def _layout(node_keys: list[str], edges: list[tuple[str, str]], origin: tuple[float, float]) -> dict[str, tuple[float, float]]:
    children = defaultdict(list)
    for source, target in edges:
        children[source].append(target)
    depth: dict[str, int] = {}
    queue = [("start", 0)]
    while queue:
        key, level = queue.pop(0)
        if key in depth:
            continue
        depth[key] = level
        queue.extend((child, level + 1) for child in children[key])
    next_level = max(depth.values(), default=0) + 1
    for key in node_keys:
        if key not in depth:
            depth[key] = next_level
            next_level += 1
    rows = defaultdict(list)
    for key in node_keys:
        rows[depth[key]].append(key)
    positions = {}
    for level, keys in rows.items():
        width = (len(keys) - 1) * H_SPACING
        for index, key in enumerate(keys):
            positions[key] = (origin[0] - width / 2 + index * H_SPACING, origin[1] + level * V_SPACING)
    return positions


# ---------------------------------------------------------------------------
# Expert: draft generation
# ---------------------------------------------------------------------------

def generate_draft(db: Session, user: User, version: TroubleshootingVersion, prompt: str, *,
                   replace: bool = False, provider=None) -> dict:
    guide = version.guide
    start = next((n for n in version.nodes if n.is_start), None)
    if not start:
        raise ValidationError(code="no_start", message="This draft has no Start step.")
    others = [n for n in version.nodes if not n.is_start]
    if others and not replace:
        raise ValidationError(code="draft_not_empty", message="This draft already has steps. Choose 'Replace current steps' to generate a new draft.")

    from app.models.machine import Machine
    machine = db.get(Machine, guide.machine_id) if guide.machine_id else None
    request_text = (prompt or "").strip() or f"Troubleshooting tree for {guide.title}"
    sources = retrieve_sources(db, user, f"{guide.title} {request_text}", guide.machine_id)
    llm = _provider(provider)
    user_prompt = "\n\n".join([
        f"MACHINE: {machine.name if machine else 'Not specified'}",
        f"PROBLEM: {guide.title}",
        f"CATEGORY: {guide.problem_category}",
        f"EXPERT DESCRIPTION: {guide.description or '—'}",
        f"EXPERT REQUEST: {request_text}",
        _sources_block(sources),
    ])
    try:
        content, response = _call(llm, DRAFT_SYSTEM_PROMPT, user_prompt, max_tokens=4096)
    except AppError as exc:
        _record(db, guide_id=guide.id, version_id=version.id, user=user, kind="generate", prompt=request_text,
                status="failed", sources=sources, error=exc.message)
        raise
    data = parse_json(content) or {}
    raw_nodes = [n for n in data.get("nodes", []) if isinstance(n, dict)][:MAX_AI_NODES]
    raw_edges = [e for e in data.get("edges", []) if isinstance(e, dict)]

    by_source = {s["id"]: s for s in sources}
    planned: dict[str, dict] = {}
    for raw in raw_nodes:
        key = str(raw.get("key") or "").strip()
        node_type = str(raw.get("type") or "").strip().lower()
        title = str(raw.get("title") or "").strip()
        if not key or key == "start" or key in planned or node_type not in AI_STEP_TYPES or not title:
            continue
        cited = [by_source[s] for s in raw.get("sources") or [] if isinstance(s, str) and s in by_source]
        details = trees._clean_details(raw.get("details") or {})
        details["source_titles"] = list(dict.fromkeys(s["title"] for s in cited))
        if not cited and node_type in {"action", "result", "safety"}:
            details["unsourced"] = True
        planned[key] = {
            "node_type": node_type, "title": title[:256], "instructions": str(raw.get("instructions") or ""),
            "help_text": raw.get("help_text") or None, "expected_observation": raw.get("expected_observation") or None,
            "safety_warning": raw.get("safety_warning") or None, "details": details,
            "linked_knowledge_version_id": next((s["knowledge_version_id"] for s in cited if s.get("knowledge_version_id")), None),
        }
    if not planned:
        _record(db, guide_id=guide.id, version_id=version.id, user=user, kind="generate", prompt=request_text,
                status="failed", response=response, sources=sources, error="The model returned no usable steps.")
        raise AppError(code="ai_invalid_output", message="The AI could not produce a usable draft. Try describing the problem in more detail.", status_code=502)

    valid_keys = set(planned) | {"start"}
    edges: list[tuple[str, str, str]] = []
    labels_by_source: dict[str, set[str]] = defaultdict(set)
    for raw in raw_edges:
        source, target = str(raw.get("from") or ""), str(raw.get("to") or "")
        label = str(raw.get("label") or "").strip()[:128] or "Next"
        if source not in valid_keys or target not in valid_keys or target == "start" or source == target:
            continue
        source_type = "start" if source == "start" else planned[source]["node_type"]
        if source_type == "result":
            continue
        if source_type != "question" and labels_by_source[source]:
            continue  # non-question steps have a single next step
        if label.lower() in labels_by_source[source]:
            continue
        labels_by_source[source].add(label.lower())
        edges.append((source, target, label if source_type == "question" else "Next"))

    try:
        if replace:
            for edge in list(version.edges):
                db.delete(edge)
            db.flush()
            for node in others:
                db.delete(node)
            db.flush()
        positions = _layout(list(planned), [(s, t) for s, t, _ in edges], (start.position_x or 0.0, start.position_y or 0.0))
        created: dict[str, TroubleshootingNode] = {"start": start}
        for key, fields in planned.items():
            node = TroubleshootingNode(version_id=version.id, origin="ai_draft", input_type="choice",
                                       position_x=positions[key][0], position_y=positions[key][1], **fields)
            db.add(node)
            created[key] = node
        db.flush()
        order = defaultdict(int)
        for source, target, label in edges:
            db.add(TroubleshootingEdge(version_id=version.id, from_node_id=created[source].id, to_node_id=created[target].id,
                                       label=label, sort_order=order[source]))
            order[source] += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    result = {"steps": len(planned), "branches": len(edges), "sources_used": len(sources),
              "unsourced_steps": sum(1 for p in planned.values() if p["details"].get("unsourced"))}
    record = _record(db, guide_id=guide.id, version_id=version.id, user=user, kind="generate", prompt=request_text,
                     status="applied", response=response, sources=sources, result=result)
    db.expire_all()
    return {"draft_id": record.id, "summary": result, "sources": [_public_source(s) for s in sources],
            "version": trees.version_detail(db, trees.get_version(db, version.id))}


# ---------------------------------------------------------------------------
# Expert: review and per-step assistance
# ---------------------------------------------------------------------------

def structural_suggestions(version: TroubleshootingVersion) -> list[dict]:
    """Deterministic duplicate / contradiction checks that do not need a model."""
    suggestions = []
    questions = [n for n in version.nodes if n.node_type == "question"]
    for i, first in enumerate(questions):
        first_tokens = _tokens(first.title)
        for second in questions[i + 1:]:
            second_tokens = _tokens(second.title)
            union = first_tokens | second_tokens
            if union and len(first_tokens & second_tokens) / len(union) >= 0.75:
                suggestions.append({"node_id": second.id, "type": "duplicate", "source": "rules",
                                    "message": f'"{second.title}" looks like a duplicate of "{first.title}".',
                                    "rationale": "Asking the same thing twice slows trainees down; reuse one question with branches."})
    for node in questions:
        targets = defaultdict(list)
        for edge in node.outgoing_edges:
            if edge.to_node_id:
                targets[edge.to_node_id].append(edge.label)
        for labels in targets.values():
            lowered = {label.lower() for label in labels}
            if {"yes", "no"} <= lowered:
                suggestions.append({"node_id": node.id, "type": "contradiction", "source": "rules",
                                    "message": f'"Yes" and "No" on "{node.title}" lead to the same step.',
                                    "rationale": "If both answers continue identically, the question does not change the diagnosis."})
    return suggestions


def review_tree(db: Session, user: User, version: TroubleshootingVersion, *, provider=None) -> dict:
    issues = trees.validate_version(db, version)
    suggestions = structural_suggestions(version)
    ai_available = True
    short_ids = {node.id: f"N{index}" for index, node in enumerate(version.nodes, start=1)}
    reverse_ids = {value: key for key, value in short_ids.items()}
    outline = []
    for node in version.nodes:
        answers = ", ".join(f"{e.label} -> {short_ids.get(e.to_node_id, 'NONE')}" for e in node.outgoing_edges)
        outline.append(f"{short_ids[node.id]} [{node.node_type}] {node.title}"
                       + (f" | safety: {node.safety_warning}" if node.safety_warning else "")
                       + (f" | answers: {answers}" if answers else ""))
    response = None
    try:
        llm = _provider(provider)
        content, response = _call(llm, REVIEW_SYSTEM_PROMPT,
                                  f"TREE: {version.guide.title} (severity {version.guide.severity})\n" + "\n".join(outline), max_tokens=1500)
        for raw in (parse_json(content) or {}).get("suggestions", [])[:8]:
            if not isinstance(raw, dict) or not raw.get("message"):
                continue
            suggestions.append({"node_id": reverse_ids.get(str(raw.get("node") or "")), "type": str(raw.get("type") or "clarity"),
                                "source": "ai", "message": str(raw["message"])[:400], "rationale": str(raw.get("rationale") or "")[:400]})
    except AppError:
        ai_available = False
    _record(db, guide_id=version.guide_id, version_id=version.id, user=user, kind="review", prompt=None,
            status="completed", response=response, result={"issues": len(issues), "suggestions": len(suggestions)})
    return {"issues": issues, "suggestions": suggestions, "ai_available": ai_available}


def related_resources(db: Session, guide_machine_id: Optional[str], text: str, limit: int = 6) -> dict:
    """Existing machine media and published Guided Workflows whose titles overlap the step text."""
    from app.services.procedure_service import is_workflow_currently_published
    words = _tokens(text)
    media_rows = (db.query(MediaAsset).filter(MediaAsset.machine_id == guide_machine_id).all() if guide_machine_id else [])
    scored_media = sorted(
        ((len(words & _tokens(f"{m.title} {m.description or ''} {m.tags or ''}")), m) for m in media_rows),
        key=lambda pair: -pair[0])
    workflows = db.query(Procedure).filter(Procedure.status == "APPROVED")
    if guide_machine_id:
        workflows = workflows.filter(Procedure.machine_id == guide_machine_id)
    scored_workflows = sorted(
        ((len(words & _tokens(f"{p.title} {p.description}")), p) for p in workflows.all()), key=lambda pair: -pair[0])
    return {
        "media": [trees.media_payload(m) for score, m in scored_media if score > 0][:limit],
        "workflows": [{"id": p.id, "title": p.title} for score, p in scored_workflows
                      if score > 0 and is_workflow_currently_published(db, p)][:limit],
    }


def assist_step(db: Session, user: User, version: TroubleshootingVersion, node: TroubleshootingNode, *, provider=None) -> dict:
    guide = version.guide
    query = f"{guide.title} {node.title} {node.instructions or ''}"
    sources = retrieve_sources(db, user, query, guide.machine_id, top_k=5)
    resources = related_resources(db, guide.machine_id, query)
    result = {"answers": [], "follow_up_questions": [], "safety": [], "rationale": "", "ai_available": True,
              "knowledge": [{**_public_source(s), "excerpt": s["text"][:280]} for s in sources], **resources}
    response = None
    try:
        llm = _provider(provider)
        existing = ", ".join(e.label for e in node.outgoing_edges) or "none"
        content, response = _call(llm, ASSIST_SYSTEM_PROMPT, "\n\n".join([
            f"TREE: {guide.title}", f"STEP [{node.node_type}]: {node.title}", f"INSTRUCTIONS: {node.instructions or '—'}",
            f"EXISTING ANSWERS: {existing}", _sources_block(sources)]), max_tokens=800)
        data = parse_json(content) or {}
        for key in ("answers", "follow_up_questions", "safety"):
            result[key] = [str(v)[:200] for v in data.get(key, []) if isinstance(v, str) and v.strip()][:6]
        result["rationale"] = str(data.get("rationale") or "")[:500]
    except AppError:
        result["ai_available"] = False
    _record(db, guide_id=guide.id, version_id=version.id, user=user, kind="assist", prompt=node.title,
            status="completed", response=response, sources=sources)
    return result


# ---------------------------------------------------------------------------
# Trainee: explain the current step
# ---------------------------------------------------------------------------

def explain_for_trainee(db: Session, user: User, session: TroubleshootingSession, question: str, *, provider=None) -> dict:
    from app.services.decision_tree_walk_service import _active_responses, _answer_label
    version = db.get(TroubleshootingVersion, session.guide_version_id)
    guide = version.guide
    node = db.get(TroubleshootingNode, session.current_node_id) if session.current_node_id else None
    question = (question or "").strip() or (f"Explain this question: {node.title}" if node else "Explain this step")
    sources = retrieve_sources(db, user, f"{guide.title} {node.title if node else ''} {question}", session.machine_id, top_k=5)
    details = (node.details or {}) if node else {}
    path = []
    for response in _active_responses(session):
        asked = db.get(TroubleshootingNode, response.node_id)
        if asked:
            path.append(f"- {asked.title} -> {_answer_label(response)}")
    context = "\n".join([
        f"PROBLEM: {guide.title} (severity {guide.severity})",
        f"CURRENT STEP [{node.node_type if node else '-'}]: {node.title if node else '-'}",
        f"APPROVED INSTRUCTIONS: {(node.instructions if node else '') or '—'}",
        f"WHY IT MATTERS: {(node.help_text if node else '') or '—'}",
        f"WHAT TO OBSERVE: {(node.expected_observation if node else '') or '—'}",
        f"SAFETY: {(node.safety_warning if node else '') or '—'}",
        f"TERMS: {json.dumps(details.get('technical_terms') or [])}",
        f"AVAILABLE ANSWERS: {', '.join(e.label for e in node.outgoing_edges) if node else '—'}",
        "ANSWERS SO FAR:\n" + ("\n".join(path) or "- none"),
    ])
    llm = _provider(provider)
    content, _ = _call(llm, EXPLAIN_SYSTEM_PROMPT, f"{context}\n\n{_sources_block(sources)}\n\nTRAINEE QUESTION: {question}", max_tokens=900)
    data = parse_json(content)
    if data is None:
        data = {"answer": content.strip(), "uncertain": True, "escalate": False, "cited": []}
    cited_ids = {c for c in data.get("cited", []) if isinstance(c, str)}
    cited = [_public_source(s) for s in sources if s["id"] in cited_ids]
    uncertain = bool(data.get("uncertain")) or not cited
    escalate = bool(data.get("escalate")) or (uncertain and guide.severity == "CRITICAL")
    return {
        "answer": str(data.get("answer") or "I couldn't find an approved explanation for this.").strip(),
        "uncertain": uncertain,
        "escalate": escalate,
        "sources": cited,
        "notice": ("This explanation is not backed by approved knowledge. Follow the step's approved instructions "
                   "and ask an expert if you are unsure.") if uncertain else None,
    }


# ---------------------------------------------------------------------------
# Trainee: explain evidence during a simulator mission
# ---------------------------------------------------------------------------

MISSION_SYSTEM_PROMPT = EXPLAIN_SYSTEM_PROMPT + """
- This is a training simulation. Never reveal which action or answer is correct, and never invent readings or faults.
- Explain the trainee's collected evidence only using the evidence text and SOURCES provided."""


def explain_mission(db: Session, user: User, attempt, question: str, *, provider=None) -> dict:
    """Explain the current mission step or evidence without giving away the scenario's answer."""
    from app.services.troubleshooting_simulator_service import _state
    guide = attempt_guide(db, attempt)
    node = db.get(TroubleshootingNode, attempt.current_node_id) if attempt.current_node_id else None
    state = _state(attempt)
    question = (question or "").strip() or "Explain this step in simple words"
    evidence = "\n".join(f"- {e.get('title')}: {e.get('clue') or ''} {json.dumps(e.get('reading')) if e.get('reading') else ''}".strip()
                         for e in state.get("evidence", [])) or "- none yet"
    terminal = bool(node and node.node_type in trees.TERMINAL_NODE_TYPES)
    context = "\n".join([
        f"MISSION: {guide.title} (difficulty {guide.difficulty})",
        f"CURRENT STEP: {'Fault identification' if terminal else (node.title if node else '-')}",
        f"APPROVED INSTRUCTIONS: {'' if terminal else ((node.instructions if node else '') or '—')}",
        f"SAFETY: {(node.safety_warning if node else '') or '—'}",
        f"TERMS: {json.dumps((node.details or {}).get('technical_terms') or []) if node else '[]'}",
        "EVIDENCE COLLECTED:\n" + evidence,
    ])
    sources = retrieve_sources(db, user, f"{guide.title} {question}", guide.machine_id, top_k=5)
    llm = _provider(provider)
    content, _ = _call(llm, MISSION_SYSTEM_PROMPT, f"{context}\n\n{_sources_block(sources)}\n\nTRAINEE QUESTION: {question}", max_tokens=700)
    data = parse_json(content) or {"answer": content.strip(), "uncertain": True, "escalate": False, "cited": []}
    cited_ids = {c for c in data.get("cited", []) if isinstance(c, str)}
    cited = [_public_source(s) for s in sources if s["id"] in cited_ids]
    uncertain = bool(data.get("uncertain")) or not cited
    return {
        "answer": str(data.get("answer") or "I couldn't find an approved explanation for this.").strip(),
        "uncertain": uncertain,
        "escalate": bool(data.get("escalate")),
        "sources": cited,
        "notice": "Not backed by approved knowledge — rely on the mission's evidence and expert guidance." if uncertain else None,
    }


def attempt_guide(db: Session, attempt):
    from app.models.troubleshooting import TroubleshootingGuide as Guide
    return db.get(Guide, attempt.guide_id)
