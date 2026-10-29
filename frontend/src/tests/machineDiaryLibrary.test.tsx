import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MachineDiaryLibraryPage, MachineDiaryPage } from '../features/knowledge/MachineDiaryLibraryPage';

vi.mock('../lib/api/client', () => ({
  api: { get: vi.fn() },
  getApiUrl: (path: string) => `http://api.test${path}`,
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

import { ApiClientError, api } from '../lib/api/client';
const mockGet = api.get as ReturnType<typeof vi.fn>;

const machine = {
  id: 'machine-mri', name: 'MRI', code: 'MRI-001', model_number: 'MRI-001',
  manufacturer: null, category: 'Medical Equipment', category_name: 'Medical Equipment', location: null,
  status: 'ACTIVE', is_demo: false,
  counts: { video: 1, audio: 1, transcript: 1, image: 1, document: 1, notes: 1, total: 6 },
};

const asset = (id: string, kind: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, machine_id: machine.id, version_id: null, kind, title, original_name: `${id}.dat`,
  mime: 'application/octet-stream', size_bytes: 22, uploaded_by: 'expert-1',
  created_at: '2026-10-28T10:00:00Z', verification_status: 'pending_review', ...extra,
});

function renderRouter(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/app/knowledge" element={<MachineDiaryLibraryPage />} />
    <Route path="/app/knowledge/machine/:machineId" element={<MachineDiaryPage />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

describe('Machine diary library', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows each registered machine in the selector and opens its ID-scoped diary', async () => {
    const ctScan = { ...machine, id: 'machine-cityscan', name: 'CT-Scan', code: 'CITYSCAN-001' };
    const xray = { ...machine, id: 'machine-xray', name: 'Xray', code: 'XRAY-001' };
    const ecg = { ...machine, id: 'machine-ecg', name: 'ECG', code: 'ECG-001' };
    const ultrasound = { ...machine, id: 'machine-ultrasound', name: 'Ultrasound', code: 'US-001' };
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library') return Promise.resolve([machine, ctScan, xray, ecg, { ...machine, id: 'other-machine', name: 'CNC Mill', code: 'CNC-001' }, ultrasound]);
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge');
    const selector = await screen.findByRole('combobox', { name: 'Filter by machine' });
    await screen.findByRole('option', { name: 'MRI' });
    expect(within(selector).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Choose a machine…', 'MRI', 'CT-Scan', 'Xray', 'ECG', 'CNC Mill', 'Ultrasound',
    ]);
    expect(screen.queryByText('Procedures & drafts')).not.toBeInTheDocument();
    expect(screen.queryByText(/procedures?|drafts?/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Registered Machines Diaries')).not.toBeInTheDocument();
    expect(screen.queryByText('Accessible Knowledge Records')).not.toBeInTheDocument();
    const machineCards = await screen.findAllByRole('button', { name: /^Open knowledge diary for / });
    expect(machineCards).toHaveLength(6);
    const cardColors = machineCards.map(card => card.querySelector<HTMLElement>('.diary-book')?.style.getPropertyValue('--book-a'));
    expect(cardColors).toEqual(['#1976D2', '#047857', '#1976D2', '#047857', '#1976D2', '#047857']);

    for (const [id, name] of [
      ['machine-mri', 'MRI'],
      ['machine-cityscan', 'CT-Scan'],
      ['machine-xray', 'Xray'],
      ['machine-ecg', 'ECG'],
      ['other-machine', 'CNC Mill'],
      ['machine-ultrasound', 'Ultrasound'],
    ]) {
      fireEvent.change(selector, { target: { value: id } });
      expect(screen.getByRole('button', { name: `Open knowledge diary for ${name}` })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^Open knowledge diary for / })).toHaveLength(1);
    }
  });

  it('does not invent diary options when no equipment is registered', async () => {
    mockGet.mockImplementation((path: string) => path === '/machine-knowledge/library' ? Promise.resolve([]) : Promise.resolve([]));
    renderRouter('/app/knowledge');
    const selector = await screen.findByRole('combobox', { name: 'Filter by machine' });
    const options = within(selector).getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['Choose a machine…']);
    expect(await screen.findByText('No registered machines yet')).toBeInTheDocument();
  });

  it('shows API failures with retry instead of presenting them as an empty library', async () => {
    mockGet.mockRejectedValueOnce(new Error('The knowledge service is unavailable.'));
    renderRouter('/app/knowledge');

    expect(await screen.findByRole('alert')).toHaveTextContent('The machine library could not be loaded.');
    expect(screen.getByRole('alert')).toHaveTextContent('The knowledge service is unavailable.');
    expect(screen.queryByText('No registered machines yet')).not.toBeInTheDocument();

    mockGet.mockResolvedValueOnce([machine]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Open knowledge diary for MRI' })).toBeInTheDocument();
  });

  it('explains expired authentication and links back to sign in', async () => {
    mockGet.mockRejectedValueOnce(new ApiClientError(401, 'session_expired', 'Session expired.'));
    renderRouter('/app/knowledge');

    expect(await screen.findByRole('alert')).toHaveTextContent('Your sign-in session has expired.');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('loads machine records, searches metadata, and opens the selected diary', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library') return Promise.resolve([machine]);
      if (path === '/machine-knowledge/library?machine_id=machine-mri') return Promise.resolve([machine]);
      if (path === '/machine-knowledge/machine-mri/media') return Promise.resolve([asset('video-1', 'video', 'Coolant inspection')]);
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge');
    expect(await screen.findByRole('button', { name: 'Open knowledge diary for MRI' })).toBeInTheDocument();
    expect(screen.getByText('4 entries')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search machines' }), { target: { value: 'MRI' } });
    expect(screen.getByRole('button', { name: 'Open knowledge diary for MRI' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open knowledge diary for MRI' }));

    expect(await screen.findByRole('heading', { name: 'MRI' })).toBeInTheDocument();
    expect(await screen.findByText('Coolant inspection')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Knowledge Library' })).toHaveAttribute('href', '/app/knowledge');
  });

  it('shows only Videos, Photos, Documents, and Notes, filtering those categories and isolating machine assets', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library?machine_id=machine-mri') return Promise.resolve([machine]);
      if (path === '/machine-knowledge/machine-mri/media') return Promise.resolve([
        asset('note-1', 'notes', 'Bearing temperature note', { content: 'Warm after the second cycle.' }),
        asset('image-1', 'image', 'Motor plate photo'),
        asset('audio-1', 'audio', 'Shift recording'),
        asset('video-1', 'video', 'Coolant video'),
        asset('document-1', 'document', 'Maintenance manual', { mime: 'application/pdf' }),
        asset('transcript-1', 'transcript', 'Shift transcript', { content: 'Machine is stable.' }),
        asset('other-machine', 'video', 'CT-Scan video', { machine_id: 'machine-cityscan' }),
      ]);
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge/machine/machine-mri');
    expect(await screen.findByText('Bearing temperature note')).toBeInTheDocument();
    expect(screen.getByText('Motor plate photo')).toBeInTheDocument();
    expect(screen.getByText('Coolant video')).toBeInTheDocument();
    expect(screen.getByText('Maintenance manual')).toBeInTheDocument();
    expect(screen.queryByText('Shift recording')).not.toBeInTheDocument();
    expect(screen.queryByText('Shift transcript')).not.toBeInTheDocument();
    expect(screen.queryByText('CT-Scan video')).not.toBeInTheDocument();

    const filters = within(screen.getByRole('group', { name: 'Filter diary entries' }));
    expect(filters.getAllByRole('button').map(button => button.textContent?.replace(/\d+/g, '').trim())).toEqual([
      'Videos', 'Photos', 'Documents', 'Notes',
    ]);
    fireEvent.click(filters.getByRole('button', { name: /Videos/ }));
    expect(screen.getByText('Coolant video')).toBeInTheDocument();
    expect(screen.queryByText('Bearing temperature note')).not.toBeInTheDocument();
    fireEvent.click(filters.getByRole('button', { name: /Photos/ }));
    expect(screen.getByText('Motor plate photo')).toBeInTheDocument();
    fireEvent.click(filters.getByRole('button', { name: /Documents/ }));
    expect(screen.getByText('Maintenance manual')).toBeInTheDocument();
    fireEvent.click(filters.getByRole('button', { name: /Notes/ }));
    expect(screen.getByText('Bearing temperature note')).toBeInTheDocument();
    expect(screen.queryByText('Motor plate photo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Bearing temperature note' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Warm after the second cycle.').length).toBeGreaterThan(0);
  });

  it('renders a useful empty state when a machine has no accessible knowledge', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library?machine_id=machine-mri') return Promise.resolve([{ ...machine, counts: { video: 0, audio: 0, transcript: 0, image: 0, document: 0, notes: 0, total: 0 } }]);
      if (path.includes('/media')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    renderRouter('/app/knowledge/machine/machine-mri');
    expect(await screen.findByText('This diary is ready for its first entry')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Capture the first entry/ })).toHaveAttribute('href', '/app/knowledge-assets?kind=video&machine=machine-mri');
  });
});
