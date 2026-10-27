import re
from typing import List, Optional, Dict, Any
from app.core.config import settings
from app.modules.assistant.services.retrieval_service import RetrievedChunk
from app.modules.assistant.providers.llm_base import LLMRequest

PROMPT_VERSION_V1 = "v1"

DEFAULT_SYSTEM_PROMPT = """You are Gurukul AI Assistant, an advanced Explainable AI (XAI) advisor for manufacturing shopfloors, standard operating procedures (SOPs), machine maintenance, and industrial safety.

EXPLAINABLE AI (XAI) PRINCIPLES:
Do NOT output rigid rule-lists or opaque commands. Ground your answers in transparent, verifiable technical reasoning so operators and technicians understand the engineering rationale behind every procedure.

CORE GROUNDING & SAFETY RULES:
1. STRICT EVIDENCE GROUNDING: Formulate your answer using ONLY the factual instructions, operating conditions, parameters, and warnings provided in the [CHUNK:id] blocks below.
2. EXPLAINABLE RATIONALE: For every recommended step or setting, explain WHY it is required (e.g. why a specific pressure prevents seal rupture, or why an interlock avoids crushing hazards) based on the documentation.
3. CITATION INVARIANT: Every assertion, parameter, instruction step, safety warning, and tolerance MUST cite the exact chunk supporting it using the format [CHUNK:chunk_id].
4. NO PARAMETER HALLUCINATIONS: NEVER invent, estimate, or assume temperatures, pressures, feed rates, spindle speeds, torque, tool models, safety steps, or tolerances not explicitly present in the provided chunks.
5. INSUFFICIENT EVIDENCE DISCLOSURE: If the chunks provided do not contain enough verified information to answer the question, or if no chunks are provided, you MUST explicitly state: "The verified technical knowledge base does not contain sufficient information to answer this question." Explain clearly what information is missing.
6. CONFLICT HANDLING: If different chunks provide contradictory instructions (e.g. differing parameters), point out the discrepancy explicitly, explain both perspectives, and advise consulting the line supervisor.
7. SAFETY FIRST: Always highlight and preserve any safety warnings, lockout/tagout procedures, or PPE requirements present in the chunks before describing execution steps.
"""


class PromptBuilder:
    """
    Constructs grounded, delimited LLM prompts for the Industrial Assistant.
    Enforces chunk delimiter encapsulation [CHUNK:id] ... [/CHUNK] and conversation context.
    """

    def __init__(
        self,
        system_prompt: str = DEFAULT_SYSTEM_PROMPT,
        prompt_version: str = PROMPT_VERSION_V1,
        max_question_chars: int = 1000,
        max_context_chars: int = 12000,
        max_history_turns: int = 4,
    ):
        self.system_prompt = system_prompt
        self.prompt_version = prompt_version
        self.max_question_chars = max_question_chars
        self.max_context_chars = max_context_chars
        self.max_history_turns = max_history_turns

    def sanitize_question(self, question: str) -> str:
        """Sanitizes and bounds user query input length."""
        cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", question.strip())
        if len(cleaned) > self.max_question_chars:
            cleaned = cleaned[: self.max_question_chars].rstrip()
        return cleaned

    def format_chunk(self, chunk: RetrievedChunk) -> str:
        """Formats a single retrieved chunk with explicit delimiters and source metadata."""
        meta_lines = [
            f"[CHUNK:{chunk.chunk_id}]",
            f"Source: {chunk.title} (Type: {chunk.source_type})",
        ]
        if chunk.section_label:
            meta_lines.append(f"Section: {chunk.section_label}")
        if chunk.machine_id:
            meta_lines.append(f"Machine: {chunk.machine_id}")
        if chunk.timestamp_start is not None and chunk.timestamp_end is not None:
            meta_lines.append(f"Timestamp: {chunk.timestamp_start:.1f}s - {chunk.timestamp_end:.1f}s")

        meta_lines.append("Content:")
        meta_lines.append(chunk.text.strip())
        meta_lines.append("[/CHUNK]")
        return "\n".join(meta_lines)

    def format_history(self, history: List[Any]) -> str:
        """
        Formats prior conversation turns.
        Accepts list of ChatMessage instances or dicts with 'role' and 'content'.
        """
        if not history:
            return ""

        # Take only the last N turns
        recent = history[-self.max_history_turns :]
        history_lines = ["=== PRIOR CONVERSATION TURNS ==="]
        for msg in recent:
            role = getattr(msg, "role", None) or (msg.get("role") if isinstance(msg, dict) else "unknown")
            content = getattr(msg, "content", None) or (msg.get("content") if isinstance(msg, dict) else "")
            clean_content = content.strip().replace("\n", " ")
            if len(clean_content) > 300:
                clean_content = clean_content[:300] + "..."
            role_label = "Operator" if role == "user" else "Assistant"
            history_lines.append(f"{role_label}: {clean_content}")
        history_lines.append("=== END PRIOR TURNS  ===\n")
        return "\n".join(history_lines)

    def build_user_prompt(
        self,
        question: str,
        chunks: List[RetrievedChunk],
        history: Optional[List[Any]] = None,
        machine_name: Optional[str] = None,
    ) -> str:
        """
        Assembles the complete user prompt containing technical context, conversation turns,
        and the operator's sanitized question.
        """
        clean_question = self.sanitize_question(question)

        sections: List[str] = []

        if machine_name:
            sections.append(f"TARGET MACHINE: {machine_name}\n")

        # Technical context blocks
        if chunks:
            sections.append("=== VERIFIED TECHNICAL CONTEXT ===")
            accumulated_chars = 0
            for chunk in chunks:
                formatted = self.format_chunk(chunk)
                if accumulated_chars + len(formatted) > self.max_context_chars:
                    # Context budget reached
                    sections.append("<!-- Additional low-rank context truncated -->")
                    break
                sections.append(formatted)
                accumulated_chars += len(formatted)
            sections.append("=== END TECHNICAL CONTEXT ===\n")
        else:
            sections.append("=== VERIFIED TECHNICAL CONTEXT ===\n[NO RELEVANT APPROVED KNOWLEDGE CHUNKS FOUND]\n=== END TECHNICAL CONTEXT ===\n")

        # History
        if history:
            hist_str = self.format_history(history)
            if hist_str:
                sections.append(hist_str)

        # Question
        sections.append(f"OPERATOR QUESTION: {clean_question}")
        sections.append("Provide a clear, step-by-step response grounded in the chunks above with [CHUNK:chunk_id] citations:")

        return "\n".join(sections)

    def build_llm_request(
        self,
        question: str,
        chunks: List[RetrievedChunk],
        history: Optional[List[Any]] = None,
        machine_name: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> LLMRequest:
        """Constructs an LLMRequest with configured system prompt, temperature, and metadata."""
        user_prompt = self.build_user_prompt(
            question=question,
            chunks=chunks,
            history=history,
            machine_name=machine_name,
        )
        return LLMRequest(
            prompt=user_prompt,
            system_prompt=self.system_prompt,
            temperature=0.0,
            max_tokens=1024,
            request_id=request_id,
            metadata={
                "prompt_version": self.prompt_version,
                "chunk_count": len(chunks),
                "has_history": bool(history),
                "machine_name": machine_name,
            },
        )
