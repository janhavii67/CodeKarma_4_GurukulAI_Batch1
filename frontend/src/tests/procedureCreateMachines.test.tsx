import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProcedureCreatePage } from '../features/knowledge/ProcedureCreatePage';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
const machineQueryMock = vi.hoisted(() => ({ useMachines: vi.fn() }));

vi.mock('../lib/api/client', () => ({ api: apiMock }));
vi.mock('../features/knowledge-capture/hooks', () => ({ useMachines: machineQueryMock.useMachines }));

const machines = [
  { id: 'mri-real-id', name: 'MRI', code: 'MRI-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'cityscan-real-id', name: 'CT-Scan', code: 'CITYSCAN-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'xray-real-id', name: 'Xray', code: 'XRAY-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'ecg-real-id', name: 'ECG', code: 'ECG-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'cnc-real-id', name: 'CNC Mill', code: 'CNC-001', category: 'industrial', is_demo: false, created_at: '', updated_at: '' },
  { id: 'inactive-id', name: 'Inactive CT', code: 'CT-OFF-001', status: 'MAINTENANCE', is_demo: false, created_at: '', updated_at: '' },
];

function renderProcedureCreatePage() {
  return render(<MemoryRouter><ProcedureCreatePage /></MemoryRouter>);
}

describe('Create Procedure machine selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    machineQueryMock.useMachines.mockReturnValue({ data: { items: machines }, isLoading: false, isError: false });
    apiMock.get.mockImplementation((path: string) => path === '/procedures/mine/drafts' ? Promise.resolve([]) : Promise.resolve([]));
    apiMock.post.mockResolvedValue({ id: 'new-procedure' });
  });

  it('offers every active registered machine and saves the real selected machine ID', async () => {
    const user = userEvent.setup();
    renderProcedureCreatePage();

    const machineSelect = await screen.findByRole('combobox', { name: 'Machine' });
    expect(within(machineSelect).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Select a registered machine…', 'CNC Mill · CNC-001', 'CT-Scan · CITYSCAN-001',
      'ECG · ECG-001', 'MRI · MRI-001', 'Xray · XRAY-001',
    ]);
    expect(machineSelect.querySelector('option[value="inactive-id"]')).toBeNull();

    await user.selectOptions(machineSelect, 'cityscan-real-id');
    await user.type(screen.getByPlaceholderText('Procedure title'), 'CT-Scan inspection');
    await user.type(screen.getByPlaceholderText('Summary'), 'Inspect the registered equipment.');
    await user.type(screen.getByLabelText(/Steps/), 'Review the approved inspection checklist.');
    await user.click(screen.getByRole('button', { name: 'Save procedure' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/procedures', expect.objectContaining({
      machine_id: 'cityscan-real-id',
      title: 'CT-Scan inspection',
    })));
  });

  it('does not invent options when only a subset of equipment is registered', async () => {
    machineQueryMock.useMachines.mockReturnValue({ data: { items: [machines[0]] }, isLoading: false, isError: false });
    renderProcedureCreatePage();

    const machineSelect = await screen.findByRole('combobox', { name: 'Machine' });
    const options = within(machineSelect).getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['Select a registered machine…', 'MRI · MRI-001']);
  });

  it('shows an actionable empty state and prevents creating an unassociated procedure', async () => {
    machineQueryMock.useMachines.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false });
    renderProcedureCreatePage();

    expect(await screen.findByText(/No active equipment is registered/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register equipment' })).toHaveAttribute('href', '/app/machines');
    expect(screen.getByRole('button', { name: 'Save procedure' })).toBeDisabled();
  });
});
