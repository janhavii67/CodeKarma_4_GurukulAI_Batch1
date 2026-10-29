import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GuidedWorkflowsPage } from '../features/workflows/GuidedWorkflowsPage';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const machineQueryMock = vi.hoisted(() => ({ useMachines: vi.fn() }));
vi.mock('../lib/api/client', () => ({
  api: apiMock,
  getApiUrl: (path: string) => `http://api.test/api/v1${path}`,
}));
vi.mock('../features/knowledge-capture/hooks', () => ({ useMachines: machineQueryMock.useMachines }));

const machines = [
  { id: 'mri', name: 'MRI', code: 'MRI-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'ct', name: 'CT-Scan', code: 'CITYSCAN-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'xray', name: 'Xray', code: 'XRAY-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'ecg', name: 'ECG', code: 'ECG-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'cnc', name: 'CNC Machine', code: 'CNC-001', category: 'industrial', is_demo: false, created_at: '', updated_at: '' },
  { id: 'ultrasound', name: 'Ultrasound', code: 'US-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'inactive', name: 'Inactive unit', code: 'OFF-001', status: 'MAINTENANCE', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
];

const procedure = {
  id: 'procedure-mri', title: 'MRI Safety Check', description: 'Approved scanner setup.', machine_id: 'mri', machine_name: 'MRI',
  status: 'APPROVED', version: 3, prerequisites: 'Confirm operator authorization.', required_tools: 'Approved checklist.',
  safety_warnings: 'Screen for ferromagnetic objects.', updated_at: '2026-10-28T10:00:00Z',
  steps: [
    { id: 'step-1', step_order: 1, title: 'Clear the room', instruction: 'Inspect the scan room.', expected_observation: 'No unauthorized metal objects are present.', safety_warning: 'Stop if an unknown object is present.', is_critical: true },
    { id: 'step-2', step_order: 2, title: 'Confirm scanner status', instruction: 'Review the approved status display.', expected_observation: null, safety_warning: null, is_critical: false },
  ],
};

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1', procedure_id: 'procedure-mri', status: 'IN_PROGRESS', started_at: '2026-10-28T10:00:00Z', completed_at: null,
    step_executions: [
      { id: 'exec-1', step_id: 'step-1', is_completed: false, operator_notes: null, verified_at: null },
      { id: 'exec-2', step_id: 'step-2', is_completed: false, operator_notes: null, verified_at: null },
    ],
    ...overrides,
  };
}

function setupApi(initialRun = run()) {
  apiMock.get.mockImplementation((path: string) => {
    if (path.startsWith('/procedures?machine_id=')) return Promise.resolve([procedure]);
    if (path === '/procedures/runs/my/all') return Promise.resolve([]);
    if (path === '/procedures/procedure-mri/assets') return Promise.resolve([]);
    return Promise.reject(new Error(`Unexpected GET ${path}`));
  });
  apiMock.post.mockImplementation((path: string) => {
    if (path === '/procedures/procedure-mri/start') return Promise.resolve(initialRun);
    return Promise.reject(new Error(`Unexpected POST ${path}`));
  });
  apiMock.patch.mockImplementation((path: string, body: unknown) => {
    const payload = body as { step_order: number };
    return Promise.resolve(run({ current_step_order: payload.step_order }));
  });
}

async function chooseMri(user = userEvent.setup()) {
  render(<MemoryRouter><GuidedWorkflowsPage /></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: /MRI MRI-001/ }));
  return user;
}

describe('Guided Workflow', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.patch.mockReset();
    machineQueryMock.useMachines.mockReset().mockReturnValue({ data: { items: machines }, isLoading: false, isError: false });
  });

  it('offers all active registered machines and links to procedure creation when none are approved', async () => {
    apiMock.get.mockResolvedValue([]);
    render(<MemoryRouter><GuidedWorkflowsPage /></MemoryRouter>);
    for (const label of ['MRI', 'CT-Scan', 'Xray', 'ECG', 'CNC Machine', 'Ultrasound']) {
      expect(await screen.findByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: /Open workflow/ })).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Inactive unit/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /MRI MRI-001/ }));
    expect(await screen.findByText('No approved procedure is available for MRI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Go to Create Procedure/ })).toHaveAttribute('href', '/app/procedures/new');
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('shows CT-Scan while selecting the real registered CT machine ID for procedure loading', async () => {
    apiMock.get.mockImplementation((path: string) => {
      if (path === '/procedures?machine_id=ct') return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    render(<MemoryRouter><GuidedWorkflowsPage /></MemoryRouter>);

    await userEvent.click(await screen.findByRole('button', { name: /CT-Scan CITYSCAN-001/ }));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/procedures?machine_id=ct'));
    expect(await screen.findByText('No approved procedure is available for CT-Scan')).toBeInTheDocument();
  });

  it('loads the selected machine procedure and enforces step confirmations before advancing', async () => {
    setupApi();
    const user = await chooseMri();
    expect(await screen.findByText(/MRI Safety Check/)).toBeInTheDocument();
    expect(screen.getByText('STEP 1 OF 2')).toBeInTheDocument();
    expect(screen.getByText('Screen for ferromagnetic objects.')).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledWith('/procedures/procedure-mri/start', {});

    const markComplete = screen.getByRole('button', { name: 'Mark Complete' });
    expect(markComplete).toBeDisabled();
    await user.click(screen.getByLabelText(/I performed this checkpoint/));
    expect(markComplete).toBeDisabled();
    await user.click(screen.getByLabelText(/I checked the expected observation/));
    await user.click(screen.getByLabelText(/I reviewed the procedure-level safety alert/));
    expect(markComplete).toBeEnabled();

    apiMock.post.mockImplementation((path: string) => {
      if (path === '/procedures/runs/run-1/step/step-1') return Promise.resolve(run({ step_executions: [
        { id: 'exec-1', step_id: 'step-1', is_completed: true, verified_at: '2026-10-28T10:05:00Z' },
        { id: 'exec-2', step_id: 'step-2', is_completed: false },
      ] }));
      return Promise.reject(new Error(`Unexpected POST ${path}`));
    });
    await user.click(markComplete);
    expect(await screen.findByText('Checkpoint recorded complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next Step' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Next Step' }));
    expect(await screen.findByText('STEP 2 OF 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confirm scanner status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous Step' })).toBeEnabled();
  });

  it('resumes an in-progress run instead of creating a duplicate', async () => {
    const inProgress = run();
    setupApi(inProgress);
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith('/procedures?machine_id=')) return Promise.resolve([procedure]);
      if (path === '/procedures/runs/my/all') return Promise.resolve([inProgress]);
      if (path === '/procedures/procedure-mri/assets') return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    await chooseMri();
    expect(await screen.findByText(/MRI Safety Check/)).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('does not complete the workflow until the server confirms every checkpoint', async () => {
    const initial = run({ step_executions: [
      { id: 'exec-1', step_id: 'step-1', is_completed: true, verified_at: '2026-10-28T10:05:00Z' },
      { id: 'exec-2', step_id: 'step-2', is_completed: false },
    ] });
    setupApi(initial);
    const user = await chooseMri();
    await screen.findByText(/MRI Safety Check/);
    await user.click(screen.getByLabelText(/I performed this checkpoint/));
    await user.click(screen.getByLabelText(/I reviewed the procedure-level safety alert/));
    apiMock.post.mockResolvedValueOnce(run({
      status: 'IN_PROGRESS',
      step_executions: [
        { id: 'exec-1', step_id: 'step-1', is_completed: true, verified_at: '2026-10-28T10:05:00Z' },
        { id: 'exec-2', step_id: 'step-2', is_completed: true, verified_at: '2026-10-28T10:06:00Z' },
      ],
    }));
    await user.click(screen.getByRole('button', { name: 'Mark Complete' }));
    await screen.findByText(/server has not confirmed procedure completion/);
    expect(screen.getByRole('button', { name: 'Review & Complete' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Procedure complete' })).not.toBeInTheDocument();
  });

  it('shows the review stage only after an accurate server-confirmed completion', async () => {
    const initial = run({ step_executions: [
      { id: 'exec-1', step_id: 'step-1', is_completed: true, verified_at: '2026-10-28T10:05:00Z' },
      { id: 'exec-2', step_id: 'step-2', is_completed: false },
    ] });
    setupApi(initial);
    const user = await chooseMri();
    await screen.findByText(/MRI Safety Check/);
    await user.click(screen.getByLabelText(/I performed this checkpoint/));
    await user.click(screen.getByLabelText(/I reviewed the procedure-level safety alert/));
    apiMock.post.mockResolvedValueOnce(run({
      status: 'COMPLETED', completed_at: '2026-10-28T10:06:00Z',
      step_executions: [
        { id: 'exec-1', step_id: 'step-1', is_completed: true, verified_at: '2026-10-28T10:05:00Z' },
        { id: 'exec-2', step_id: 'step-2', is_completed: true, verified_at: '2026-10-28T10:06:00Z' },
      ],
    }));
    await user.click(screen.getByRole('button', { name: 'Mark Complete' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review & Complete' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Review & Complete' }));
    expect(await screen.findByRole('heading', { name: 'Procedure complete' })).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish workflow' })).toBeEnabled();
  });

  it('ignores a procedure returned for a different machine', async () => {
    const mismatched = { ...procedure, machine_id: 'another-machine' };
    apiMock.get.mockResolvedValue([mismatched]);
    render(<MemoryRouter><GuidedWorkflowsPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /MRI MRI-001/ }));
    expect(await screen.findByText('No approved procedure is available for MRI')).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('renders only same-machine verified references returned by the procedure API', async () => {
    setupApi();
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith('/procedures?machine_id=')) return Promise.resolve([procedure]);
      if (path === '/procedures/runs/my/all') return Promise.resolve([]);
      if (path === '/procedures/procedure-mri/assets') return Promise.resolve([
        { id: 'verified-asset', title: 'Verified setup photo', kind: 'image', machine_id: 'mri', verification_status: 'published', url: '/media/verified-asset' },
        { id: 'wrong-machine', title: 'Other machine image', kind: 'image', machine_id: 'ct', verification_status: 'published' },
        { id: 'pending-asset', title: 'Pending reference', kind: 'image', machine_id: 'mri', verification_status: 'pending_review' },
      ]);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    await chooseMri();
    expect(await screen.findByText('Verified setup photo')).toBeInTheDocument();
    expect(screen.getByText('Verified reference')).toBeInTheDocument();
    expect(screen.queryByText('Other machine image')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending reference')).not.toBeInTheDocument();
  });

  it('shows API errors instead of claiming a procedure was loaded', async () => {
    apiMock.get.mockRejectedValue(new Error('Permission denied'));
    render(<MemoryRouter><GuidedWorkflowsPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /MRI MRI-001/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.queryByText('No approved procedure is available for MRI')).not.toBeInTheDocument();
  });
});
