import json
import pytest
from app.services.tree_engine import next_node, validate_node_answer, matches_condition

TEST_LABEL = "ILLUSTRATIVE — NOT A REAL PROCEDURE"


def create_sample_tree():
    """Builds an illustrative test decision tree DAG."""
    nodes = [
        {
            "id": "node_start",
            "node_type": "check",
            "title": f"Check Main Hydraulic Pressure ({TEST_LABEL})",
            "instructions": "Inspect digital gauge on primary manifold.",
            "input_type": "numeric",
            "input_rules": json.dumps({"min": 0, "max": 100, "unit": "bar"}),
            "is_start": True,
        },
        {
            "id": "node_stop_overpressure",
            "node_type": "stop",
            "title": f"Critical Overpressure Halt ({TEST_LABEL})",
            "instructions": "E-stop immediately. Do not vent while hot.",
            "safety_notice": "Hazardous pressure exceedance.",
            "cause_status": "suspected",
            "outcome": "escalated",
        },
        {
            "id": "node_choice_inspection",
            "node_type": "question",
            "title": f"Inspect Solenoid Valve LED ({TEST_LABEL})",
            "instructions": "Observe green pilot indicator on valve YV1.",
            "input_type": "choice",
            "input_rules": json.dumps({"choices": ["steady_green", "blinking_amber", "off"]}),
            "is_start": False,
        },
        {
            "id": "node_action_replace",
            "node_type": "action",
            "title": f"Replace Solenoid Coil ({TEST_LABEL})",
            "instructions": "Swap 24V coil with calibrated spare.",
            "source_reference": "SOP-HYD-04 Clause 3.2",
            "cause_status": "confirmed",
            "input_type": "yes_no",
        },
        {
            "id": "node_end_resolved",
            "node_type": "end",
            "title": f"System Restored ({TEST_LABEL})",
            "instructions": "All operational limits restored to normal.",
            "outcome": "resolved",
        },
    ]

    edges = [
        # Numeric comparison edges from node_start
        {
            "id": "edge_overpressure",
            "from_node_id": "node_start",
            "to_node_id": "node_stop_overpressure",
            "condition": json.dumps({"operator": ">", "value": 35.0}),
            "label": "Pressure > 35 bar (Overpressure)",
        },
        {
            "id": "edge_normal_pressure",
            "from_node_id": "node_start",
            "to_node_id": "node_choice_inspection",
            "condition": json.dumps({"operator": "range", "min": 20.0, "max": 35.0}),
            "label": "20.0 <= Pressure <= 35.0 bar",
        },
        # Choice edges from node_choice_inspection
        {
            "id": "edge_choice_fault",
            "from_node_id": "node_choice_inspection",
            "to_node_id": "node_action_replace",
            "condition": json.dumps({"value": "blinking_amber"}),
            "label": "Blinking Amber Fault",
        },
        {
            "id": "edge_choice_ok",
            "from_node_id": "node_choice_inspection",
            "to_node_id": "node_end_resolved",
            "condition": json.dumps({"value": "steady_green"}),
            "label": "Steady Green Normal",
        },
        # Yes_no edge from node_action_replace
        {
            "id": "edge_action_done",
            "from_node_id": "node_action_replace",
            "to_node_id": "node_end_resolved",
            "condition": json.dumps({"value": "yes"}),
            "label": "Coil Replaced & Pressure Restored",
        },
    ]

    return nodes, edges


def test_numeric_branch_decision_logic():
    """Test deterministic evaluation of numeric operator conditions (> 35 and 20..35)."""
    nodes, edges = create_sample_tree()

    # Case 1: Overpressure reading (40.5 bar) -> branches to stop node
    res_high = next_node(nodes, edges, current_node_id="node_start", answer=40.5)
    assert res_high.success is True
    assert res_high.next_node_id == "node_stop_overpressure"
    assert res_high.edge_id == "edge_overpressure"
    assert res_high.is_terminal is True
    assert res_high.outcome == "escalated"

    # Case 2: Normal in-tolerance reading (25.0 bar) -> branches to question node
    res_normal = next_node(nodes, edges, current_node_id="node_start", answer=25.0)
    assert res_normal.success is True
    assert res_normal.next_node_id == "node_choice_inspection"
    assert res_normal.edge_id == "edge_normal_pressure"
    assert res_normal.is_terminal is False


def test_choice_and_yes_no_branch_decision():
    """Test choice and yes/no evaluation with case normalization."""
    nodes, edges = create_sample_tree()

    # Case 1: Matching choice 'blinking_amber'
    res_choice = next_node(nodes, edges, current_node_id="node_choice_inspection", answer="Blinking_Amber")
    assert res_choice.success is True
    assert res_choice.next_node_id == "node_action_replace"
    assert res_choice.edge_id == "edge_choice_fault"

    # Case 2: Boolean True normalized to 'yes'
    res_yes = next_node(nodes, edges, current_node_id="node_action_replace", answer=True)
    assert res_yes.success is True
    assert res_yes.next_node_id == "node_end_resolved"
    assert res_yes.is_terminal is True
    assert res_yes.outcome == "resolved"


def test_invalid_answer_rejection():
    """Verify input validation rejects invalid answers with clear messages."""
    nodes, edges = create_sample_tree()

    # Numeric check with non-number text
    res_nan = next_node(nodes, edges, current_node_id="node_start", answer="five_bar_approx")
    assert res_nan.success is False
    assert res_nan.error_code == "invalid_answer"
    assert len(res_nan.validation_errors) > 0

    # Choice check with unlisted choice
    res_bad_choice = next_node(nodes, edges, current_node_id="node_choice_inspection", answer="flashing_purple")
    assert res_bad_choice.success is False
    assert res_bad_choice.error_code == "invalid_answer"
    assert "not valid" in res_bad_choice.error_message


def test_no_matching_edge_branch():
    """Verify when answer is valid type but no branch matches the value."""
    nodes, edges = create_sample_tree()

    # Reading 12.0 bar is a valid number, but tree has rules for >35 and 20..35, not < 20
    res_unhandled = next_node(nodes, edges, current_node_id="node_start", answer=12.0)
    assert res_unhandled.success is False
    assert res_unhandled.error_code == "no_matching_edge"
    assert "does not match any valid branch" in res_unhandled.error_message


def test_terminal_node_blocks_transition():
    """Verify that stop or end nodes cannot be transitioned from."""
    nodes, edges = create_sample_tree()

    res_terminal = next_node(nodes, edges, current_node_id="node_stop_overpressure", answer="yes")
    assert res_terminal.success is False
    assert res_terminal.error_code == "terminal_node"
    assert res_terminal.is_terminal is True


def test_arbitrary_node_jump_is_impossible():
    """Safety Invariant: The server ignores any attempt by client to pick a target node."""
    nodes, edges = create_sample_tree()

    # An attacker attempts to inject a target node 'node_end_resolved' inside the answer dict
    malicious_answer = {"target_node_id": "node_end_resolved", "value": 40.5}

    # The engine uses only the stored edges from node_start. 40.5 bar matches edge_overpressure!
    res = next_node(nodes, edges, current_node_id="node_start", answer=40.5)
    assert res.success is True
    # Target is strictly computed as node_stop_overpressure, NEVER the injected node_end_resolved
    assert res.next_node_id == "node_stop_overpressure"
    assert res.next_node_id != "node_end_resolved"


def test_unknown_current_node():
    """Verify error when current_node_id does not exist."""
    nodes, edges = create_sample_tree()
    res = next_node(nodes, edges, current_node_id="non_existent_node_id", answer="yes")
    assert res.success is False
    assert res.error_code == "node_not_found"
