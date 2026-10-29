import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
let catalog: typeof machine[];
const categories = [
  { id: 'mri-systems', name: 'MRI Systems', is_active: true },
  { id: 'ultrasound-systems', name: 'Ultrasound Systems', is_active: true },
  { id: 'other-medical-equipment', name: 'Other Medical Equipment', is_active: true },
];

function renderMachinesPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><MachinesPage /></MemoryRouter></QueryClientProvider>);
}

describe('Machine deletion flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog = [machine];
    apiMock.get.mockImplementation((path: string) => {
      if (path === '/machines/categories') return Promise.resolve(categories);
      if (path.startsWith('/machines')) return Promise.resolve({ items: catalog, total: catalog.length, page: 1, page_size: 100 });
      return Promise.resolve(catalog.find(item => path === `/machines/${item.id}`));
    });
    apiMock.delete.mockImplementation(async (path: string) => {
      const id = path.split('/').pop();
      catalog = catalog.filter(item => item.id !== id);
    });
  });

  it('sends the machine database ID and removes it from the list only after success', async () => {
    const user = userEvent.setup();
    renderMachinesPage();

    expect(await screen.findByRole('heading', { name: 'MRI' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('MRI');
    await user.click(screen.getByRole('button', { name: 'Delete machine' }));

    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/machines/machine-mri-uuid'));
    expect(await screen.findByRole('status')).toHaveTextContent('Machine “MRI” was deleted. Its knowledge is hidden from My Knowledge; content, review history, and files were retained.');
    expect(screen.queryByRole('heading', { name: 'MRI' })).not.toBeInTheDocument();
  });

  it('shows active equipment by default and keeps archived records available on demand', async () => {
    catalog = [machine, ...otherMachines.map(item => ({ ...item, is_active: false }))];
    apiMock.get.mockImplementation((path: string) => path === '/machines/categories'
      ? Promise.resolve(categories)
      : Promise.resolve({ items: catalog, total: catalog.length, page: 1, page_size: 100 }));

    renderMachinesPage();

    expect(await screen.findByRole('heading', { name: machine.name })).toBeInTheDocument();
    for (const item of otherMachines) expect(screen.queryByRole('heading', { name: item.name })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show inactive equipment' }));
    for (const item of otherMachines) expect(await screen.findByRole('heading', { name: item.name })).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith('/machines?page=1&page_size=100');
  });

  it('persists category and equipment metadata, then refreshes the shared catalog after registration', async () => {
    const user = userEvent.setup();
    const created = {
      ...machine, id: 'ultrasound-id', name: 'Ultrasound', code: 'US-001', model_number: 'US-9000',
      category_id: 'ultrasound-systems', category_name: 'Ultrasound Systems', manufacturer: 'Medical Systems Ltd',
    };
    apiMock.post.mockImplementation(async (path: string, payload: Record<string, unknown>) => {
      expect(path).toBe('/machines');
      expect(payload.category_id).toBe('ultrasound-systems');
      expect(payload.manufacturer).toBe('Medical Systems Ltd');
      catalog = [...catalog, created];
      return created;
    });
    renderMachinesPage();
    await user.click(await screen.findByRole('button', { name: 'Register Equipment' }));
    await screen.findByText('Register New Equipment');
    await user.type(screen.getByLabelText(/Equipment Name/), 'Ultrasound');
    await user.type(screen.getByLabelText(/Asset Code/), 'US-001');
    await user.type(screen.getByLabelText(/Model Number/), 'US-9000');
    await user.selectOptions(screen.getByLabelText('Equipment category'), 'ultrasound-systems');
    await user.type(screen.getByLabelText(/Manufacturer/), 'Medical Systems Ltd');
    await user.click(screen.getByRole('button', { name: 'Register Asset' }));

    expect(await screen.findByText('Machine "Ultrasound" registered successfully.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ultrasound' })).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByText('Machine “MRI” was deleted. Its knowledge is hidden from My Knowledge; content, review history, and files were retained.')).not.toBeInTheDocument();
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
