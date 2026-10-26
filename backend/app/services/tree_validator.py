"""
Module 05: Decision Tree Validator (Pure Deterministic Verification)

Enforces strict manufacturing governance rules before publishing:
1. Exactly one valid start node.
2. No broken or dangling edges.
3. No unreachable nodes.
4. No dead-ends (all non-terminal nodes must branch).
5. No unintended loops or infinite cycles.
6. Check nodes must have at least two diagnostic branches (pass vs fail / alternate condition).
7. Stop nodes cannot lead to non-escalation nodes.
8. Action nodes must have approved engineering source references.
9. All branches must lead to a verified terminal node (end, stop, escalation).
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set
import json


@dataclass
class ValidationIssue:
    severity: str  # "error" | "warning"
    code: str
    message: str
    node_id: Optional[str] = None
    edge_id: Optional[str] = None


def _get_val(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _parse_json(val: Any) -> Any:
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


def validate_tree(nodes: List[Any], edges: List[Any]) -> List[ValidationIssue]:
    """
    Validates a troubleshooting decision tree graph against medical-device manufacturing rules.
    Publishing is blocked if ANY issue with severity="error" exists.
    """
    issues: List[ValidationIssue] = []

    if not nodes:
        issues.append(
            ValidationIssue(
                severity="error",
                code="empty_tree",
                message="Decision tree contains no nodes.",
            )
        )
        return issues

    node_map = {_get_val(n, "id"): n for n in nodes}
    all_node_ids = set(node_map.keys())

    # 1. Start Node Validation
    start_nodes = [n for n in nodes if bool(_get_val(n, "is_start")) is True]
    if len(start_nodes) == 0:
        issues.append(
            ValidationIssue(
                severity="error",
                code="no_start_node",
                message="Decision tree must contain exactly one start node (is_start=True).",
            )
        )
    elif len(start_nodes) > 1:
        issues.append(
            ValidationIssue(
                severity="error",
                code="multiple_start_nodes",
                message=f"Decision tree has {len(start_nodes)} start nodes. Only one start node is permitted.",
            )
        )

    # 2. Broken Edge Validation
    valid_edges = []
    for edge in edges:
        edge_id = _get_val(edge, "id")
        from_id = _get_val(edge, "from_node_id")
        to_id = _get_val(edge, "to_node_id")

        if from_id not in all_node_ids:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="broken_edge",
                    message=f"Edge '{edge_id}' originates from non-existent node '{from_id}'.",
                    edge_id=edge_id,
                )
            )
            continue

        if to_id not in all_node_ids:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="broken_edge",
                    message=f"Edge '{edge_id}' points to non-existent target node '{to_id}'.",
                    edge_id=edge_id,
                )
            )
            continue

        valid_edges.append(edge)

    # Build adjacency lists
    outgoing_map: Dict[str, List[Any]] = {nid: [] for nid in all_node_ids}
    incoming_map: Dict[str, List[Any]] = {nid: [] for nid in all_node_ids}
    for e in valid_edges:
        from_id = _get_val(e, "from_node_id")
        to_id = _get_val(e, "to_node_id")
        outgoing_map[from_id].append(e)
        incoming_map[to_id].append(e)

    # 3. Reachability from Start Node
    if start_nodes:
        root_id = _get_val(start_nodes[0], "id")
        visited: Set[str] = set()
        queue = [root_id]
        while queue:
            curr = queue.pop(0)
            if curr not in visited:
                visited.add(curr)
                for e in outgoing_map.get(curr, []):
                    target = _get_val(e, "to_node_id")
                    if target not in visited:
                        queue.append(target)

        unreachable = all_node_ids - visited
        for un_id in unreachable:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="unreachable_node",
                    message=f"Node '{un_id}' is unreachable from the start node.",
                    node_id=un_id,
                )
            )

    # 4. Dead Ends and Node Specific Invariants
    for node_id, node in node_map.items():
        node_type = (_get_val(node, "node_type") or "").lower()
        is_terminal = node_type in ("end", "stop", "escalation")
        outgoing = outgoing_map.get(node_id, [])

        # Non-terminal node with no outgoing edges = dead end!
        if not is_terminal and len(outgoing) == 0:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="dead_end",
                    message=f"Non-terminal node '{node_id}' ({node_type}) has no outgoing edges.",
                    node_id=node_id,
                )
            )

        # Check nodes must have at least 2 branches (pass vs fail / conditional check)
        if node_type == "check" and len(outgoing) < 2:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_check_branch",
                    message=f"Check node '{node_id}' has {len(outgoing)} branch(es). Mandatory check nodes must have at least 2 diagnostic branches.",
                    node_id=node_id,
                )
            )

        # Stop nodes that branch must ONLY lead to escalation or end
        if node_type == "stop":
            for e in outgoing:
                target_id = _get_val(e, "to_node_id")
                target_node = node_map.get(target_id)
                if target_node:
                    target_type = (_get_val(target_node, "node_type") or "").lower()
                    if target_type not in ("escalation", "end"):
                        issues.append(
                            ValidationIssue(
                                severity="error",
                                code="invalid_stop_target",
                                message=f"Stop node '{node_id}' leads to non-terminal node '{target_id}' ({target_type}). Stop nodes must only lead to escalation or end.",
                                node_id=node_id,
                                edge_id=_get_val(e, "id"),
                            )
                        )

        # Action nodes must cite approved engineering source reference
        if node_type == "action":
            source_ref = _get_val(node, "source_reference")
            linked_sop = _get_val(node, "linked_knowledge_version_id")
            if not source_ref and not linked_sop:
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="action_missing_source",
                        message=f"Corrective action node '{node_id}' has no source_reference or linked_knowledge_version_id for regulatory traceability.",
                        node_id=node_id,
                    )
                )

    # 5. Cycle Detection (Unintended Loops)
    # Allows loops only if explicitly configured in input_rules: {"allow_retry": True, "max_iterations": N}
    # Uses DFS with recursion stack tracking
    visited_cycles: Set[str] = set()
    rec_stack: Set[str] = set()

    def has_unintended_cycle(curr_id: str, path: List[str]):
        visited_cycles.add(curr_id)
        rec_stack.add(curr_id)
        path.append(curr_id)

        for edge in outgoing_map.get(curr_id, []):
            nxt_id = _get_val(edge, "to_node_id")
            if nxt_id not in all_node_ids:
                continue

            if nxt_id in rec_stack:
                cycle_nodes = path[path.index(nxt_id):] + [nxt_id]
                # Check if ANY node in the cycle or the closing edge permits retry/loop
                has_permitted_loop = False
                for c_node_id in cycle_nodes:
                    c_node = node_map.get(c_node_id)
                    if c_node:
                        c_rules = _parse_json(_get_val(c_node, "input_rules"))
                        if isinstance(c_rules, dict) and bool(
                            c_rules.get("allow_retry") or c_rules.get("allow_loop") or c_rules.get("max_iterations")
                        ):
                            has_permitted_loop = True
                            break

                edge_cond = _parse_json(_get_val(edge, "condition"))
                if isinstance(edge_cond, dict) and bool(
                    edge_cond.get("allow_retry") or edge_cond.get("max_iterations")
                ):
                    has_permitted_loop = True

                if not has_permitted_loop:
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            code="unintended_loop",
                            message=f"Unintended cycle detected: {' -> '.join(cycle_nodes)}. Loops must be explicitly flagged with max iterations.",
                            node_id=curr_id,
                            edge_id=_get_val(edge, "id"),
                        )
                    )
            elif nxt_id not in visited_cycles:
                has_unintended_cycle(nxt_id, path)

        rec_stack.remove(curr_id)
        path.pop()

    for nid in all_node_ids:
        if nid not in visited_cycles:
            has_unintended_cycle(nid, [])

    return issues


def can_publish(issues: List[ValidationIssue]) -> bool:
    """Returns True if and only if no issues with severity='error' exist."""
    return not any(issue.severity == "error" for issue in issues)
