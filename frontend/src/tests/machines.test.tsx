import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MachinesPage } from '../features/machines/MachinesPage';
import { ApiClientError } from '../lib/api/client';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../lib/api/client', () => ({
  api: apiMock,
  ApiClientError: class ApiClientError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

const machine = {
  id: 'machine-mri-uuid',
  name: 'MRI',
  code: 'MRI-001',
  model_number: 'MRI-001',
  status: 'ACTIVE',
  is_demo: false,
  tools: [],
};
const otherMachines = ['Demo Machine A (Lathe)', 'HAAS VF-2 Vertical Machining Center'].map((name, index) => ({
  ...machine,
  id: `hidden-machine-${index}`,
  name,
  code: `HIDDEN-${index}`,
}));

function renderMachinesPage() {
  return render(<MemoryRouter><MachinesPage /></MemoryRouter>);
}

describe('Machine deletion flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockImplementation((path: string) => path === '/machines/categories'
      ? Promise.resolve([])
      : Promise.resolve({ items: [machine], total: 1, page: 1, page_size: 20 }));
  });

  it('sends the machine database ID and removes it from the list only after success', async () => {
    const user = userEvent.setup();
    apiMock.delete.mockResolvedValue(undefined);
    renderMachinesPage();

    expect(await screen.findByRole('heading', { name: 'MRI' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('MRI');
    await user.click(screen.getByRole('button', { name: 'Delete machine' }));

    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/machines/machine-mri-uuid'));
    expect(await screen.findByRole('status')).toHaveTextContent('Machine “MRI” was deleted.');
    expect(screen.queryByRole('heading', { name: 'MRI' })).not.toBeInTheDocument();
  });

  it('shows only MRI, CT-Scan, Xray, and ECG while retaining other catalog records in the API response', async () => {
    const supported = [
      { name: 'MRI', code: 'MRI-001' },
      { name: 'CT-Scan', code: 'CITYSCAN-001' },
      { name: 'Xray', code: 'XRAY-001' },
      { name: 'ECG', code: 'ECG-001' },
    ].map(({ name, code }) => ({
      ...machine,
      id: `supported-${name}`,
      name,
      code,
    }));
    apiMock.get.mockImplementation((path: string) => path === '/machines/categories'
      ? Promise.resolve([])
      : Promise.resolve({ items: [...supported, ...otherMachines], total: 6, page: 1, page_size: 20 }));

    renderMachinesPage();

    for (const name of ['MRI', 'CT-Scan', 'Xray', 'ECG']) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('heading', { name: 'Demo Machine A (Lathe)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'HAAS VF-2 Vertical Machining Center' })).not.toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith('/machines');
  });

  it('shows a backend dependency error and keeps the machine visible', async () => {
    const user = userEvent.setup();
    apiMock.delete.mockRejectedValue(new ApiClientError(409, 'machine_in_use', 'Machine is referenced by knowledge records.'));
    renderMachinesPage();

    expect(await screen.findByRole('heading', { name: 'MRI' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete machine' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Machine is referenced by knowledge records.');
    expect(screen.getByRole('heading', { name: 'MRI' })).toBeInTheDocument();
    expect(screen.queryByText('Machine “MRI” was deleted.')).not.toBeInTheDocument();
  });

  it('keeps confirmation actions disabled during a pending delete request', async () => {
    const user = userEvent.setup();
    let finishDelete!: (value: void) => void;
    apiMock.delete.mockReturnValue(new Promise<void>((resolve) => { finishDelete = resolve; }));
    renderMachinesPage();

    expect(await screen.findByRole('heading', { name: 'MRI' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete machine' }));

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    finishDelete();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});
