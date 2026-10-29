"""Resolve explicit machine mentions against registered equipment records."""

import re
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models.machine import Machine


@dataclass(frozen=True)
class MachineContext:
    machine_id: Optional[str] = None
    clarification: Optional[str] = None


_EQUIPMENT_TOPICS = ("CT scan", "MRI", "X-ray", "ECG")
_MACHINE_WORDS = {"machine", "equipment", "scanner", "system", "unit", "device"}
_STOP_WORDS = _MACHINE_WORDS | {"the", "a", "an", "what", "does", "do", "is", "for", "of"}


def _tokens(value: Optional[str]) -> list[str]:
    return re.findall(r"[a-z]+|\d+", (value or "").lower())


def _has_phrase(question_tokens: list[str], phrase: tuple[str, ...]) -> bool:
    width = len(phrase)
    return any(tuple(question_tokens[index:index + width]) == phrase for index in range(len(question_tokens) - width + 1))


def _topic_in_question(topic: str, tokens: list[str]) -> bool:
    if topic == "CT scan":
        return (
            _has_phrase(tokens, ("ct", "scan"))
            or _has_phrase(tokens, ("ct", "scanner"))
            or _has_phrase(tokens, ("computed", "tomography"))
            or ("ct" in tokens and bool(_MACHINE_WORDS.intersection(tokens)))
        )
    if topic == "MRI":
        return "mri" in tokens or _has_phrase(tokens, ("magnetic", "resonance"))
    if topic == "X-ray":
        return _has_phrase(tokens, ("x", "ray")) or "xray" in tokens or "radiography" in tokens
    return "ecg" in tokens or "ekg" in tokens or "electrocardiogram" in tokens


def _machine_has_topic(machine: Machine, topic: str) -> bool:
    identity_tokens = set(
        _tokens(" ".join(filter(None, (machine.name, machine.code, machine.model_number))))
    )
    if topic == "CT scan":
        return ("ct" in identity_tokens and bool({"scan", "scanner"}.intersection(identity_tokens))) or (
            {"computed", "tomography"}.issubset(identity_tokens)
        )
    if topic == "MRI":
        return "mri" in identity_tokens or {"magnetic", "resonance"}.issubset(identity_tokens)
    if topic == "X-ray":
        return "xray" in identity_tokens or {"x", "ray"}.issubset(identity_tokens)
    return bool({"ecg", "ekg", "electrocardiogram"}.intersection(identity_tokens))


def resolve_machine_context(
    db: Session,
    question: str,
    explicit_machine_id: Optional[str] = None,
    conversation_machine_id: Optional[str] = None,
) -> MachineContext:
    """Prefer explicit context, then a unique registered mention, then prior context.

    A recognized equipment type with no unique registered machine asks for clarification
    instead of silently searching unrelated machines.
    """
    if explicit_machine_id:
        return MachineContext(machine_id=explicit_machine_id)

    question_tokens = _tokens(question)
    mentioned_topics = [topic for topic in _EQUIPMENT_TOPICS if _topic_in_question(topic, question_tokens)]
    if mentioned_topics:
        machines = db.query(Machine).all()
        matches_by_topic = {
            topic: [machine for machine in machines if _machine_has_topic(machine, topic)]
            for topic in mentioned_topics
        }
        matches = {machine.id: machine for rows in matches_by_topic.values() for machine in rows}
        if len(mentioned_topics) == 1 and len(matches) == 1:
            return MachineContext(machine_id=next(iter(matches)))
        if len(mentioned_topics) == 1 and conversation_machine_id in matches:
            # A follow-up can name the equipment type while the conversation
            # already identifies which physical unit the trainee selected.
            return MachineContext(machine_id=conversation_machine_id)
        if len(mentioned_topics) > 1 or len(matches) > 1:
            options = ", ".join(
                f"{machine.name} ({machine.code})" if machine.code else machine.name
                for machine in sorted(matches.values(), key=lambda row: (row.name.lower(), row.id))
            )
            if len(mentioned_topics) > 1:
                missing_topics = [topic for topic, rows in matches_by_topic.items() if not rows]
                if missing_topics:
                    missing = " and ".join(missing_topics)
                    return MachineContext(
                        clarification=f"I couldn't match {missing} to a registered machine. Select one of the registered machines{': ' + options if options else ''}, or ask an expert to register it."
                    )
            return MachineContext(
                clarification=f"Which machine do you mean? I found multiple registered machines: {options}. Select one from the machine filter."
            )
        topic_names = " and ".join(topic for topic, rows in matches_by_topic.items() if not rows)
        return MachineContext(
            clarification=f"I couldn't match {topic_names} to a registered machine. Select the correct machine from the machine filter or ask an expert to register it."
        )

    # Match an explicitly named registered model or machine when no equipment alias applies.
    exact_matches: list[Machine] = []
    for machine in db.query(Machine).all():
        for label in (machine.name, machine.code, machine.model_number):
            label_tokens = [token for token in _tokens(label) if token not in _STOP_WORDS and not token.isdigit()]
            if not label_tokens:
                continue
            if len(label_tokens) >= 2 and all(token in question_tokens for token in label_tokens):
                exact_matches.append(machine)
                break
            if len(label_tokens) == 1 and len(label_tokens[0]) >= 4 and label_tokens[0] in question_tokens:
                exact_matches.append(machine)
                break

    unique_matches = {machine.id: machine for machine in exact_matches}
    if len(unique_matches) == 1:
        return MachineContext(machine_id=next(iter(unique_matches)))
    if len(unique_matches) > 1:
        options = ", ".join(sorted(machine.name for machine in unique_matches.values()))
        return MachineContext(
            clarification=f"Which registered machine do you mean: {options}? Select one from the machine filter."
        )

    return MachineContext(machine_id=conversation_machine_id)
