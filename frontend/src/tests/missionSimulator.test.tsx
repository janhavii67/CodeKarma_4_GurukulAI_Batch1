import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MissionAttempt, MissionSummary } from '../features/simulator/types';

const apiMock = vi.hoisted(() => ({
  missions: vi.fn(), profile: vi.fn(), briefing: vi.fn(), leaderboard: vi.fn(), start: vi.fn(), attempt: vi.fn(), inspect: vi.fn(),
  act: vi.fn(), hint: vi.fn(), diagnose: vi.fn(), correct: vi.fn(), verify: vi.fn(), pause: vi.fn(), resume: vi.fn(), abandon: vi.fn(), explain: vi.fn(),
}));
vi.mock('../features/simulator/api', () => ({ simulatorApi: apiMock }));

import { MissionControlPage } from '../features/simulator/MissionControlPage';
import { MissionBriefingPage } from '../features/simulator/MissionBriefingPage';
import { MissionPlayerPage } from '../features/simulator/MissionPlayerPage';

const mission = (overrides: Partial<MissionSummary> = {}): MissionSummary => ({
  id: 'g1', mission_code: 'CT-014', title: 'Gantry vibration', alert: 'Vibration alarm', briefing_preview: 'Operator reports shaking.',
  problem_category: 'MECHANICAL', difficulty: 'INTERMEDIATE', estimated_minutes: 12, xp_reward: 200, skills: ['Vibration analysis'],
  machine_name: 'CT Scanner', attempts: 0, best_score: null, status: 'new', in_progress_attempt_id: null, locked: false, locked_reason: null,
  leaderboard: false, ...overrides,
});

const profile = {
  total_xp: 150, level: 2, next_level_xp: 400, completed: 1, skills: [{ skill: 'Vibration analysis', score: 82, missions: 1 }], history: [],
  achievements: [{ code: 'first_responder', title: 'First Responder', description: 'Complete your first mission.', earned_at: '2026-10-30T10:00:00Z' },
    { code: 'safety_first', title: 'Safety First', description: 'No safety violations.', earned_at: null }],
};

const baseAttempt = (overrides: Partial<MissionAttempt> = {}): MissionAttempt => ({
  id: 'a1', status: 'in_progress', stage: 'investigate', paused: false, elapsed_seconds: 65,
  mission: { id: 'g1', code: 'CT-014', title: 'Gantry vibration', difficulty: 'INTERMEDIATE', objective: 'Find the root cause.', machine_name: 'CT Scanner', xp_reward: 200, equipment: ['Vibration meter'], zones: ['mechanical', 'sensors'] },
  current: {
    id: 'q', node_type: 'question', kind: 'multi_action', kind_label: 'Multi-check investigation', title: 'Initial assessment', instructions: 'Gather evidence before deciding.',
    media: [], safety: { warning: null, ppe: [], precautions: [], restricted: [] }, needs_ack: false, has_inspection: false, inspected: false,
    min_checks: 2, checks_done: 0, critical: false, terms: [], workflow: null,
    actions: [
      { edge_id: 'r1', label: 'Read vibration indicator', zone: 'sensors', kind: 'check', done: false, attempted_wrong: false },
      { edge_id: 'r2', label: 'Listen to recorded sound', zone: 'mechanical', kind: 'check', done: false, attempted_wrong: false },
      { edge_id: 'c', label: 'Proceed to bearing inspection', zone: null, kind: 'advance', done: false, attempted_wrong: false },
      { edge_id: 'w', label: 'Replace the detector', zone: null, kind: 'advance', done: false, attempted_wrong: false },
    ],
  },
  evidence: [], events: [], last_event: null, hints: { used: {}, current: {} }, safety: { violations: 0, status: 'ok' },
  map: { stages: [{ node_id: 's', kind: 'start', label: 'Mission start', title: 'Gantry vibration', status: 'done' }, { node_id: 'q', kind: 'multi_action', label: 'Multi-check investigation', title: 'Initial assessment', status: 'current' }],
    branches: [{ label: 'Proceed to bearing inspection', locked: false }], resolution: [{ key: 'diagnose', label: 'Root cause', status: 'locked' }, { key: 'correct', label: 'Corrective action', status: 'locked' }, { key: 'verify', label: 'Verification', status: 'locked' }], progress: 15 },
  tree: { current_node_id: 'q', stage: 'investigate', nodes: [
    { id: 's', node_type: 'start', kind: 'start', kind_label: 'Mission start', title: 'Gantry vibration', status: 'completed', is_start: true, is_final: false, critical: false, evidence_found: false, visit_order: 1, instructions: '', media: [], safety: null, terms: [], workflow: null, findings: [], actions: [] },
    { id: 'q', node_type: 'question', kind: 'multi_action', kind_label: 'Multi-check investigation', title: 'Initial assessment', status: 'current', is_start: false, is_final: false, critical: false, evidence_found: false, visit_order: 2, instructions: 'Gather evidence before deciding.', media: [], safety: null, terms: [], workflow: null, findings: [], actions: [] },
    { id: 'locked', node_type: 'result', kind: 'fault_identification', kind_label: 'Fault identification', title: 'Fault identification', status: 'locked', is_start: false, is_final: true, critical: false, evidence_found: false, instructions: '', media: [], safety: null, terms: [], workflow: null, findings: [], actions: [] },
  ], edges: [
    { id: 'sq', source: 's', target: 'q', label: 'Begin', status: 'completed', conditional: false },
    { id: 'qf', source: 'q', target: 'locked', label: null, status: 'locked', conditional: true },
  ] },
  score_preview: { total: 5, breakdown: { root_cause: 0, decisions: 0, safety: 20, evidence: 10, corrective: 0, assistance: 5, efficiency: 0 },
    max: { root_cause: 30, decisions: 20, safety: 20, evidence: 10, corrective: 10, assistance: 5, efficiency: 5 }, missed_checkpoints: [], evidence_found: 0, evidence_available: 1, xp_projected: 10 },
  diagnosis: null, corrective: null, verification: null, report: null, ...overrides,
});

const renderAt = (path: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/troubleshooting/interactive" element={<MissionControlPage />} />
        <Route path="/app/troubleshooting/interactive/missions/:missionId" element={<MissionBriefingPage />} />
        <Route path="/app/troubleshooting/interactive/attempts/:attemptId" element={<MissionPlayerPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

describe('Mission Control', () => {
  beforeEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
    apiMock.profile.mockResolvedValue(profile);
  });

  it('lists missions with rewards, locks and resume, plus badges', async () => {
    apiMock.missions.mockResolvedValue([
      mission({ status: 'in_progress', in_progress_attempt_id: 'a1', attempts: 1 }),
      mission({ id: 'g2', mission_code: 'MR-002', title: 'Cooling failure', difficulty: 'ADVANCED', locked: true, locked_reason: 'Score 60+ on an Intermediate mission to unlock.' }),
    ]);
    renderAt('/app/troubleshooting/interactive');
    expect(await screen.findByRole('link', { name: 'Start interactive tree CT-014: Gantry vibration' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cooling failure (locked)')).toHaveTextContent('Score 60+');
    expect(screen.getByRole('link', { name: /Resume mission CT-014/ })).toHaveAttribute('href', '/app/troubleshooting/interactive/attempts/a1');
    expect(screen.getByText('L2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Badges & skills/ }));
    expect(screen.getByText('First Responder')).toBeInTheDocument();
    expect(screen.getByText('Vibration analysis')).toBeInTheDocument();
  });

  it('shows a mission briefing and starts the mission', async () => {
    apiMock.briefing.mockResolvedValue({ ...mission(), scenario: 'The gantry shakes during scans.', objective: 'Find the root cause.', symptoms: ['Shaking'],
      equipment: ['Vibration meter'], safety: ['Lock out before opening covers.'], criteria: ['Identify the root cause'], zones: ['mechanical'], version_id: 'v1' });
    apiMock.start.mockResolvedValue(baseAttempt());
    apiMock.attempt.mockResolvedValue(baseAttempt());
    renderAt('/app/troubleshooting/interactive/missions/g1');
    expect(await screen.findByText('MISSION #CT-014')).toBeInTheDocument();
    expect(screen.getByText('Lock out before opening covers.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /START MISSION/ }));
    await waitFor(() => expect(apiMock.start).toHaveBeenCalledWith('g1', false));
    expect(await screen.findByRole('heading', { name: 'Initial assessment', level: 2 })).toBeInTheDocument();
  });

  it('opens the live troubleshooting tree directly from the main tree list', async () => {
    apiMock.missions.mockResolvedValue([mission()]);
    apiMock.start.mockResolvedValue(baseAttempt());
    apiMock.attempt.mockResolvedValue(baseAttempt());
    renderAt('/app/troubleshooting/interactive');
    fireEvent.click(await screen.findByRole('link', { name: 'Start interactive tree CT-014: Gantry vibration' }));
    await waitFor(() => expect(apiMock.start).toHaveBeenCalledWith('g1'));
    expect(await screen.findByRole('region', { name: 'Complete troubleshooting tree' })).toBeInTheDocument();
  });
});

describe('Mission player', () => {
  beforeEach(() => Object.values(apiMock).forEach((fn) => fn.mockReset()));

  it('renders the full published tree while concealing locked diagnosis details', async () => {
    const attempt = baseAttempt();
    attempt.tree.nodes[0].evidence_found = true;
    attempt.tree.nodes[0].findings = [{ key: 'node:s', node_id: 's', title: 'Initial condition', clue: 'Initial condition confirmed.', step: 'Mission start', at: '2026-10-30T10:00:00Z' }];
    apiMock.attempt.mockResolvedValue(attempt);
    renderAt('/app/troubleshooting/interactive/attempts/a1');
    expect(await screen.findByRole('region', { name: 'Complete troubleshooting tree' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Initial assessment, Current stage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fault identification, Locked' })).toBeDisabled();
    expect(screen.queryByText('Bearing wear')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Center current' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gantry vibration, Completed, evidence found/ }));
    expect(await screen.findByText('Initial condition confirmed.')).toBeInTheDocument();
  });

  it('shows a recovery message when the server returns an old payload without tree data', async () => {
    apiMock.attempt.mockResolvedValue({ ...baseAttempt(), tree: undefined, score_preview: undefined } as unknown as MissionAttempt);
    renderAt('/app/troubleshooting/interactive/attempts/a1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Tree data is unavailable for this attempt.');
    fireEvent.click(screen.getByRole('button', { name: 'Reload tree data' }));
    await waitFor(() => expect(apiMock.attempt).toHaveBeenCalledTimes(2));
  });

  it('runs diagnostic checks, shows discovered clues and wrong-decision feedback', async () => {
    apiMock.attempt.mockResolvedValue(baseAttempt());
    apiMock.act.mockImplementation(async (_id: string, edgeId: string) => edgeId === 'r1'
      ? baseAttempt({ evidence: [{ key: 'edge:r1', node_id: 'q', title: 'Read vibration indicator', clue: 'Above reference range', reading: { label: 'Vibration', value: '7.2', unit: 'mm/s', normal: '< 4.5' }, zone: 'sensors', step: 'Initial assessment', at: '' }],
          last_event: { type: 'check', at: '1', label: 'Read vibration indicator', outcome: 'evidence', clue: 'Above reference range' } })
      : baseAttempt({ last_event: { type: 'decision', at: '2', label: 'Replace the detector', outcome: 'wrong', feedback: 'Detector faults cause image artifacts.' } }));
    renderAt('/app/troubleshooting/interactive/attempts/a1');
    fireEvent.click(await screen.findByRole('button', { name: /Read vibration indicator/ }));
    await waitFor(() => expect(apiMock.act).toHaveBeenCalledWith('a1', 'r1', false));
    expect(await screen.findByText('Clue discovered · Read vibration indicator')).toBeInTheDocument();
    expect(screen.getAllByText('7.2').length).toBeGreaterThan(0);
    fireEvent.click(within(screen.getByRole('group', { name: 'Decisions' })).getByRole('button', { name: /Replace the detector/ }));
    expect(await screen.findByText(/Detector faults cause image artifacts/)).toBeInTheDocument();
  });

  it('filters actions by machine zone', async () => {
    apiMock.attempt.mockResolvedValue(baseAttempt());
    renderAt('/app/troubleshooting/interactive/attempts/a1');
    fireEvent.click(await screen.findByRole('button', { name: /^Mechanical, checks available/ }));
    const checks = screen.getByRole('region', { name: /Diagnostic actions/ });
    expect(within(checks).queryByRole('button', { name: /Read vibration indicator/ })).not.toBeInTheDocument();
    expect(within(checks).getByRole('button', { name: /Listen to recorded sound/ })).toBeInTheDocument();
  });

  it('enforces the safety checklist before continuing', async () => {
    apiMock.attempt.mockResolvedValue(baseAttempt({ current: { ...baseAttempt().current!, kind: 'safety_checkpoint', kind_label: 'Safety checkpoint', title: 'Isolate the gantry',
      needs_ack: true, safety: { warning: 'Lock out first', ppe: ['Gloves'], precautions: [], restricted: [] },
      actions: [{ edge_id: 'n', label: 'Next', zone: null, kind: 'advance', done: false, attempted_wrong: false }] } }));
    apiMock.act.mockResolvedValue(baseAttempt());
    renderAt('/app/troubleshooting/interactive/attempts/a1');
    const proceed = await screen.findByRole('button', { name: /Confirm safety and continue/ });
    expect(proceed).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Lock out first'));
    fireEvent.click(screen.getByLabelText('Wearing: Gloves'));
    expect(proceed).toBeEnabled();
    fireEvent.click(proceed);
    await waitFor(() => expect(apiMock.act).toHaveBeenCalledWith('a1', 'n', true));
  });

  it('uses graded hints', async () => {
    apiMock.attempt.mockResolvedValue(baseAttempt());
    apiMock.hint.mockResolvedValue({ hint: 'Start with the indicators.', attempt: baseAttempt({ hints: { used: { '2': 1 }, current: { '2': 'Start with the indicators.' } } }) });
    renderAt('/app/troubleshooting/interactive/attempts/a1');
    fireEvent.click(await screen.findByRole('button', { name: /Smart hint/ }));
    await waitFor(() => expect(apiMock.hint).toHaveBeenCalledWith('a1', 2));
    expect(await screen.findByText('Start with the indicators.')).toBeInTheDocument();
  });

  it('submits a diagnosis and the corrective procedure', async () => {
    apiMock.attempt.mockResolvedValue(baseAttempt({ stage: 'diagnose', current: { ...baseAttempt().current!, actions: [] }, diagnosis: { options: ['Worn gantry bearing', 'Loose cover panel'] } }));
    apiMock.diagnose.mockResolvedValue(baseAttempt({ stage: 'correct', current: { ...baseAttempt().current!, actions: [] },
      corrective: { options: ['Replace the bearing', 'Tighten cover fasteners'], fault: 'Bearing wear', safety: ['Lock out'], tools: ['Torque wrench'], expected: null, retries: 0 } }));
    apiMock.correct.mockResolvedValue(baseAttempt({ stage: 'verify', current: { ...baseAttempt().current!, actions: [] }, verification: { conditions: ['Test scan has no alarm'], fault: 'Bearing wear' } }));
    renderAt('/app/troubleshooting/interactive/attempts/a1');
    fireEvent.click(await screen.findByRole('button', { name: 'Worn gantry bearing' }));
    fireEvent.click(screen.getByRole('button', { name: /Submit diagnosis/ }));
    await waitFor(() => expect(apiMock.diagnose).toHaveBeenCalledWith('a1', ['Worn gantry bearing']));
    fireEvent.click(await screen.findByLabelText('Replace the bearing'));
    fireEvent.click(screen.getByRole('button', { name: /Apply corrective actions/ }));
    await waitFor(() => expect(apiMock.correct).toHaveBeenCalledWith('a1', ['Replace the bearing']));
    expect(await screen.findByText('Test scan has no alarm')).toBeInTheDocument();
  });

  it('renders the performance report with replay and mistakes', async () => {
    apiMock.attempt.mockResolvedValue(baseAttempt({ status: 'completed', stage: 'complete', report: {
      score: { total: 73, breakdown: { root_cause: 30, decisions: 10, safety: 10, evidence: 10, corrective: 8, assistance: 5, efficiency: 0 },
        max: { root_cause: 30, decisions: 20, safety: 20, evidence: 10, corrective: 10, assistance: 5, efficiency: 5 }, missed_checkpoints: [], evidence_found: 3, evidence_available: 3,
        xp_earned: 146, xp_awarded: 246, previous_best: null, is_personal_best: true },
      stats: { wrong: 1, acceptable: 0, premature: 2, unnecessary: 1, violations: 1, hints_smart: 0, hints_expert: 0, time_seconds: 312 },
      diagnosis: { chosen: ['Worn gantry bearing'], correct: ['Worn gantry bearing'], accuracy: 1, reached_target: true },
      corrective: { chosen: ['Replace the bearing'], correct: ['Replace the bearing'], accuracy: 1, complete: true },
      fault: { title: 'Bearing wear' },
      replay: [{ node_id: 'q', title: 'Initial assessment', kind: 'multi_action', kind_label: 'Multi-check investigation', your_choice: 'Proceed', approved_choice: 'Proceed', matches: true, on_approved_path: true, checks: ['Read vibration indicator'],
        missteps: [{ label: 'Open covers while rotating', outcome: 'unsafe', feedback: 'Never open covers while rotating.' }], explanation: null }],
      did_well: ['Collected every piece of evidence on the approved path.'],
      mistakes: [{ what: '“Open covers while rotating” at “Initial assessment”', why: 'Never open covers while rotating.', approved: 'Expert-approved: “Proceed”' }],
      resources: [], achievements: [{ code: 'first_responder', title: 'First Responder', description: 'Complete your first mission.' }],
    } }));
    renderAt('/app/troubleshooting/interactive/attempts/a1');
    expect(await screen.findByRole('img', { name: 'Overall score 73 out of 100' })).toBeInTheDocument();
    expect(screen.getByText('+246 XP')).toBeInTheDocument();
    expect(screen.getByText('First Responder')).toBeInTheDocument();
    expect(screen.getByText('Where your decisions differed')).toBeInTheDocument();
    expect(screen.getAllByText(/Never open covers while rotating/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Replay mission/ })).toBeInTheDocument();
  });
});
