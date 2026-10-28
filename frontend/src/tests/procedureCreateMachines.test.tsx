import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProcedureCreatePage } from '../features/knowledge/ProcedureCreatePage';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
const machineApiMock = vi.hoisted(() => ({ fetchMachines: vi.fn() }));

vi.mock('../lib/api/client', () => ({ api: apiMock }));
vi.mock('../features/knowledge-capture/knowledgeApi', () => machineApiMock);

const machines = [
  { id: 'mri-real-id', name: 'MRI', code: 'MRI-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'cityscan-real-id', name: 'CT-Scan', code: 'CITYSCAN-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'xray-real-id', name: 'Xray', code: 'XRAY-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'ecg-real-id', name: 'ECG', code: 'ECG-001', category: 'medical', is_demo: false, created_at: '', updated_at: '' },
  { id: 'cnc-real-id', name: 'CNC Mill', code: 'CNC-001', category: 'industrial', is_demo: false, created_at: '', updated_at: '' },
];

function renderProcedureCreatePage() {
  return render(<MemoryRouter><ProcedureCreatePage /></MemoryRouter>);
}

describe('Create Procedure machine selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    machineApiMock.fetchMachines.mockResolvedValue({ items: machines, total: machines.length, page: 1, page_size: 100 });
    apiMock.get.mockImplementation((path: string) => path === '/procedures/mine/drafts' ? Promise.resolve([]) : Promise.resolve([]));
    apiMock.post.mockResolvedValue({ id: 'new-procedure' });
  });

  it('offers only the four supported machine labels and saves the real selected machine ID', async () => {
    const user = userEvent.setup();
    renderProcedureCreatePage();

    const machineSelect = await screen.findByRole('combobox', { name: 'Machine' });
    expect(within(machineSelect).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Select a registered machine…', 'MRI', 'CT-Scan', 'Xray', 'ECG',
    ]);
    expect(within(machineSelect).queryByRole('option', { name: 'CNC Mill' })).not.toBeInTheDocument();

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

  it('shows missing supported machines as disabled and explains that they must be registered', async () => {
    machineApiMock.fetchMachines.mockResolvedValue({
      items: [machines[0], machines[4]], total: 2, page: 1, page_size: 100,
    });
    renderProcedureCreatePage();

    const machineSelect = await screen.findByRole('combobox', { name: 'Machine' });
    const options = within(machineSelect).getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      'Select a registered machine…', 'MRI', 'CT-Scan', 'Xray', 'ECG',
    ]);
    expect(options[2]).toBeDisabled();
    expect(screen.getByText(/CT-Scan, Xray, ECG are not registered yet/)).toBeInTheDocument();
  });
});
