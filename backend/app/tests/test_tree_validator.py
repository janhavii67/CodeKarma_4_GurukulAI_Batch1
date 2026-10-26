import json
import pytest
from app.services.tree_validator import validate_tree, can_publish

TEST_LABEL = "ILLUSTRATIVE — NOT A REAL PROCEDURE"


def build_valid_tree():
    """Builds an approved, fully compliant diagnostic decision tree DAG."""
    nodes = [
        {
            "id": "start_check",
            "node_type": "check",
            "title": f"Air Pressure Check ({TEST_LABEL})",
            "instructions": "Measure air pressure at pneumatic regulator.",
            "input_type": "numeric",
            "input_rules": json.dumps({"min": 0, "max": 10, "unit": "bar"}),
            "is_start": True,
        },
        {
            "id": "action_calibrate",
            "node_type": "action",
            "title": f"Calibrate Regulator ({TEST_LABEL})",
            "instructions": "Rotate regulator dial clockwise to 6.0 bar.",
            "source_reference": "SOP-PNEU-01 Section 4",
            "input_type": "yes_no",
            "is_start": False,
        },
        {
            "id": "stop_overlimit",
            "node_type": "stop",
            "title": f"Excess Pressure Emergency Stop ({TEST_LABEL})",
            "instructions": "Immediately dump line pressure.",
            "is_start": False,
            "outcome": "escalated",
        },
        {
            "id": "escalate_expert",
            "node_type": "escalation",
            "title": f"Escalate to Facilities Engineer ({TEST_LABEL})",
            "instructions": "Line over-pressure requires facility inspection.",
            "is_start": False,
            "outcome": "escalated",
        },
        {
            "id": "end_success",
            "node_type": "end",
            "title": f"Procedure Verified ({TEST_LABEL})",
            "instructions": "6.0 bar pressure confirmed under operating load.",
            "is_start": False,
            "outcome": "resolved",
        },
    ]

    edges = [
        {
            "id": "e_normal",
            "from_node_id": "start_check",
            "to_node_id": "end_success",
            "condition": json.dumps({"operator": "==", "value": 6.0}),
            "label": "Pressure == 6.0 bar (Nominal)",
        },
        {
            "id": "e_low",
            "from_node_id": "start_check",
            "to_node_id": "action_calibrate",
            "condition": json.dumps({"operator": "<", "value": 6.0}),
            "label": "Pressure < 6.0 bar",
        },
        {
            "id": "e_high",
            "from_node_id": "start_check",
            "to_node_id": "stop_overlimit",
            "condition": json.dumps({"operator": ">", "value": 8.0}),
            "label": "Pressure > 8.0 bar",
        },
        {
            "id": "e_stop_escalate",
            "from_node_id": "stop_overlimit",
            "to_node_id": "escalate_expert",
            "condition": None,
            "label": "Auto-escalate",
        },
        {
            "id": "e_action_resolved",
            "from_node_id": "action_calibrate",
            "to_node_id": "end_success",
            "condition": json.dumps({"value": "yes"}),
            "label": "Pressure verified 6 bar",
        },
    ]

    return nodes, edges


def test_valid_tree_passes_validation():
    """Verify that a compliant decision tree produces zero error issues and can be published."""
    nodes, edges = build_valid_tree()
    issues = validate_tree(nodes, edges)

    assert len(issues) == 0
    assert can_publish(issues) is True


def test_no_start_node_rejected():
    """Verify detection of tree missing is_start=True."""
    nodes, edges = build_valid_tree()
    for n in nodes:
        n["is_start"] = False

    issues = validate_tree(nodes, edges)
    assert any(i.code == "no_start_node" for i in issues)
    assert can_publish(issues) is False


def test_multiple_start_nodes_rejected():
    """Verify detection of more than one start node."""
    nodes, edges = build_valid_tree()
    nodes[1]["is_start"] = True  # Second start node!

    issues = validate_tree(nodes, edges)
    assert any(i.code == "multiple_start_nodes" for i in issues)
    assert can_publish(issues) is False


def test_broken_edges_detected():
    """Verify edges pointing to or originating from non-existent nodes are flagged."""
    nodes, edges = build_valid_tree()
    edges.append({
        "id": "e_ghost",
        "from_node_id": "start_check",
        "to_node_id": "ghost_node_999",
        "condition": None,
        "label": "Broken edge to nowhere",
    })

    issues = validate_tree(nodes, edges)
    assert any(i.code == "broken_edge" and i.edge_id == "e_ghost" for i in issues)
    assert can_publish(issues) is False


def test_unreachable_node_detected():
    """Verify disconnected island nodes are flagged."""
    nodes, edges = build_valid_tree()
    nodes.append({
        "id": "unreachable_island",
        "node_type": "end",
        "title": f"Island Node ({TEST_LABEL})",
        "instructions": "Nobody can ever reach this.",
        "is_start": False,
    })

    issues = validate_tree(nodes, edges)
    assert any(i.code == "unreachable_node" and i.node_id == "unreachable_island" for i in issues)
    assert can_publish(issues) is False


def test_dead_end_non_terminal_node():
    """Verify a check or action node with zero outgoing edges is flagged."""
    nodes, edges = build_valid_tree()
    # Remove all outgoing edges from action_calibrate
    edges = [e for e in edges if e["from_node_id"] != "action_calibrate"]

    issues = validate_tree(nodes, edges)
    assert any(i.code == "dead_end" and i.node_id == "action_calibrate" for i in issues)
    assert can_publish(issues) is False


def test_missing_check_branch():
    """Verify that a mandatory check node must have at least 2 branches."""
    nodes, edges = build_valid_tree()
    # Filter edges from start_check to have only 1 branch
    edges = [e for e in edges if e["from_node_id"] != "start_check"] + [
        {
            "id": "e_single",
            "from_node_id": "start_check",
            "to_node_id": "end_success",
            "condition": None,
            "label": "Only 1 branch",
        }
    ]

    issues = validate_tree(nodes, edges)
    assert any(i.code == "missing_check_branch" and i.node_id == "start_check" for i in issues)
    assert can_publish(issues) is False


def test_stop_node_invalid_target():
    """Verify stop nodes cannot route back to regular checks or actions."""
    nodes, edges = build_valid_tree()
    # Stop node incorrectly branches to action node instead of escalation
    edges.append({
        "id": "e_bad_stop",
        "from_node_id": "stop_overlimit",
        "to_node_id": "action_calibrate",
        "condition": None,
        "label": "Invalid resume from stop",
    })

    issues = validate_tree(nodes, edges)
    assert any(i.code == "invalid_stop_target" and i.edge_id == "e_bad_stop" for i in issues)
    assert can_publish(issues) is False


def test_action_node_missing_source_reference():
    """Verify action nodes without SOP reference or knowledge link are flagged."""
    nodes, edges = build_valid_tree()
    action = next(n for n in nodes if n["id"] == "action_calibrate")
    action["source_reference"] = None
    action["linked_knowledge_version_id"] = None

    issues = validate_tree(nodes, edges)
    assert any(i.code == "action_missing_source" and i.node_id == "action_calibrate" for i in issues)
    assert can_publish(issues) is False


def test_unintended_loop_detected():
    """Verify cyclical dependencies are blocked unless explicitly permitted."""
    nodes, edges = build_valid_tree()
    # Create loop: action_calibrate -> start_check (without allow_retry rule)
    edges.append({
        "id": "e_loop",
        "from_node_id": "action_calibrate",
        "to_node_id": "start_check",
        "condition": None,
        "label": "Unapproved loop",
    })

    issues = validate_tree(nodes, edges)
    assert any(i.code == "unintended_loop" for i in issues)
    assert can_publish(issues) is False


def test_explicitly_flagged_retry_loop_permitted():
    """Verify cycles with explicit max_iterations/allow_retry flag are permitted."""
    nodes, edges = build_valid_tree()
    # Add allow_retry in action_calibrate input_rules
    action = next(n for n in nodes if n["id"] == "action_calibrate")
    action["input_rules"] = json.dumps({"allow_retry": True, "max_iterations": 2})

    edges.append({
        "id": "e_allowed_loop",
        "from_node_id": "action_calibrate",
        "to_node_id": "start_check",
        "condition": json.dumps({"value": "recheck"}),
        "label": "Permitted calibration retry (max 2)",
    })

    issues = validate_tree(nodes, edges)
    # The unintended_loop issue must NOT be present
    assert not any(i.code == "unintended_loop" for i in issues)
    assert can_publish(issues) is True
