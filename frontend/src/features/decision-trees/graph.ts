/** Pure graph helpers for the decision-tree builder: layout, path enumeration and geometry. */
import type { DecisionEdge, DecisionNode, DecisionNodeType, Point } from './types';

export const NODE_WIDTH = 236;
export const NODE_HEIGHT = 108;
const H_GAP = 64;
const V_GAP = 96;

export const TERMINAL_TYPES: DecisionNodeType[] = ['result', 'end', 'stop', 'escalation'];

export const isTerminal = (node: Pick<DecisionNode, 'node_type'>) => TERMINAL_TYPES.includes(node.node_type);
export const isBranching = (node: Pick<DecisionNode, 'node_type'>) => node.node_type === 'question';

export function startNodeOf(nodes: DecisionNode[]): DecisionNode | undefined {
  return nodes.find((node) => node.is_start);
}

export function outgoing(edges: DecisionEdge[], nodeId: string): DecisionEdge[] {
  return edges.filter((edge) => edge.from_node_id === nodeId).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Layered top-down layout: each step sits one row below its shallowest parent and
 * rows are centred on x = 0. Steps that cannot be reached form trailing rows.
 */
export function autoLayout(nodes: DecisionNode[], edges: DecisionEdge[]): Record<string, Point> {
  const ids = new Set(nodes.map((node) => node.id));
  const depth = new Map<string, number>();
  const start = startNodeOf(nodes);
  const queue: Array<{ id: string; level: number }> = start ? [{ id: start.id, level: 0 }] : [];
  while (queue.length) {
    const { id, level } = queue.shift()!;
    if (depth.has(id) || !ids.has(id)) continue;
    depth.set(id, level);
    outgoing(edges, id).forEach((edge) => edge.to_node_id && queue.push({ id: edge.to_node_id, level: level + 1 }));
  }
  let extra = Math.max(-1, ...depth.values()) + 1;
  nodes.forEach((node) => { if (!depth.has(node.id)) depth.set(node.id, extra++); });

  const rows = new Map<number, string[]>();
  nodes.forEach((node) => rows.set(depth.get(node.id)!, [...(rows.get(depth.get(node.id)!) || []), node.id]));
  const positions: Record<string, Point> = {};
  rows.forEach((row, level) => {
    const width = row.length * NODE_WIDTH + (row.length - 1) * H_GAP;
    row.forEach((id, index) => {
      positions[id] = { x: -width / 2 + index * (NODE_WIDTH + H_GAP), y: level * (NODE_HEIGHT + V_GAP) };
    });
  });
  return positions;
}

export interface TreePath {
  steps: Array<{ nodeId: string; title: string; answer?: string; edgeId?: string }>;
  outcome: 'result' | 'loop' | 'dead_end' | 'missing';
  endTitle: string;
}

/** Every distinct path from the start; loops stop at the repeated step so the count stays finite. */
export function enumeratePaths(nodes: DecisionNode[], edges: DecisionEdge[], limit = 200): TreePath[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const start = startNodeOf(nodes);
  if (!start) return [];
  const paths: TreePath[] = [];
  const walk = (node: DecisionNode, trail: TreePath['steps'], seen: Set<string>) => {
    if (paths.length >= limit) return;
    const out = outgoing(edges, node.id);
    if (isTerminal(node)) {
      paths.push({ steps: trail, outcome: 'result', endTitle: node.title });
      return;
    }
    if (!out.length) {
      paths.push({ steps: trail, outcome: 'dead_end', endTitle: node.title });
      return;
    }
    out.forEach((edge) => {
      const step = { nodeId: node.id, title: node.title, answer: edge.label, edgeId: edge.id };
      const next = edge.to_node_id ? byId.get(edge.to_node_id) : undefined;
      if (!next) {
        paths.push({ steps: [...trail, step], outcome: 'missing', endTitle: `“${edge.label}” has no next step` });
      } else if (seen.has(next.id)) {
        paths.push({ steps: [...trail, step], outcome: 'loop', endTitle: `Loops back to “${next.title}”` });
      } else {
        walk(next, [...trail, step], new Set([...seen, next.id]));
      }
    });
  };
  walk(start, [], new Set([start.id]));
  return paths;
}

/** Where the connector for a given answer leaves its step; question answers fan out along the bottom. */
export function edgeAnchor(from: Point, node: DecisionNode | undefined, edges: DecisionEdge[], edgeId: string): Point {
  if (node && isBranching(node)) {
    const answers = outgoing(edges, node.id);
    const index = Math.max(0, answers.findIndex((edge) => edge.id === edgeId));
    // Matches the answer chips, which are spaced with `justify-around` along the card's bottom.
    const inset = 14; // the card's horizontal padding
    return { x: from.x + inset + ((2 * index + 1) / (2 * answers.length)) * (NODE_WIDTH - inset * 2), y: from.y + NODE_HEIGHT };
  }
  return { x: from.x + NODE_WIDTH / 2, y: from.y + NODE_HEIGHT };
}

/** Smooth vertical connector from an anchor to the top-centre of the target step. */
export function edgePath(anchor: Point, to: Point): { d: string; mid: Point } {
  const tx = to.x + NODE_WIDTH / 2;
  const ty = to.y;
  const forward = ty >= anchor.y;
  const bend = forward ? Math.max(40, (ty - anchor.y) / 2) : 90;
  const d = `M ${anchor.x} ${anchor.y} C ${anchor.x} ${anchor.y + bend}, ${tx} ${ty - bend}, ${tx} ${ty}`;
  return { d, mid: { x: (anchor.x + tx) / 2, y: (anchor.y + ty) / 2 } };
}

/** Default label for a new answer: questions go Yes, No, Not sure; other steps continue. */
export function defaultBranchLabel(source: DecisionNode, edges: DecisionEdge[]): string {
  const used = new Set(outgoing(edges, source.id).map((edge) => edge.label.toLowerCase()));
  if (isBranching(source)) {
    for (const label of ['Yes', 'No', 'Not sure']) if (!used.has(label.toLowerCase())) return label;
    return `Option ${used.size + 1}`;
  }
  return 'Next';
}

/** Steps whose title, instructions or answers contain the query (case-insensitive). */
export function searchNodes(nodes: DecisionNode[], edges: DecisionEdge[], query: string): string[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return nodes
    .filter((node) => [node.title, node.instructions, node.help_text || '', ...outgoing(edges, node.id).map((e) => e.label)]
      .some((text) => text.toLowerCase().includes(term)))
    .map((node) => node.id);
}
