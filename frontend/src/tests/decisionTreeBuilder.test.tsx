import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { autoLayout, defaultBranchLabel, enumeratePaths, searchNodes } from '../features/decision-trees/graph';
import type { DecisionEdge, DecisionGuide, DecisionNode, DecisionVersion } from '../features/decision-trees/types';

const apiMock = vi.hoisted(() => ({
  getGuide: vi.fn(), getVersion: vi.fn(), validateVersion: vi.fn(), listWorkflows: vi.fn(), listMachineMedia: vi.fn(),
  addNode: vi.fn(), updateNode: vi.fn(), deleteNode: vi.fn(), duplicateNode: vi.fn(), savePositions: vi.fn(), addEdge: vi.fn(),
  updateEdge: vi.fn(), deleteEdge: vi.fn(), reorderAnswers: vi.fn(), replaceGraph: vi.fn(), changeStatus: vi.fn(),
  createVersion: vi.fn(), aiDraft: vi.fn(), aiReview: vi.fn(), aiAssist: vi.fn(), uploadMachineMedia: vi.fn(), updateGuide: vi.fn(),
}));
const auth = vi.hoisted(() => ({ permissions: ['knowledge.create'] as string[], userId: 'u1' }));

vi.mock('../features/decision-trees/api', () => ({ decisionTreeApi: apiMock, walkApi: {} }));
vi.mock('../features/knowledge-capture/knowledgeApi', () => ({ fetchAllMachines: vi.fn().mockResolvedValue({ items: [{ id: 'm1', name: 'CT Scanner' }], total: 1 }) }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ hasPermission: (p: string) => auth.permissions.includes(p), user: { id: auth.userId, role_id: 'EXPERT' } }),
}));

import { DecisionTreeBuilderPage } from '../features/decision-trees/DecisionTreeBuilderPage';

const node = (id: string, overrides: Partial<DecisionNode> = {}): DecisionNode => ({
  id, node_type: 'question', title: id, instructions: '', input_type: 'yes_no', is_start: false, media: [], details: {}, origin: 'expert',
  position_x: 0, position_y: 0, ...overrides,
});
const edge = (id: string, from: string, to: string | null, label: string, sort_order = 0): DecisionEdge => ({ id, from_node_id: from, to_node_id: to, label, sort_order });

const tree = () => ({
  nodes: [
    node('start', { node_type: 'start', title: 'Unusual vibration', is_start: true }),
    node('q1', { title: 'Is vibration present?', help_text: 'Rotating parts wear.', position_y: 200 }),
    node('safety', { node_type: 'safety', title: 'Isolate power', safety_warning: 'Lock out first', position_y: 400 }),
    node('worn', { node_type: 'result', title: 'Bearing wear suspected', details: { possible_causes: ['Worn bearing'] }, position_y: 600 }),
    node('ok', { node_type: 'result', title: 'Operating normally', position_x: 300, position_y: 400 }),
  ],
  edges: [edge('e0', 'start', 'q1', 'Next'), edge('e1', 'q1', 'safety', 'Yes', 0), edge('e2', 'q1', 'ok', 'No', 1), edge('e3', 'safety', 'worn', 'Next')],
});

describe('decision tree graph helpers', () => {
  it('enumerates every path and labels how each one ends', () => {
    const { nodes, edges } = tree();
    expect(enumeratePaths(nodes, edges).map((p) => p.outcome)).toEqual(['result', 'result']);
    const broken = [...edges, edge('e4', 'q1', null, 'Not sure', 2), edge('e5', 'ok', 'q1', 'Again')];
    const outcomes = enumeratePaths(nodes, broken).map((p) => p.outcome);
    expect(outcomes).toContain('missing');
    const loop = enumeratePaths([...nodes, node('a', { node_type: 'action' })], [...edges, edge('x', 'q1', 'a', 'Maybe', 3), edge('y', 'a', 'q1', 'Next')]);
    expect(loop.some((p) => p.outcome === 'loop')).toBe(true);
  });

  it('lays out by depth, suggests answer labels and searches answers', () => {
    const { nodes, edges } = tree();
    const layout = autoLayout(nodes, edges);
    expect(layout.start.y).toBeLessThan(layout.q1.y);
    expect(layout.safety.y).toBe(layout.ok.y);
    expect(defaultBranchLabel(nodes[1], edges)).toBe('Not sure');
    expect(defaultBranchLabel(nodes[2], [])).toBe('Next');
    expect(searchNodes(nodes, edges, 'no')).toContain('q1');
  });
});

const guide = (overrides: Partial<DecisionGuide> = {}): DecisionGuide => ({
  id: 'g1', title: 'Unusual vibration', problem_category: 'MECHANICAL', machine_id: 'm1', machine_name: 'CT Scanner', severity: 'HIGH',
  difficulty: 'INTERMEDIATE', tags: [], is_archived: false, status: 'draft', owner_id: 'u1', draft_version_id: 'v1', working_version_id: 'v1',
  stats: { steps: 5, questions: 1, results: 2, versions: 1, sessions: 0 }, created_at: '', updated_at: '', versions: [], ...overrides,
});
const version = (overrides: Partial<DecisionVersion> = {}): DecisionVersion => ({
  id: 'v1', guide_id: 'g1', version_number: 1, status: 'draft', author_id: 'u1', created_at: '', ...tree(), ...overrides,
});

const renderBuilder = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/app/decision-trees/g1']}>
      <Routes><Route path="/app/decision-trees/:guideId" element={<DecisionTreeBuilderPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);
const select = (name: string) => {
  fireEvent.pointerDown(screen.getByRole('button', { name }), { button: 0 });
  fireEvent.pointerUp(window);
};

describe('DecisionTreeBuilderPage', () => {
  beforeEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
    auth.permissions = ['knowledge.create'];
    auth.userId = 'u1';
    apiMock.getGuide.mockResolvedValue(guide());
    apiMock.getVersion.mockResolvedValue(version());
    apiMock.validateVersion.mockResolvedValue({ issues: [] });
    apiMock.listWorkflows.mockResolvedValue([{ id: 'wf1', title: 'Bearing replacement', status: 'APPROVED', machine_id: 'm1' }]);
    apiMock.listMachineMedia.mockResolvedValue([]);
    apiMock.savePositions.mockResolvedValue({ ok: true });
  });

  it('renders steps with their answers and the node library', async () => {
    renderBuilder();
    expect(await screen.findByRole('button', { name: 'Question node: Is vibration present?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Answer Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect answer No' })).toBeInTheDocument();
    for (const label of ['Add Question', 'Add Action', 'Add Safety', 'Add Media', 'Connect Workflow', 'Add Result']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('adds a step connected after the selected step', async () => {
    apiMock.addNode.mockResolvedValue({ node: node('n2', { node_type: 'action', title: 'Perform the approved inspection' }), version: version() });
    renderBuilder();
    await screen.findByRole('button', { name: 'Safety node: Isolate power' });
    select('Safety node: Isolate power');
    fireEvent.click(screen.getByRole('button', { name: 'Add Action' }));
    await waitFor(() => expect(apiMock.addNode).toHaveBeenCalledWith('v1', expect.objectContaining({ node_type: 'action', connect_from: { node_id: 'safety' } })));
  });

  it('adds answers to a question and creates a new step from an answer destination', async () => {
    apiMock.addEdge.mockResolvedValue(edge('e9', 'q1', null, 'Not sure', 2));
    apiMock.addNode.mockResolvedValue({ node: node('n3', { node_type: 'action' }), version: version() });
    renderBuilder();
    await screen.findByRole('button', { name: 'Question node: Is vibration present?' });
    select('Question node: Is vibration present?');
    fireEvent.click(screen.getByRole('button', { name: 'Add Answer' }));
    await waitFor(() => expect(apiMock.addEdge).toHaveBeenCalledWith('v1', { from_node_id: 'q1', label: 'Not sure', to_node_id: null }));
    const panel = screen.getByRole('complementary', { name: 'Node properties' });
    fireEvent.change(within(panel).getByLabelText('Next step for No'), { target: { value: 'new:action' } });
    await waitFor(() => expect(apiMock.addNode).toHaveBeenCalledWith('v1', expect.objectContaining({ node_type: 'action', connect_from: { node_id: 'q1', edge_id: 'e2' } })));
  });

  it('undoes a deletion by restoring the previous snapshot', async () => {
    const after = version({ nodes: tree().nodes.filter((n) => n.id !== 'ok'), edges: tree().edges.map((e) => (e.to_node_id === 'ok' ? { ...e, to_node_id: null } : e)) });
    apiMock.deleteNode.mockResolvedValue(after);
    apiMock.replaceGraph.mockResolvedValue(version());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderBuilder();
    await screen.findByRole('button', { name: 'Result node: Operating normally' });
    select('Result node: Operating normally');
    fireEvent.keyDown(window, { key: 'Delete' });
    await waitFor(() => expect(apiMock.deleteNode).toHaveBeenCalledWith('ok'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Result node: Operating normally' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(apiMock.replaceGraph).toHaveBeenCalled());
    const snapshot = apiMock.replaceGraph.mock.calls[0][1];
    expect(snapshot.nodes.map((n: DecisionNode) => n.id)).toContain('ok');
    expect(await screen.findByRole('button', { name: 'Result node: Operating normally' })).toBeInTheDocument();
  });

  it('shows server validation problems when submitting fails', async () => {
    const { ApiClientError } = await import('../lib/api/client');
    apiMock.changeStatus.mockRejectedValue(new ApiClientError(400, 'tree_invalid', '1 problem must be fixed first', {
      issues: [{ level: 'error', code: 'missing_destination', message: 'Answer "No" on "Is vibration present?" has no next step.', node_id: 'q1' }],
    }));
    renderBuilder();
    fireEvent.click(await screen.findByRole('button', { name: /Submit for approval/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Test decision tree' });
    expect(within(dialog).getByText(/has no next step/)).toBeInTheDocument();
  });

  it('only lets a different reviewer approve a submitted tree', async () => {
    auth.permissions = ['knowledge.create', 'knowledge.approve'];
    apiMock.getVersion.mockResolvedValue(version({ status: 'in_review', author_id: 'u1' }));
    renderBuilder();
    expect(await screen.findByText('Waiting for another expert to approve')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
  });

  it('lets a reviewer approve someone else’s tree', async () => {
    auth.permissions = ['knowledge.create', 'knowledge.approve'];
    auth.userId = 'u2';
    apiMock.getVersion.mockResolvedValue(version({ status: 'in_review', author_id: 'u1' }));
    apiMock.changeStatus.mockResolvedValue(version({ status: 'published' }));
    renderBuilder();
    fireEvent.click(await screen.findByRole('button', { name: /Approve & publish/ }));
    await waitFor(() => expect(apiMock.changeStatus).toHaveBeenCalledWith('v1', 'approve', undefined));
  });

  it('runs every path and previews the draft exactly as a trainee', async () => {
    renderBuilder();
    fireEvent.click(await screen.findByRole('button', { name: /Test/ }));
    fireEvent.click(await screen.findByRole('tab', { name: /Paths \(2\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Run path 1' }));
    const preview = await screen.findByRole('dialog', { name: 'Preview as trainee' });
    expect(within(preview).getByText('Troubleshooting completed')).toBeInTheDocument();
    expect(within(preview).getByText('Worn bearing')).toBeInTheDocument();
    expect(within(preview).getByText(/not a confirmed diagnosis/)).toBeInTheDocument();
  });

  it('keeps published versions read-only and offers a new draft', async () => {
    apiMock.getGuide.mockResolvedValue(guide({ status: 'published', draft_version_id: null, current_published_version_id: 'v1' }));
    apiMock.getVersion.mockResolvedValue(version({ status: 'published' }));
    renderBuilder();
    expect(await screen.findByRole('button', { name: 'Edit as new draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Question' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Connect answer/ })).not.toBeInTheDocument();
  });

  it('generates an AI draft that stays reviewable', async () => {
    const drafted = version({ nodes: [...tree().nodes, node('ai1', { title: 'Check mounts', node_type: 'action', origin: 'ai_draft' })] });
    apiMock.aiDraft.mockResolvedValue({ draft_id: 'd1', summary: { steps: 1, branches: 0, sources_used: 1, unsourced_steps: 1 }, sources: [{ id: 'S1', title: 'Gantry manual' }], version: drafted });
    renderBuilder();
    fireEvent.click(await screen.findByRole('button', { name: /AI draft/ }));
    const dialog = screen.getByRole('dialog', { name: 'Generate draft with AI' });
    fireEvent.click(within(dialog).getByLabelText(/Replace the current steps/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate draft' }));
    expect(await within(dialog).findByText(/Gantry manual/)).toBeInTheDocument();
    expect(within(dialog).getByText(/had no approved source/)).toBeInTheDocument();
    expect(apiMock.aiDraft).toHaveBeenCalledWith('v1', expect.stringContaining('unusual vibration'), true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Review the draft' }));
    expect(await screen.findByTitle('AI draft — needs expert review')).toBeInTheDocument();
  });
});
