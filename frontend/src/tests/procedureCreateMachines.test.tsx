import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProcedureCreatePage } from '../features/knowledge/ProcedureCreatePage';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
const machineQueryMock = vi.hoisted(() => ({ useMachines: vi.fn() }));
const uploadMock = vi.hoisted(() => ({ uploadWithProgress: vi.fn() }));
let savedDrafts: Array<Record<string, unknown>> = [];

vi.mock('../lib/api/client', () => ({ api: apiMock, getApiUrl: (url: string) => url }));
vi.mock('../features/knowledge-capture/hooks', () => ({ useMachines: machineQueryMock.useMachines }));
vi.mock('../features/knowledge-capture/media/uploadWithProgress', () => ({ uploadWithProgress: uploadMock.uploadWithProgress }));

const machines = [
  { id: 'mri-real-id', name: 'MRI', code: 'MRI-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'cityscan-real-id', name: 'CT-Scan', code: 'CITYSCAN-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'xray-real-id', name: 'Xray', code: 'XRAY-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'ecg-real-id', name: 'ECG', code: 'ECG-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'cnc-real-id', name: 'CNC Mill', code: 'CNC-001', category: 'industrial', is_demo: false, created_at: '', updated_at: '' },
  { id: 'inactive-id', name: 'Inactive CT', code: 'CT-OFF-001', status: 'MAINTENANCE', is_demo: false, created_at: '', updated_at: '' },
];

const imageAsset = {
  id: 'mri-guide-asset', machine_id: 'cityscan-real-id', title: 'Guide image', description: '', tags: '',
  kind: 'image', original_name: 'guide.png', mime: 'image/png', size_bytes: 32, uploaded_by: 'expert',
  created_at: '', url: '/api/v1/media/mri-guide-asset',
};

function renderProcedureCreatePage() {
  return render(<MemoryRouter><ProcedureCreatePage /></MemoryRouter>);
}

async function fillBasicProcedure(user: ReturnType<typeof userEvent.setup>, machineId = 'cityscan-real-id') {
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Machine' }), machineId);
  await user.type(screen.getByLabelText('Procedure title'), 'CT-Scan inspection');
  await user.type(screen.getByLabelText('Summary'), 'Inspect the registered equipment.');
}

describe('Create Procedure step builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedDrafts = [];
    machineQueryMock.useMachines.mockReturnValue({ data: { items: machines }, isLoading: false, isError: false });
    apiMock.get.mockImplementation((path: string) => {
      if (path === '/procedures/mine/drafts') return Promise.resolve(savedDrafts);
      if (path === '/media/config') return Promise.resolve({
        max_upload_bytes: 104857600,
        allowed_mime_types: { image: ['image/jpeg', 'image/png', 'image/webp'], video: ['video/mp4', 'video/webm', 'video/quicktime'], audio: ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/flac'] },
        max_media_per_version: 20,
      });
      if (path.startsWith('/machine-knowledge/')) return Promise.resolve([imageAsset]);
      return Promise.resolve([]);
    });
    apiMock.post.mockImplementation((_path: string, payload: { id?: string; title: string; description: string; machine_id: string; steps: Array<{ title: string; instruction: string }> }) => {
      const machine = machines.find(item => item.id === payload.machine_id);
      const created = {
        ...payload,
        id: 'new-procedure',
        machine_id: payload.machine_id,
        machine_name: machine?.name || null,
        status: 'DRAFT',
        steps: payload.steps.map((step, index) => ({ ...step, id: `saved-step-${index + 1}` })),
      };
      savedDrafts = [created];
      return Promise.resolve(created);
    });
    uploadMock.uploadWithProgress.mockResolvedValue({ ...imageAsset, id: 'uploaded-step-image', title: 'panel.png', original_name: 'panel.png' });
  });

  it('offers registered machines and requires review before saving one valid step', async () => {
    const user = userEvent.setup();
    renderProcedureCreatePage();

    const machineSelect = await screen.findByRole('combobox', { name: 'Machine' });
    expect(within(machineSelect).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Select a registered machine…', 'CNC Mill · CNC-001', 'CT-Scan · CITYSCAN-001',
      'ECG · ECG-001', 'MRI · MRI-001', 'Xray · XRAY-001',
    ]);
    expect(machineSelect.querySelector('option[value="inactive-id"]')).toBeNull();

    await fillBasicProcedure(user);
    await user.click(screen.getByRole('button', { name: 'Add First Step' }));
    await user.type(screen.getByLabelText('Step title'), 'Confirm display');
    await user.type(screen.getByLabelText('Instructions'), 'Confirm the displayed status against the approved checklist.');
    await user.click(screen.getByRole('button', { name: /Finish Procedure/ }));

    expect(await screen.findByRole('heading', { name: 'Review Procedure' })).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save Procedure' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/procedures', expect.objectContaining({
      machine_id: 'cityscan-real-id',
      title: 'CT-Scan inspection',
      steps: [expect.objectContaining({ title: 'Confirm display', instruction: 'Confirm the displayed status against the approved checklist.', asset_ids: [] })],
      asset_ids: [],
    })));
    expect(screen.getByRole('heading', { name: 'Review Procedure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Another Procedure' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create Another Procedure' }));
    expect(screen.getByRole('button', { name: 'Add First Step' })).toBeInTheDocument();
  });

  it('attaches an existing machine asset to its step and persists notes and ordering', async () => {
    const user = userEvent.setup();
    renderProcedureCreatePage();
    await fillBasicProcedure(user);
    await user.click(screen.getByRole('button', { name: 'Add First Step' }));
    await user.type(screen.getByLabelText('Step title'), 'Review image');
    await user.type(screen.getByLabelText('Instructions'), 'Compare the panel with the verified image.');
    const assetCheckbox = (await screen.findAllByRole('checkbox', { name: /Guide image/ }))[0];
    await user.click(assetCheckbox);
    await user.click(screen.getByRole('button', { name: 'Add Notes' }));
    await user.type(screen.getByLabelText('Step notes'), 'Use this image for orientation only.');
    await user.click(screen.getByRole('button', { name: /Finish Procedure/ }));

    expect(await screen.findByText('Use this image for orientation only.')).toBeInTheDocument();
    expect(screen.getByText('Guide image')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Procedure' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/procedures', expect.objectContaining({
      steps: [expect.objectContaining({
        title: 'Review image',
        notes: 'Use this image for orientation only.',
        asset_ids: ['mri-guide-asset'],
      })],
    })));
  });

  it('uploads a supported new image to the selected machine and links that asset to the step', async () => {
    const user = userEvent.setup();
    renderProcedureCreatePage();
    await fillBasicProcedure(user);
    await user.click(screen.getByRole('button', { name: 'Add First Step' }));
    await user.type(screen.getByLabelText('Step title'), 'Inspect panel');
    await user.type(screen.getByLabelText('Instructions'), 'Inspect the panel image against the approved specification.');

    const newImage = new File(['image bytes'], 'panel.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Add Image/Photo to Step 1'), newImage);
    await waitFor(() => expect(uploadMock.uploadWithProgress).toHaveBeenCalledWith('', newImage, expect.objectContaining({
      endpoint: '/machine-knowledge/cityscan-real-id/media',
      kind: 'image',
      title: 'panel.png',
    })));
    expect(screen.getByLabelText('Step title')).toHaveValue('Inspect panel');
    expect(screen.queryByRole('button', { name: 'Add First Step' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Finish Procedure/ }));
    expect(await screen.findByText('panel.png')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add First Step' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Procedure' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/procedures', expect.objectContaining({
      steps: [expect.objectContaining({ asset_ids: ['uploaded-step-image'] })],
    })));
    expect(screen.getByRole('heading', { name: 'Review Procedure' })).toBeInTheDocument();
    expect(screen.getByText('panel.png')).toBeInTheDocument();
  });

  it.each([
    { kind: 'video', name: 'inspection.mp4', mime: 'video/mp4', label: 'Add Video to Step 1' },
    { kind: 'audio', name: 'inspection.webm', mime: 'audio/webm', label: 'Add Audio to Step 1' },
  ])('keeps uploaded $kind media attached through review and draft save', async ({ kind, name, mime, label }) => {
    const user = userEvent.setup();
    uploadMock.uploadWithProgress.mockResolvedValueOnce({
      ...imageAsset,
      id: `uploaded-step-${kind}`,
      kind,
      title: name,
      original_name: name,
      mime,
    });
    renderProcedureCreatePage();
    await fillBasicProcedure(user);
    await user.click(screen.getByRole('button', { name: 'Add First Step' }));
    await user.type(screen.getByLabelText('Step title'), 'Review captured evidence');
    await user.type(screen.getByLabelText('Instructions'), 'Review the uploaded evidence using the approved checklist.');

    const file = new File([`${kind} bytes`], name, { type: mime });
    await user.upload(screen.getByLabelText(label), file);
    await waitFor(() => expect(uploadMock.uploadWithProgress).toHaveBeenCalledWith('', file, expect.objectContaining({
      endpoint: '/machine-knowledge/cityscan-real-id/media',
      kind,
      title: name,
    })));
    expect(screen.getByLabelText('Step title')).toHaveValue('Review captured evidence');
    expect(screen.queryByRole('button', { name: 'Add First Step' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Finish Procedure/ }));
    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review Procedure' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Procedure' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/procedures', expect.objectContaining({
      steps: [expect.objectContaining({ asset_ids: [`uploaded-step-${kind}`] })],
    })));
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review Procedure' })).toBeInTheDocument();
  });

  it('keeps the step intact after an upload failure and shows the actual upload error', async () => {
    const user = userEvent.setup();
    uploadMock.uploadWithProgress.mockRejectedValueOnce(new Error('Upload was rejected by the server.'));
    renderProcedureCreatePage();
    await fillBasicProcedure(user);
    await user.click(screen.getByRole('button', { name: 'Add First Step' }));
    await user.type(screen.getByLabelText('Step title'), 'Inspect panel');
    await user.type(screen.getByLabelText('Instructions'), 'Inspect the panel using approved instructions.');
    await user.upload(screen.getByLabelText('Add Image/Photo to Step 1'), new File(['image'], 'panel.png', { type: 'image/png' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload was rejected by the server.');
    expect(screen.getByLabelText('Step title')).toHaveValue('Inspect panel');
    expect(screen.getByLabelText('Instructions')).toHaveValue('Inspect the panel using approved instructions.');
  });

  it('explains missing required step fields without clearing the builder', async () => {
    const user = userEvent.setup();
    renderProcedureCreatePage();
    await fillBasicProcedure(user);
    await user.click(screen.getByRole('button', { name: 'Add First Step' }));
    await user.type(screen.getByLabelText('Step title'), 'Confirm display');
    await user.click(screen.getByRole('button', { name: /Finish Procedure/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Complete the title and instructions for Step 1.');
    expect(screen.getByLabelText('Step title')).toHaveValue('Confirm display');
    expect(screen.getByRole('heading', { name: 'Procedure Steps' })).toBeInTheDocument();
  });

  it('reorders and removes steps before review and requires each step title and instruction', async () => {
    const user = userEvent.setup();
    renderProcedureCreatePage();
    await fillBasicProcedure(user);
    await user.click(screen.getByRole('button', { name: 'Add First Step' }));
    await user.type(screen.getAllByLabelText('Step title')[0], 'First drafted');
    await user.type(screen.getAllByLabelText('Instructions')[0], 'First instruction.');
    await user.click(screen.getByRole('button', { name: 'Add Next Step' }));
    await user.type(screen.getAllByLabelText('Step title')[1], 'Second drafted');
    await user.type(screen.getAllByLabelText('Instructions')[1], 'Second instruction.');
    await user.click(screen.getByRole('button', { name: 'Move Step 2 up' }));
    await user.click(screen.getByRole('button', { name: /Finish Procedure/ }));

    const review = await screen.findByRole('list');
    const reviewedSteps = within(review).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent);
    expect(reviewedSteps).toEqual(['Second drafted', 'First drafted']);
    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    await user.click(screen.getByRole('button', { name: 'Remove Step 1' }));
    expect(await screen.findByRole('alertdialog', { name: 'Remove this procedure step?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove step' }));
    expect(screen.getByLabelText('Step title')).toHaveValue('First drafted');
  });

  it('shows an actionable empty state and prevents creating an unassociated procedure', async () => {
    machineQueryMock.useMachines.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false });
    renderProcedureCreatePage();

    expect(await screen.findByText(/No active equipment is registered/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register equipment' })).toHaveAttribute('href', '/app/machines');
    expect(screen.queryByRole('button', { name: /Finish Procedure/ })).not.toBeInTheDocument();
  });
});
