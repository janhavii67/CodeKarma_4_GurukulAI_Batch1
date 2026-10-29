import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineDiaryLibraryPage, MachineDiaryPage } from '../features/knowledge/MachineDiaryLibraryPage';

const mockAuth = vi.hoisted(() => ({ roleId: 'TRAINEE', permissions: [] as string[] }));

vi.mock('../lib/api/client', () => ({
  api: { get: vi.fn() },
  getApiUrl: (path: string) => `http://api.test${path}`,
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { role_id: mockAuth.roleId }, hasPermission: (permission: string) => mockAuth.permissions.includes(permission) }),
}));

import { api } from '../lib/api/client';
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

const knowledgeItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'knowledge-sop', title: 'Coolant inspection SOP', machine_id: machine.id, author_id: 'expert-1',
  current_published_version_id: 'version-published', is_demo: false, created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-28T10:00:00Z', version_id: 'version-published', version_no: 2,
  version_status: 'published', version_summary: 'Check coolant pressure before operation.',
  version_updated_at: '2026-10-28T10:00:00Z',
  machine: { id: machine.id, name: machine.name, code: machine.code, category: machine.category, is_demo: false, created_at: '', updated_at: '' },
  ...overrides,
});

const knowledgeResponse = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 100 });

function renderRouter(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/app/knowledge" element={<MachineDiaryLibraryPage />} />
    <Route path="/app/knowledge/machine/:machineId" element={<MachineDiaryPage />} />
  </Routes></MemoryRouter>);
}

describe('Machine diary library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.roleId = 'TRAINEE';
    mockAuth.permissions = [];
  });

  it('lists every active machine, including empty volumes, and filters by actual categories', async () => {
    const ctScan = { ...machine, id: 'machine-cityscan', name: 'CT-Scan', code: 'CITYSCAN-001' };
    const cnc = { ...machine, id: 'machine-cnc', name: 'CNC Mill', category: 'Industrial Equipment', category_name: 'Industrial Equipment' };
    const decommissioned = { ...machine, id: 'machine-retired', name: 'Retired MRI', status: 'DECOMMISSIONED' };
    const empty = { ...machine, id: 'machine-empty', name: 'Empty Template', counts: { video: 0, audio: 0, transcript: 0, image: 0, document: 0, notes: 0, total: 0 } };
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library') return Promise.resolve([machine, ctScan, cnc, decommissioned, empty]);
      if (path.startsWith('/knowledge?')) return Promise.resolve(knowledgeResponse([]));
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge');
    expect(screen.queryByRole('link', { name: /Capture knowledge/ })).not.toBeInTheDocument();
    const selector = await screen.findByRole('combobox', { name: 'Filter by machine' });
    expect(within(selector).getAllByRole('option').map(option => option.textContent)).toEqual([
      'All machines', 'MRI', 'CT-Scan', 'CNC Mill', 'Empty Template',
    ]);
    const machineCards = screen.getAllByRole('button', { name: /^Open knowledge diary for / });
    expect(machineCards).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Open knowledge diary for CNC Mill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open knowledge diary for Empty Template' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open knowledge diary for Retired MRI' })).not.toBeInTheDocument();

    const categories = screen.getByRole('combobox', { name: 'Filter by machine category' });
    expect(within(categories).getAllByRole('option').map(option => option.textContent)).toEqual([
      'All categories', 'Industrial Equipment', 'Medical Equipment',
    ]);
    fireEvent.change(categories, { target: { value: 'Industrial Equipment' } });
    expect(screen.getAllByRole('button', { name: /^Open knowledge diary for / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Open knowledge diary for CNC Mill' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'No published procedures yet' })).toBeInTheDocument();
  });

  it('keeps empty and decommissioned machine volumes available to authorized creators and managers', async () => {
    mockAuth.roleId = 'ADMIN';
    mockAuth.permissions = ['knowledge.create', 'machine.manage'];
    const retired = { ...machine, id: 'machine-retired', name: 'Retired MRI', status: 'DECOMMISSIONED' };
    const empty = { ...machine, id: 'machine-empty', name: 'Empty Template', counts: { video: 0, audio: 0, transcript: 0, image: 0, document: 0, notes: 0, total: 0 } };
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library') return Promise.resolve([machine, retired, empty]);
      if (path.startsWith('/knowledge?')) return Promise.resolve(knowledgeResponse([]));
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge');
    expect(await screen.findByRole('button', { name: 'Open knowledge diary for Retired MRI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open knowledge diary for Empty Template' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Capture knowledge' })).toHaveAttribute('href', '/app/knowledge-assets?kind=video');
  });

  it('loads machine records, searches metadata, and opens the selected diary', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library') return Promise.resolve([machine]);
      if (path === '/machine-knowledge/library?machine_id=machine-mri') return Promise.resolve([machine]);
      if (path === '/machine-knowledge/machine-mri/media') return Promise.resolve([asset('video-1', 'video', 'Coolant inspection', { version_id: 'version-published', mime: 'video/mp4' })]);
      if (path.startsWith('/knowledge?')) return Promise.resolve(knowledgeResponse([knowledgeItem()]));
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge');
    expect(await screen.findByRole('button', { name: 'Open knowledge diary for MRI' })).toBeInTheDocument();
    expect(screen.getByText('4 media · 1 SOP')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search knowledge library' }), { target: { value: 'MRI' } });
    expect(screen.getByRole('button', { name: 'Open knowledge diary for MRI' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open knowledge diary for MRI' }));

    expect(await screen.findByRole('heading', { name: 'MRI' })).toBeInTheDocument();
    expect(await screen.findByText('Coolant inspection')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Knowledge Library' })).toHaveAttribute('href', '/app/knowledge');
  });

  it('shows an active machine with published SOPs even when it has no media files', async () => {
    const activeWithoutMedia = { ...machine, counts: { video: 0, audio: 0, transcript: 0, image: 0, document: 0, notes: 0, total: 0 } };
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library') return Promise.resolve([activeWithoutMedia]);
      if (path === '/machine-knowledge/library?machine_id=machine-mri') return Promise.resolve([activeWithoutMedia]);
      if (path === '/machine-knowledge/machine-mri/media') return Promise.resolve([]);
      if (path.startsWith('/knowledge?')) return Promise.resolve(knowledgeResponse([knowledgeItem()]));
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge');
    expect(await screen.findByRole('button', { name: 'Open knowledge diary for MRI' })).toBeInTheDocument();
    expect(screen.getByText('0 media · 1 SOP')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open knowledge diary for MRI' }));
    expect(await screen.findByRole('region', { name: 'Published procedures' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coolant inspection SOP' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No published media files yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open procedure' })).toHaveAttribute('href', '/app/knowledge/knowledge-sop?version_id=version-published');
  });

  it('shows current published SOP titles, machine category, version, and open action', async () => {
    const cncMachine = { ...machine, id: 'machine-cnc', name: 'CNC Mill', category: 'Industrial Equipment', category_name: 'Industrial Equipment' };
    const cncSop = knowledgeItem({
      id: 'knowledge-cnc', title: 'Spindle maintenance', machine_id: cncMachine.id,
      current_published_version_id: 'cnc-version', version_id: 'cnc-version', version_no: 4,
      machine: { id: cncMachine.id, name: cncMachine.name, code: 'CNC-001', category: cncMachine.category, is_demo: false, created_at: '', updated_at: '' },
    });
    const draft = knowledgeItem({ id: 'draft-sop', title: 'Unpublished draft', version_id: 'version-draft', version_status: 'draft' });
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library') return Promise.resolve([machine, cncMachine]);
      if (path.startsWith('/knowledge?')) return Promise.resolve(knowledgeResponse([knowledgeItem(), cncSop, draft]));
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge');
    expect(await screen.findByRole('heading', { name: 'Coolant inspection SOP' })).toBeInTheDocument();
    const publishedSection = screen.getByRole('region', { name: 'Published procedures and knowledge' });
    expect(within(publishedSection).getByText('Medical Equipment')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(within(publishedSection).getAllByText('Published')).toHaveLength(2);
    expect(screen.queryByText('Unpublished draft')).not.toBeInTheDocument();
    const coolantCard = screen.getByRole('heading', { name: 'Coolant inspection SOP' }).closest('article');
    expect(coolantCard).not.toBeNull();
    expect(within(coolantCard as HTMLElement).getByRole('link', { name: 'Open procedure' })).toHaveAttribute('href', '/app/knowledge/knowledge-sop?version_id=version-published');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by machine category' }), { target: { value: 'Industrial Equipment' } });
    expect(screen.getByRole('heading', { name: 'Spindle maintenance' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coolant inspection SOP' })).not.toBeInTheDocument();
  });

  it('shows a retryable error when published knowledge cannot be loaded', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library') return Promise.resolve([machine]);
      if (path.startsWith('/knowledge?')) return Promise.reject(new Error('Connection unavailable'));
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Published knowledge could not be loaded.')).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Connection unavailable')).toBeInTheDocument();
  });

  it('shows only Videos, Photos, Documents, and Notes, filtering those categories and isolating machine assets', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/library?machine_id=machine-mri') return Promise.resolve([machine]);
      if (path === '/machine-knowledge/machine-mri/media') return Promise.resolve([
        asset('shared-note', 'notes', 'Expert shared field note', { content: 'Added to the machine library.', machine_id: machine.id }),
        asset('shared-image', 'image', 'Expert shared photo', { machine_id: machine.id, mime: 'image/png' }),
        asset('shared-document', 'document', 'Expert shared document', { machine_id: machine.id, mime: 'application/pdf' }),
        asset('note-1', 'notes', 'Bearing temperature note', { content: 'Warm after the second cycle.', version_id: 'version-published' }),
        asset('image-1', 'image', 'Motor plate photo', { version_id: 'version-published', mime: 'image/png' }),
        asset('audio-1', 'audio', 'Shift recording'),
        asset('video-1', 'video', 'Coolant video', { version_id: 'version-published', mime: 'video/mp4' }),
        asset('document-1', 'document', 'Maintenance manual', { version_id: 'version-published', mime: 'application/pdf' }),
        asset('unsupported-doc', 'document', 'Legacy workbook', { version_id: 'version-published', mime: 'application/octet-stream' }),
        asset('unpublished-doc', 'document', 'Unpublished attachment', { version_id: 'version-draft', mime: 'application/pdf' }),
        asset('transcript-1', 'transcript', 'Shift transcript', { content: 'Machine is stable.' }),
        asset('other-machine', 'video', 'CT-Scan video', { machine_id: 'machine-cityscan' }),
      ]);
      if (path.startsWith('/knowledge?')) return Promise.resolve(knowledgeResponse([knowledgeItem()]));
      return Promise.resolve([]);
    });

    renderRouter('/app/knowledge/machine/machine-mri');
    expect(await screen.findByText('Expert shared photo')).toBeInTheDocument();
    expect(screen.getByText('Expert shared document')).toBeInTheDocument();
    expect(screen.getByText('Expert shared field note')).toBeInTheDocument();
    expect(screen.getAllByText('Shared machine library').length).toBeGreaterThan(0);
    expect(await screen.findByText('Bearing temperature note')).toBeInTheDocument();
    expect(screen.getByText('Motor plate photo')).toBeInTheDocument();
    expect(screen.getByText('Coolant video')).toBeInTheDocument();
    expect(screen.getByText('Maintenance manual')).toBeInTheDocument();
    expect(screen.getByText('Legacy workbook')).toBeInTheDocument();
    expect(screen.queryByText('Unpublished attachment')).not.toBeInTheDocument();
    expect(screen.getAllByText('v2 · Published').length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByRole('button', { name: 'Preview Coolant video' }));
    expect(screen.getByRole('dialog').querySelector('video')).toHaveAttribute('src', 'http://api.test/media/video-1');
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    fireEvent.click(filters.getByRole('button', { name: /Photos/ }));
    expect(screen.getByText('Motor plate photo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Motor plate photo' }));
    expect(within(screen.getByRole('dialog')).getByRole('img', { name: 'Motor plate photo' })).toHaveAttribute('src', 'http://api.test/media/image-1');
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    fireEvent.click(filters.getByRole('button', { name: /Documents/ }));
    expect(screen.getByText('Maintenance manual')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Maintenance manual' }));
    expect(screen.getByTitle('PDF preview: Maintenance manual')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open or download PDF' })).toHaveAttribute('href', 'http://api.test/media/document-1');
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview Legacy workbook' }));
    expect(screen.getByRole('status')).toHaveTextContent('Preview is unavailable for this file type.');
    expect(screen.getByRole('link', { name: 'Open or download file' })).toHaveAttribute('href', 'http://api.test/media/unsupported-doc');
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
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
      if (path.startsWith('/knowledge?')) return Promise.resolve(knowledgeResponse([]));
      return Promise.resolve([]);
    });
    renderRouter('/app/knowledge/machine/machine-mri');
    expect(await screen.findByText('No published machine knowledge available')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Capture the first entry/ })).not.toBeInTheDocument();
    expect(screen.getByText('Published machine media and procedures will appear here when available.')).toBeInTheDocument();
  });
});
