"""
Module 05: Decision Tree Engine (Pure Deterministic Functions)

Safety Invariants:
1. Deterministic application code: NO LLM chooses branches or skips checks.
2. Server computes the next node exclusively from stored edges and the validated answer.
   Arbitrary node jumps are strictly rejected.
3. Safe evaluation: Handles yes_no, choice, and numeric comparison ranges.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union, Tuple
import json


@dataclass
class NextResult:
    success: bool
    next_node_id: Optional[str] = None
    edge_id: Optional[str] = None
    is_terminal: bool = False
    outcome: Optional[str] = None  # resolved, unresolved, escalated
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    validation_errors: List[str] = field(default_factory=list)


def _get_val(obj: Any, key: str, default: Any = None) -> Any:
    """Helper to extract attribute from either a dict or object instance."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _parse_json(val: Any) -> Any:
    """Safely parse JSON string if not already dict/list."""
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


def validate_node_answer(node: Any, answer: Any) -> Tuple[bool, Any, List[str]]:
    """
    Validates user observation against the node's input_type and input_rules.
    Returns: (is_valid, normalized_answer, error_messages)
    """
    input_type = (_get_val(node, "input_type") or "choice").lower()
    raw_rules = _get_val(node, "input_rules")
    rules = _parse_json(raw_rules) or {}

    errors: List[str] = []

    # 1. Yes / No input type
    if input_type in ("yes_no", "boolean"):
        if isinstance(answer, bool):
            normalized = "yes" if answer else "no"
            return True, normalized, []
        if isinstance(answer, str):
            clean = answer.strip().lower()
            if clean in ("yes", "true", "y", "1", "pass", "ok"):
                return True, "yes", []
            elif clean in ("no", "false", "n", "0", "fail", "not_ok"):
                return True, "no", []
        errors.append("Invalid answer for yes/no check. Expected 'yes' or 'no'.")
        return False, None, errors

    # 2. Choice input type
    if input_type == "choice":
        allowed_choices = rules.get("choices") or []
        if not allowed_choices and isinstance(rules, list):
            allowed_choices = rules

        answer_str = str(answer).strip() if answer is not None else ""
        if not answer_str:
            errors.append("Observation choice cannot be empty.")
            return False, None, errors

        # Case-insensitive match against allowed choices if choices are defined
        if allowed_choices:
            allowed_lower = [str(c).strip().lower() for c in allowed_choices]
            if answer_str.lower() in allowed_lower:
                idx = allowed_lower.index(answer_str.lower())
                return True, allowed_choices[idx], []
            else:
                errors.append(
                    f"Selected choice '{answer_str}' is not valid. Allowed options: {allowed_choices}"
                )
                return False, None, errors

        return True, answer_str, []

    # 3. Numeric input type
    if input_type == "numeric":
        try:
            val_num = float(answer)
        except (ValueError, TypeError):
            errors.append(f"Observation value '{answer}' is not a valid number.")
            return False, None, errors

        min_val = rules.get("min")
        max_val = rules.get("max")
        unit = rules.get("unit") or ""

        if min_val is not None and val_num < float(min_val):
            errors.append(f"Measured value {val_num} {unit} is below allowable lower limit of {min_val} {unit}.")
        if max_val is not None and val_num > float(max_val):
            errors.append(f"Measured value {val_num} {unit} is above allowable upper limit of {max_val} {unit}.")

        # Note: In manufacturing diagnostics, an out-of-range value is a valid diagnostic reading
        # that triggers error edges (e.g. pressure > 35 bar). We only block validation if it's completely
        # non-numeric, or violates physical instrument limits (min < 0 for absolute pressure).
        physical_min = rules.get("physical_min")
        if physical_min is not None and val_num < float(physical_min):
            return False, None, [f"Sensor reading {val_num} violates physical gauge range ({physical_min})."]

        return True, val_num, []

    # Default fallback
    return True, str(answer), []


from typing import Tuple


def matches_condition(condition: Any, answer: Any) -> bool:
    """
    Evaluates whether an operator's observation matches a transition edge condition.
    Conditions can be simple scalar values or structured comparison operators.
    """
    if condition is None:
        return True

    cond = _parse_json(condition)

    # 1. Simple scalar equality
    if isinstance(cond, (str, int, float, bool)):
        if isinstance(answer, (int, float)) and isinstance(cond, (int, float)):
            return float(answer) == float(cond)
        return str(answer).strip().lower() == str(cond).strip().lower()

    if isinstance(cond, dict):
        # Specific 'value' key
        if "value" in cond and "operator" not in cond:
            target = cond["value"]
            if isinstance(answer, (int, float)) and isinstance(target, (int, float)):
                return float(answer) == float(target)
            return str(answer).strip().lower() == str(target).strip().lower()

        # Operator based condition: >, <, >=, <=, ==, !=, in, range
        op = cond.get("operator", "==").lower()
        val = cond.get("value")

        if op in (">", ">=", "<", "<=", "==", "!="):
            try:
                num_ans = float(answer)
                num_val = float(val)
                if op == ">":
                    return num_ans > num_val
                elif op == ">=":
                    return num_ans >= num_val
                elif op == "<":
                    return num_ans < num_val
                elif op == "<=":
                    return num_ans <= num_val
                elif op == "==":
                    return num_ans == num_val
                elif op == "!=":
                    return num_ans != num_val
            except (ValueError, TypeError):
                return False

        if op == "range":
            try:
                num_ans = float(answer)
                min_v = float(cond.get("min", float("-inf")))
                max_v = float(cond.get("max", float("inf")))
                inclusive = cond.get("inclusive", True)
                if inclusive:
                    return min_v <= num_ans <= max_v
                return min_v < num_ans < max_v
            except (ValueError, TypeError):
                return False

        if op in ("in", "contains"):
            allowed = cond.get("choices") or cond.get("values") or []
            return str(answer).strip().lower() in [str(x).strip().lower() for x in allowed]

    return False


def next_node(
    nodes: List[Any],
    edges: List[Any],
    current_node_id: str,
    answer: Any,
) -> NextResult:
    """
    Computes the deterministic next node in the decision tree.
    Enforces that:
    1. The current node exists and is not already terminal.
    2. The submitted answer passes node input validation.
    3. Exactly one matching outgoing edge is selected based on conditions.
    4. Arbitrary jumping is impossible.
    """
    # 1. Locate current node
    node_map = {_get_val(n, "id"): n for n in nodes}
    current_node = node_map.get(current_node_id)

    if not current_node:
        return NextResult(
            success=False,
            error_code="node_not_found",
            error_message=f"Current node '{current_node_id}' does not exist in this guide version.",
        )

    node_type = (_get_val(current_node, "node_type") or "").lower()

    # 2. Terminal node check: no further advancement allowed
    if node_type in ("end", "stop", "escalation"):
        outcome = _get_val(current_node, "outcome") or node_type
        return NextResult(
            success=False,
            next_node_id=current_node_id,
            is_terminal=True,
            outcome=outcome,
            error_code="terminal_node",
            error_message=f"Node '{current_node_id}' is a terminal '{node_type}' node. No further transitions permitted.",
        )

    # 3. Validate operator observation
    is_valid, normalized_answer, val_errors = validate_node_answer(current_node, answer)
    if not is_valid:
        return NextResult(
            success=False,
            error_code="invalid_answer",
            error_message=f"Input validation failed: {'; '.join(val_errors)}",
            validation_errors=val_errors,
        )

    # 4. Filter outgoing edges for this current node
    outgoing = [e for e in edges if _get_val(e, "from_node_id") == current_node_id]

    if not outgoing:
        return NextResult(
            success=False,
            error_code="dead_end",
            error_message=f"Non-terminal node '{current_node_id}' has no outgoing branches in the decision tree.",
        )

    # 5. Evaluate conditions in edge definition order
    matched_edge = None
    for edge in outgoing:
        cond = _get_val(edge, "condition")
        if matches_condition(cond, normalized_answer):
            matched_edge = edge
            break

    if not matched_edge:
        return NextResult(
            success=False,
            error_code="no_matching_edge",
            error_message=f"Observation '{answer}' does not match any valid branch from node '{current_node_id}'.",
        )

    # 6. Resolve target node
    target_id = _get_val(matched_edge, "to_node_id")
    target_node = node_map.get(target_id)

    if not target_node:
        return NextResult(
            success=False,
            error_code="broken_edge",
            error_message=f"Edge '{_get_val(matched_edge, 'id')}' points to non-existent node '{target_id}'.",
        )

    target_type = (_get_val(target_node, "node_type") or "").lower()
    is_target_terminal = target_type in ("end", "stop", "escalation")
    target_outcome = _get_val(target_node, "outcome") or (target_type if is_target_terminal else None)

    return NextResult(
        success=True,
        next_node_id=target_id,
        edge_id=_get_val(matched_edge, "id"),
        is_terminal=is_target_terminal,
        outcome=target_outcome,
    )
