import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DecisionNode, WalkState } from '../features/decision-trees/types';

const walkMock = vi.hoisted(() => ({
  catalog: vi.fn(), history: vi.fn(), start: vi.fn(), get: vi.fn(), answer: vi.fn(), back: vi.fn(), restart: vi.fn(),
  escalate: vi.fn(), explain: vi.fn(), startWorkflow: vi.fn(),
}));
vi.mock('../features/decision-trees/api', () => ({ walkApi: walkMock, decisionTreeApi: {} }));

import { TroubleshootHubPage } from '../features/decision-trees/trainee/TroubleshootHubPage';
import { TroubleshootWalkPage } from '../features/decision-trees/trainee/TroubleshootWalkPage';
import { TroubleshootTreeSessionPage } from '../features/decision-trees/trainee/TroubleshootTreeSessionPage';

const node = (overrides: Partial<DecisionNode>): DecisionNode & { workflow: null } => ({
  id: 'q1', node_type: 'question', title: 'Is the machine vibrating during operation?', instructions: 'Stand next to the gantry.', input_type: 'yes_no',
  is_start: false, media: [], details: { technical_terms: [{ term: 'Gantry', definition: 'The rotating ring' }] }, origin: 'expert',
  help_text: 'Vibration points to rotating parts.', workflow: null, ...overrides,
});

const state = (overrides: Partial<WalkState> = {}): WalkState => ({
  session_id: 's1', guide: { id: 'g1', title: 'Unusual vibration', problem_category: 'MECHANICAL', difficulty: 'BEGINNER', severity: 'HIGH' },
  version_id: 'v1', version_is_current: true, machine_id: 'm1', machine_name: 'CT Scanner', status: 'in_progress',
  tree: {
    current_node_id: 'q1', stage: 'in_progress',
    nodes: [
      { id: 'start', node_type: 'start', kind: 'start', kind_label: 'Start', title: 'Unusual vibration', status: 'completed', is_start: true, is_final: false, critical: false, evidence_found: false, visit_order: 1, instructions: 'Confirm the reported issue.', media: [], safety: null, terms: [], workflow: null, findings: [], actions: [] },
      { id: 'q1', node_type: 'question', kind: 'decision', kind_label: 'Diagnostic decision', title: 'Is the machine vibrating during operation?', status: 'current', is_start: false, is_final: false, critical: false, evidence_found: false, visit_order: 2, instructions: 'Stand next to the gantry.', media: [], safety: null, terms: [], workflow: null, findings: [], actions: [{ edge_id: 'e-yes', label: 'Yes', kind: 'advance', done: false, attempted_wrong: false }, { edge_id: 'e-no', label: 'No', kind: 'advance', done: false, attempted_wrong: false }, { edge_id: 'e-ns', label: 'Not sure', kind: 'advance', done: false, attempted_wrong: false }] },
      { id: 'locked', node_type: 'result', kind: 'fault_identification', kind_label: 'Troubleshooting result', title: 'Operating normally', status: 'locked', is_start: false, is_final: true, critical: false, evidence_found: false, instructions: 'No vibration-related fault found.', media: [], safety: null, terms: [], workflow: null, findings: [], actions: [] },
    ],
    edges: [
      { id: 'e-start', source: 'start', target: 'q1', label: 'Next', status: 'completed', conditional: false },
      { id: 'e-yes', source: 'q1', target: 'locked', label: 'Yes', status: 'available', conditional: false },
      { id: 'e-no', source: 'q1', target: 'locked', label: 'No', status: 'locked', conditional: false },
      { id: 'e-ns', source: 'q1', target: 'locked', label: 'Not sure', status: 'locked', conditional: false },
    ],
  },
  current_node: node({}), answers: [
    { id: 'e-yes', from_node_id: 'q1', to_node_id: 'a', label: 'Yes', sort_order: 0 },
    { id: 'e-no', from_node_id: 'q1', to_node_id: 'b', label: 'No', sort_order: 1 },
    { id: 'e-ns', from_node_id: 'q1', to_node_id: 'c', label: 'Not sure', sort_order: 2 },
  ],
  path: [{ index: 0, node_id: 'start', title: 'Unusual vibration', type: 'start', answer: 'Next', answered_at: '' }],
  step_number: 2, is_terminal: false, report: null, escalation: null, started_at: '2026-10-30T10:00:00Z', ...overrides,
});

const finished = (): WalkState => state({
  status: 'resolved', is_terminal: true, answers: [], current_node: node({ id: 'r', node_type: 'result', title: 'Bearing wear suspected' }),
  path: [
    { index: 0, node_id: 'start', title: 'Unusual vibration', type: 'start', answer: 'Next', answered_at: '' },
    { index: 1, node_id: 'q1', title: 'Is the machine vibrating during operation?', type: 'question', answer: 'Yes', answered_at: '' },
  ],
  report: {
    machine_name: 'CT Scanner', problem: 'Unusual vibration', result_title: 'Bearing wear suspected', summary: 'Vibration localised to the gantry.',
    observations: [{ question: 'Is the machine vibrating during operation?', answer: 'Yes' }],
    decision_path: [{ step: 'Unusual vibration', type: 'start', answer: 'Next' }, { step: 'Is the machine vibrating during operation?', type: 'question', answer: 'Yes' }],
    possible_causes: ['Worn gantry bearing'], recommended_actions: ['Request a service engineer'], escalation: null,
    safety: ['Lock out the gantry'], media: [], references: [{ type: 'knowledge', id: 'kv1', item_id: 'k1', title: 'Gantry manual' }],
    workflow: { id: 'wf1', title: 'Bearing replacement', available: true }, duration_seconds: 240,
  },
});

const renderAt = (path: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/troubleshooting/guided" element={<TroubleshootHubPage />} />
        <Route path="/app/troubleshooting/guided/:sessionId" element={<TroubleshootWalkPage />} />
        <Route path="/app/troubleshooting/tree/:sessionId" element={<TroubleshootTreeSessionPage />} />
        <Route path="/app/guided-workflows" element={<p>Guided workflow opened</p>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

describe('Trainee guided troubleshooting', () => {
  beforeEach(() => {
    Object.values(walkMock).forEach((fn) => fn.mockReset());
    walkMock.history.mockResolvedValue([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('picks a machine, then a problem, and starts a session', async () => {
    walkMock.catalog.mockResolvedValue({
      machines: [{ id: 'm1', name: 'CT Scanner', category: 'Imaging', tree_count: 2, problem_categories: ['MECHANICAL', 'THERMAL'], cover_media: null }],
      trees: [
        { id: 'g1', title: 'Unusual vibration', description: 'Gantry shakes', machine_id: 'm1', machine_name: 'CT Scanner', problem_category: 'MECHANICAL', difficulty: 'BEGINNER', estimated_minutes: 10, tags: [], stats: {} },
        { id: 'g2', title: 'Overheating', machine_id: 'm1', machine_name: 'CT Scanner', problem_category: 'THERMAL', difficulty: 'ADVANCED', tags: [], stats: {} },
      ],
    });
    walkMock.start.mockResolvedValue(state());
    walkMock.get.mockResolvedValue(state());
    renderAt('/app/troubleshooting/guided');
    fireEvent.click(await screen.findByRole('button', { name: /CT Scanner/ }));
    expect(screen.getByText('~10 min')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start troubleshooting: Unusual vibration' }));
    await waitFor(() => expect(walkMock.start).toHaveBeenCalledWith('g1'));
    expect(await screen.findByRole('heading', { name: 'Is the machine vibrating during operation?' })).toBeInTheDocument();
  });

  it('shows the published branch diagram and answers from the current branch', async () => {
    walkMock.get.mockResolvedValue(state());
    walkMock.answer.mockResolvedValue(state({ current_node: node({ id: 'next', node_type: 'action', title: 'Inspect the gantry' }) }));
    renderAt('/app/troubleshooting/tree/s1');
    expect(await screen.findByRole('region', { name: 'Troubleshooting decision tree' })).toBeInTheDocument();
    const start = screen.getByRole('button', { name: /Unusual vibration, Visited/ });
    const question = screen.getByRole('button', { name: /Is the machine vibrating during operation\?, Current step/ });
    expect(Number.parseInt(question.style.top, 10)).toBeGreaterThan(Number.parseInt(start.style.top, 10));
    expect(screen.getByRole('button', { name: /Operating normally, Later in tree/ })).toBeInTheDocument();
    expect(screen.getByText('Not sure')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Missions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Badges & skills' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose branch Yes' }));
    await waitFor(() => expect(walkMock.answer).toHaveBeenCalledWith('s1', 'e-yes'));
  });

  it('shows one question at a time and moves along the chosen branch', async () => {
    walkMock.get.mockResolvedValue(state());
    walkMock.answer.mockResolvedValue(state({ current_node: node({ id: 'a', node_type: 'safety', title: 'Isolate power', safety_warning: 'Lock out the gantry' }),
      answers: [{ id: 'e-next', from_node_id: 'a', to_node_id: 'x', label: 'Next', sort_order: 0 }], step_number: 3 }));
    renderAt('/app/troubleshooting/guided/s1');
    const answers = await screen.findByRole('group', { name: 'Choose an answer' });
    expect(within(answers).getAllByRole('button')).toHaveLength(3);
    fireEvent.click(within(answers).getByRole('button', { name: /Yes/ }));
    await waitFor(() => expect(walkMock.answer).toHaveBeenCalledWith('s1', 'e-yes'));
    expect(await screen.findByRole('heading', { name: 'Isolate power' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Lock out the gantry');
    expect(screen.getByRole('button', { name: /I understand — continue/ })).toBeInTheDocument();
  });

  it('changing an earlier answer goes back and clears later answers', async () => {
    walkMock.get.mockResolvedValue(finished());
    walkMock.back.mockResolvedValue(state());
    renderAt('/app/troubleshooting/guided/s1');
    fireEvent.click(await screen.findByRole('button', { name: 'Change answer to Is the machine vibrating during operation?' }));
    await waitFor(() => expect(walkMock.back).toHaveBeenCalledWith('s1', 1));
    expect(await screen.findByRole('group', { name: 'Choose an answer' })).toBeInTheDocument();
  });

  it('shows a final report that separates observations from possible causes', async () => {
    walkMock.get.mockResolvedValue(finished());
    walkMock.startWorkflow.mockResolvedValue({ id: 'run-1' });
    renderAt('/app/troubleshooting/guided/s1');
    expect(await screen.findByText('Troubleshooting completed')).toBeInTheDocument();
    expect(screen.getByText('What you observed')).toBeInTheDocument();
    expect(screen.getByText('Worn gantry bearing')).toBeInTheDocument();
    expect(screen.getByText(/Possible causes are not a confirmed diagnosis/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gantry manual' })).toHaveAttribute('href', '/app/knowledge/k1');
    fireEvent.click(screen.getByRole('button', { name: /Start guided workflow/ }));
    await waitFor(() => expect(walkMock.startWorkflow).toHaveBeenCalledWith('wf1'));
    expect(await screen.findByText('Guided workflow opened')).toBeInTheDocument();
  });

  it('escalates from the final report', async () => {
    walkMock.get.mockResolvedValue(finished());
    walkMock.escalate.mockResolvedValue({ ...finished(), status: 'escalated', escalation: { status: 'pending', requested_at: '' } });
    renderAt('/app/troubleshooting/guided/s1');
    fireEvent.click(await screen.findByRole('button', { name: /Contact expert/ }));
    fireEvent.change(screen.getByLabelText('What should the expert know?'), { target: { value: 'Noise got louder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to expert' }));
    await waitFor(() => expect(walkMock.escalate).toHaveBeenCalledWith('s1', 'Noise got louder'));
    expect(await screen.findByText(/An expert has been asked to review/)).toBeInTheDocument();
  });

  it('explains the current question with the AI Tutor and flags uncertainty', async () => {
    walkMock.get.mockResolvedValue(state());
    walkMock.explain.mockResolvedValue({ answer: 'The gantry is the ring that rotates.', uncertain: true, escalate: true, sources: [],
      notice: 'This explanation is not backed by approved knowledge.' });
    renderAt('/app/troubleshooting/guided/s1');
    fireEvent.click(await screen.findByRole('button', { name: 'Explain this question' }));
    const tutor = await screen.findByRole('dialog', { name: 'AI Tutor' });
    await waitFor(() => expect(walkMock.explain).toHaveBeenCalledWith('s1', 'Explain this question in simple words'));
    expect(await within(tutor).findByText('The gantry is the ring that rotates.')).toBeInTheDocument();
    expect(within(tutor).getByText(/not backed by approved knowledge/)).toBeInTheDocument();
    expect(within(tutor).getByRole('button', { name: /Contact an expert/ })).toBeInTheDocument();
  });

  it('lists previous sessions with resume and report links', async () => {
    walkMock.catalog.mockResolvedValue({ machines: [], trees: [] });
    walkMock.history.mockResolvedValue([
      { session_id: 's1', guide_id: 'g1', guide_title: 'Unusual vibration', machine_name: 'CT Scanner', status: 'in_progress', steps_answered: 2, path: ['Next', 'Yes'], current_step: 'Isolate power', started_at: '2026-10-30T10:00:00Z', is_latest_version: true },
      { session_id: 's2', guide_id: 'g1', guide_title: 'Unusual vibration', machine_name: 'CT Scanner', status: 'resolved', steps_answered: 3, path: ['Next', 'No'], result_title: 'Operating normally', started_at: '2026-10-29T10:00:00Z', duration_seconds: 120, is_latest_version: true },
    ]);
    renderAt('/app/troubleshooting/guided?tab=history');
    const list = await screen.findByRole('list', { name: 'Previous sessions' });
    expect(within(list).getByText('Resume')).toBeInTheDocument();
    expect(within(list).getByText(/Result: Operating normally/)).toBeInTheDocument();
  });
});
