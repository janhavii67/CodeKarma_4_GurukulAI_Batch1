import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GuidedWorkflowsPage } from '../features/workflows/GuidedWorkflowsPage';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const machineApiMock = vi.hoisted(() => ({ fetchMachines: vi.fn() }));
const permissionMock = vi.hoisted(() => ({ hasPermission: vi.fn(() => true) }));
vi.mock('../lib/api/client', () => ({
  api: apiMock,
  getApiUrl: (path: string) => `http://api.test/api/v1${path}`,
}));
vi.mock('../features/knowledge-capture/knowledgeApi', () => machineApiMock);
const authUserMock = vi.hoisted(() => ({ user: null as null | { id: string; role_id: string } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: permissionMock.hasPermission, user: authUserMock.user }) }));

const machines = [
  { id: 'mri', name: 'MRI', code: 'MRI-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'ct', name: 'CT-Scan', code: 'CITYSCAN-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'xray', name: 'Xray', code: 'XRAY-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'ecg', name: 'ECG', code: 'ECG-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'cnc', name: 'CNC Machine', code: 'CNC-001', category: 'industrial', is_demo: false, created_at: '', updated_at: '' },
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
    authUserMock.user = null;
    permissionMock.hasPermission.mockReset().mockReturnValue(true);
    machineApiMock.fetchMachines.mockReset().mockResolvedValue({ items: machines, total: machines.length, page: 1, page_size: 100 });
  });

  it('offers only the four supported machine choices and links to procedure creation when none are approved', async () => {
    apiMock.get.mockResolvedValue([]);
    render(<MemoryRouter><GuidedWorkflowsPage /></MemoryRouter>);
    for (const label of ['MRI', 'CT-Scan', 'Xray', 'ECG']) {
      expect(await screen.findByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /CNC Machine/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /MRI MRI-001/ }));
    expect(await screen.findByText('No approved procedure is available for MRI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create a procedure/ })).toHaveAttribute('href', '/app/procedures/new');
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('shows real saved progress and keeps future steps locked on the learning path', async () => {
    setupApi();
    await chooseMri();
    await screen.findByRole('heading', { name: 'MRI Safety Check' });
    const progress = screen.getByRole('progressbar', { name: 'Procedure progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '2');
    const currentStep = screen.getByRole('button', { name: /Step 1: Clear the room, Current/ });
    expect(currentStep).toHaveAttribute('aria-current', 'step');
    expect(currentStep.querySelector('[data-step-label]')).toHaveTextContent('Clear the room');
    expect(currentStep.querySelector('[data-step-label]')).toHaveClass('font-extrabold');
    expect(currentStep.querySelector('[data-step-label]')).not.toHaveTextContent('Inspect the scan room.');
    expect(screen.getByRole('button', { name: /Step 2: Confirm scanner status, Locked/ })).toBeDisabled();
  });

  it('does not show procedure authoring navigation without create permission', async () => {
    permissionMock.hasPermission.mockReturnValue(false);
    apiMock.get.mockResolvedValue([]);
    render(<MemoryRouter><GuidedWorkflowsPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /MRI MRI-001/ }));
    expect(await screen.findByText('No approved procedure is available for MRI')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Create a procedure/ })).not.toBeInTheDocument();
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
    expect(await screen.findByText('Checkpoint saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to next step' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Continue to next step' }));
    expect(await screen.findByText('STEP 2 OF 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confirm scanner status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
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
    expect(screen.getByRole('button', { name: 'Review completed path' })).toBeDisabled();
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review completed path' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Review completed path' }));
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
        { id: 'verified-video', title: 'Procedure walkthrough', kind: 'video', mime: 'video/mp4', machine_id: 'mri', verification_status: 'approved', url: '/media/walkthrough' },
        { id: 'verified-audio', title: 'Audio explanation', kind: 'audio', mime: 'audio/wav', machine_id: 'mri', verification_status: 'verified', url: '/media/explanation' },
        { id: 'verified-document', title: 'Approved manual', kind: 'document', mime: 'application/pdf', machine_id: 'mri', verification_status: 'published', url: '/media/manual' },
        { id: 'wrong-machine', title: 'Other machine image', kind: 'image', machine_id: 'ct', verification_status: 'published' },
        { id: 'pending-asset', title: 'Pending reference', kind: 'image', machine_id: 'mri', verification_status: 'pending_review' },
      ]);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    await chooseMri();
    expect(await screen.findByText('Verified setup photo')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Verified setup photo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Procedure walkthrough preview')).toBeInTheDocument();
    expect(screen.getByLabelText('Audio explanation preview')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open or download Approved manual' })).toHaveAttribute('href', 'http://api.test/api/v1/media/manual');
    expect(screen.getAllByText('Verified for this machine')).toHaveLength(4);
    fireEvent.error(screen.getByRole('img', { name: 'Verified setup photo' }));
    expect(await screen.findByText('The embedded preview could not be loaded. Open the approved file to view it.')).toBeInTheDocument();
    expect(screen.queryByText('Other machine image')).not.toBeInTheDocument();
    // Unverified attachments are labeled, not hidden; another machine's file is still excluded.
    expect(screen.getByRole('button', { name: 'Show image 2: Pending reference' })).toBeInTheDocument();
  });

  it('syncs the server current step before recording a later checkpoint', async () => {
    const stepOneDone = [
      { id: 'exec-1', step_id: 'step-1', is_completed: true, verified_at: '2026-10-28T10:05:00Z' },
      { id: 'exec-2', step_id: 'step-2', is_completed: false },
    ];
    setupApi(run({ current_step_order: 1, step_executions: stepOneDone }));
    const user = await chooseMri();
    expect(await screen.findByText('STEP 2 OF 2')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/I performed this checkpoint/));
    await user.click(screen.getByLabelText(/I reviewed the procedure-level safety alert/));

    apiMock.patch.mockResolvedValue(run({ current_step_order: 2, step_executions: stepOneDone }));
    apiMock.post.mockResolvedValue(run({ current_step_order: 2, step_executions: [
      stepOneDone[0], { id: 'exec-2', step_id: 'step-2', is_completed: true, verified_at: '2026-10-28T10:06:00Z' },
    ], status: 'COMPLETED', completed_at: '2026-10-28T10:06:00Z' }));
    await user.click(screen.getByRole('button', { name: 'Mark Complete' }));

    expect(await screen.findByText('Checkpoint saved')).toBeInTheDocument();
    expect(apiMock.patch).toHaveBeenCalledWith('/procedures/runs/run-1/current-step', { step_order: 2 });
    expect(apiMock.post).toHaveBeenLastCalledWith('/procedures/runs/run-1/step/step-2', { is_completed: true, operator_notes: undefined });
    expect(apiMock.patch.mock.invocationCallOrder[0]).toBeLessThan(apiMock.post.mock.invocationCallOrder.at(-1)!);
    expect(screen.getByRole('progressbar', { name: 'Procedure progress' })).toHaveAttribute('aria-valuenow', '2');
  });

  it('does not sync the step when the server already points at it', async () => {
    setupApi(run({ current_step_order: 1 }));
    const user = await chooseMri();
    await screen.findByText('STEP 1 OF 2');
    await user.click(screen.getByLabelText(/I performed this checkpoint/));
    await user.click(screen.getByLabelText(/I checked the expected observation/));
    await user.click(screen.getByLabelText(/I reviewed the procedure-level safety alert/));
    apiMock.post.mockResolvedValue(run({ current_step_order: 1, step_executions: [
      { id: 'exec-1', step_id: 'step-1', is_completed: true, verified_at: '2026-10-28T10:05:00Z' },
      { id: 'exec-2', step_id: 'step-2', is_completed: false },
    ] }));
    await user.click(screen.getByRole('button', { name: 'Mark Complete' }));
    expect(await screen.findByText('Checkpoint saved')).toBeInTheDocument();
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it('renders each content type attached to a step and requires its checklist before saving', async () => {
    const richProcedure = { ...procedure, steps: [
      { ...procedure.steps[0], details: {
        asset_ids: ['step-photo', 'step-audio', 'pending-step-doc'],
        notes: 'Keep the door log within reach.',
        narration_text: 'Confirm the MRI room is clear before starting.',
        source_refs: [{ title: 'ACR Manual on MR Safety', publisher: 'ACR', url: 'https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/radiology-safety/mr-safety' }],
        quality_checkpoints: ['Door log reviewed', 'Room is clear'],
        tools: ['Metal detector wand'],
        stop_condition: 'Stop if the door interlock is open.',
      } },
      procedure.steps[1],
    ] };
    setupApi();
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith('/procedures?machine_id=')) return Promise.resolve([richProcedure]);
      if (path === '/procedures/runs/my/all') return Promise.resolve([]);
      if (path === '/procedures/procedure-mri/assets') return Promise.resolve([
        { id: 'step-photo', title: 'Room layout photo', kind: 'image', machine_id: 'mri', verification_status: 'published', url: '/media/step-photo' },
        { id: 'step-audio', title: 'Interlock tone', kind: 'audio', mime: 'audio/wav', machine_id: 'mri', verification_status: 'published', url: '/media/step-audio' },
        { id: 'pending-step-doc', title: 'Unreviewed checklist scan', kind: 'document', machine_id: 'mri', verification_status: 'pending_review' },
        { id: 'shared-manual', title: 'Scanner manual', kind: 'document', mime: 'application/pdf', machine_id: 'mri', verification_status: 'published', url: '/media/shared-manual' },
      ]);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    const user = await chooseMri();

    expect(await screen.findByRole('heading', { name: 'Learning materials for this step' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Room layout photo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Interlock tone preview')).toBeInTheDocument();
    expect(screen.getByText('Unreviewed checklist scan')).toBeInTheDocument();
    expect(screen.getByText(/Not yet verified · attached by the workflow author/)).toBeInTheDocument();
    expect(screen.getByText('Stop if the door interlock is open.')).toBeInTheDocument();
    expect(screen.getByText('Metal detector wand')).toBeInTheDocument();
    expect(screen.getByText('Keep the door log within reach.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Verified guidance sources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ACR Manual on MR Safety/ })).toHaveAttribute('href', 'https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/radiology-safety/mr-safety');
    expect(screen.getByRole('heading', { name: 'Shared procedure materials' })).toBeInTheDocument();
    expect(screen.getByLabelText('Scanner manual preview')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open or download Scanner manual' })).toHaveAttribute('href', 'http://api.test/api/v1/media/shared-manual');
    expect(screen.getByRole('button', { name: /Step 1: Clear the room, .*includes safety notes, images, audio, documents, checklist/ })).toBeInTheDocument();

    await user.click(screen.getByLabelText(/I performed this checkpoint/));
    await user.click(screen.getByLabelText(/I checked the expected observation/));
    await user.click(screen.getByLabelText(/I reviewed the procedure-level safety alert/));
    const markComplete = screen.getByRole('button', { name: 'Mark Complete' });
    expect(markComplete).toBeDisabled();
    expect(screen.getByText(/Tick every item in this step’s checklist/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Door log reviewed'));
    expect(markComplete).toBeDisabled();
    await user.click(screen.getByLabelText('Room is clear'));
    expect(markComplete).toBeEnabled();
  });

  it('revisits a completed step without changing progress and continues to the next eligible step', async () => {
    setupApi(run({ step_executions: [
      { id: 'exec-1', step_id: 'step-1', is_completed: true, verified_at: '2026-10-28T10:05:00Z' },
      { id: 'exec-2', step_id: 'step-2', is_completed: false },
    ] }));
    const user = await chooseMri();
    expect(await screen.findByRole('heading', { name: 'Confirm scanner status' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Step 1: Clear the room, Completed/ }));
    expect(await screen.findByRole('heading', { name: 'Clear the room' })).toBeInTheDocument();
    expect(screen.getByText('Checkpoint saved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Complete' })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Procedure progress' })).toHaveAttribute('aria-valuenow', '1');

    await user.click(screen.getByRole('button', { name: /Continue · Step 2/ }));
    expect(await screen.findByRole('heading', { name: 'Confirm scanner status' })).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it('presents step images as a gallery with a full-screen viewer and audio with player controls', async () => {
    const mediaProcedure = { ...procedure, steps: [{ ...procedure.steps[0], details: { asset_ids: ['photo-a', 'photo-b', 'tone', 'walkthrough'] } }, procedure.steps[1]] };
    setupApi();
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith('/procedures?machine_id=')) return Promise.resolve([mediaProcedure]);
      if (path === '/procedures/runs/my/all') return Promise.resolve([]);
      if (path === '/procedures/procedure-mri/assets') return Promise.resolve([
        { id: 'photo-a', title: 'Console overview', kind: 'image', machine_id: 'mri', verification_status: 'published', url: '/media/photo-a' },
        { id: 'photo-b', title: 'Coil connector close-up', kind: 'image', machine_id: 'mri', verification_status: 'published', url: '/media/photo-b' },
        { id: 'tone', title: 'Ready tone', kind: 'audio', mime: 'audio/wav', machine_id: 'mri', verification_status: 'published', url: '/media/tone' },
        { id: 'walkthrough', title: 'Room walkthrough', kind: 'video', mime: 'video/mp4', machine_id: 'mri', verification_status: 'published', url: '/media/walkthrough' },
      ]);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    const user = await chooseMri();

    expect(await screen.findByRole('img', { name: 'Console overview' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show image 2: Coil connector close-up' }));
    expect(await screen.findByRole('img', { name: 'Coil connector close-up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show image 2: Coil connector close-up' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'View Coil connector close-up full screen' }));
    const viewer = await screen.findByRole('dialog', { name: 'Coil connector close-up full-screen view' });
    expect(viewer).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next image' }));
    expect(await screen.findByRole('dialog', { name: 'Console overview full-screen view' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(screen.getByLabelText('Ready tone preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Ready tone' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Seek Ready tone' })).toBeDisabled();
    expect(screen.getByLabelText('Room walkthrough preview')).toHaveAttribute('controls');
  });

  it('shows no step media when the reference endpoint denies access', async () => {
    const withAttachment = { ...procedure, steps: [{ ...procedure.steps[0], details: { asset_ids: ['restricted-photo'] } }, procedure.steps[1]] };
    setupApi();
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith('/procedures?machine_id=')) return Promise.resolve([withAttachment]);
      if (path === '/procedures/runs/my/all') return Promise.resolve([]);
      if (path === '/procedures/procedure-mri/assets') return Promise.reject(new Error('Forbidden'));
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    const user = await chooseMri();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This step has 1 attachment, but they could not be loaded.');
    expect(alert).toHaveTextContent('Forbidden');
    expect(screen.getByRole('heading', { name: 'Learning materials for this step' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    apiMock.get.mockImplementation((path: string) => path === '/procedures/procedure-mri/assets'
      ? Promise.resolve([{ id: 'restricted-photo', title: 'Untitled Media', filename: 'door-check.png', kind: 'image', machine_id: 'mri', verification_status: 'pending_review', url: '/media/restricted-photo' }])
      : Promise.reject(new Error(`Unexpected GET ${path}`)));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('img', { name: 'door-check.png' })).toBeInTheDocument();
    expect(screen.getByText(/Not yet verified · attached by the workflow author/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets the trainee choose between several workflows for one machine and resumes the right one', async () => {
    const second = { ...procedure, id: 'procedure-mri-2', title: 'MRI Coil Change', operation: 'Maintenance', updated_at: '2026-10-27T10:00:00Z',
      steps: [{ id: 'coil-1', step_order: 1, title: 'Remove coil', instruction: 'Detach the head coil.', expected_observation: null, safety_warning: null, is_critical: false }] };
    const first = { ...procedure, operation: 'Safety' };
    const coilRun = { ...run({ id: 'run-2', procedure_id: 'procedure-mri-2', step_executions: [{ id: 'exec-c1', step_id: 'coil-1', is_completed: false }] }) };
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith('/procedures?machine_id=')) return Promise.resolve([first, second]);
      if (path === '/procedures/runs/my/all') return Promise.resolve([coilRun]);
      if (path.startsWith('/procedures/mine/all')) return Promise.resolve([{ ...procedure, id: 'archived-1', title: 'Old MRI checklist', status: 'ARCHIVED' }]);
      if (path === '/procedures/procedure-mri-2/assets') return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    const user = await chooseMri();

    expect(await screen.findByRole('heading', { name: 'Choose a workflow' })).toBeInTheDocument();
    expect(screen.getByText('2 published workflows for this machine. Your progress is saved per workflow.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start workflow: MRI Safety Check' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume · 0/1: MRI Coil Change' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Your archived workflows \(1\)/ })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search workflows' }), 'coil');
    expect(screen.queryByRole('button', { name: 'Start workflow: MRI Safety Check' })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search workflows' }));
    await user.click(screen.getByRole('button', { name: 'Maintenance' }));
    expect(screen.queryByRole('button', { name: 'Start workflow: MRI Safety Check' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume · 0/1: MRI Coil Change' }));
    expect(await screen.findByRole('heading', { name: 'MRI Coil Change' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Remove coil' })).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /All steps \(1\)/ }));
    expect(screen.getByRole('list', { name: 'Step navigator' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All workflows' }));
    expect(await screen.findByRole('heading', { name: 'Choose a workflow' })).toBeInTheDocument();
  });

  it('shows management actions only on workflows the expert authored', async () => {
    authUserMock.user = { id: 'expert-a', role_id: 'EXPERT' };
    const own = { ...procedure, author_id: 'expert-a' };
    const other = { ...procedure, id: 'procedure-other', title: 'Peer workflow', author_id: 'expert-b' };
    apiMock.get.mockImplementation((path: string) => {
      if (path.startsWith('/procedures?machine_id=')) return Promise.resolve([own, other]);
      if (path === '/procedures/runs/my/all') return Promise.resolve([]);
      if (path.startsWith('/procedures/mine/all')) return Promise.resolve([own]);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    apiMock.post.mockResolvedValue({});
    const user = await chooseMri();
    expect(await screen.findByRole('button', { name: 'Duplicate MRI Safety Check' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicate Peer workflow' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit steps of MRI Safety Check' })).toHaveAttribute('href', '/app/procedures/new?from=procedure-mri');

    await user.click(screen.getByRole('button', { name: 'Archive MRI Safety Check' }));
    expect(apiMock.post).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm archive MRI Safety Check' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/procedures/procedure-mri/archive', {}));
    expect(await screen.findByText(/Archived “MRI Safety Check”/)).toBeInTheDocument();
  });

  it('opens the exact workflow run the AI Tutor linked with run_id', async () => {
    const linked = { ...run({ current_step_order: 1 }), workflow: procedure };
    apiMock.get.mockImplementation((path: string) => {
      if (path === '/procedures/runs/run-1') return Promise.resolve(linked);
      if (path.startsWith('/procedures?machine_id=')) return Promise.resolve([procedure]);
      if (path === '/procedures/runs/my/all') return Promise.resolve([linked]);
      if (path === '/procedures/procedure-mri/assets') return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
    render(<MemoryRouter initialEntries={['/app/guided-workflows?run_id=run-1']}><GuidedWorkflowsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'MRI Safety Check' })).toBeInTheDocument();
    expect(await screen.findByText('STEP 1 OF 2')).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('explains when a tutor-linked run is no longer available', async () => {
    apiMock.get.mockImplementation((path: string) => path === '/procedures/runs/missing'
      ? Promise.reject(new Error('Procedure run not found.'))
      : Promise.reject(new Error(`Unexpected GET ${path}`)));
    render(<MemoryRouter initialEntries={['/app/guided-workflows?run_id=missing']}><GuidedWorkflowsPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Procedure run not found.');
    expect(await screen.findByRole('heading', { name: 'Choose your machine' })).toBeInTheDocument();
  });

  it('shows API errors instead of claiming a procedure was loaded', async () => {
    apiMock.get.mockRejectedValue(new Error('Permission denied'));
    render(<MemoryRouter><GuidedWorkflowsPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /MRI MRI-001/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.queryByText('No approved procedure is available for MRI')).not.toBeInTheDocument();
  });
});
