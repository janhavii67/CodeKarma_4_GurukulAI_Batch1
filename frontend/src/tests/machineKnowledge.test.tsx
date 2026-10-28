import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MachineKnowledgePage } from '../features/knowledge/MachineKnowledgePage';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), upload: vi.fn() }));
vi.mock('../lib/api/client', () => ({ api: apiMock, getApiUrl: (path: string) => `http://api.test/api/v1${path}` }));
vi.mock('../features/knowledge-capture/knowledgeApi', () => ({ fetchMachines: vi.fn().mockResolvedValue({ items: [
  { id: 'machine-cnc', name: 'MRI', code: 'MRI-001' },
  { id: 'machine-cityscan', name: 'CT-Scan', code: 'CITYSCAN-001' },
  { id: 'machine-xray', name: 'Xray', code: 'XRAY-001' },
  { id: 'machine-ecg', name: 'ECG', code: 'ECG-001' },
  { id: 'legacy-machine', name: 'CNC Machine', code: 'CNC-1' },
] }) }));
vi.mock('../features/knowledge-capture/media/mediaApi', () => ({ mediaApi: { delete: apiMock.delete } }));
vi.mock('../features/knowledge-capture/media/uploadWithProgress', () => ({ uploadWithProgress: apiMock.upload }));

describe('machine knowledge capture', () => {
  beforeEach(() => {
    apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.patch.mockReset(); apiMock.delete.mockReset(); apiMock.upload.mockReset();
    apiMock.get.mockResolvedValue([]);
  });

  it('offers only the four registered machines in the capture selector', async () => {
    render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
    const selector = await screen.findByLabelText('Machine');
    expect(Array.from(selector.querySelectorAll('option')).map(option => option.textContent)).toEqual([
      'Select a registered machine…', 'MRI', 'CT-Scan', 'Xray', 'ECG',
    ]);
  });

  it('saves a note to the selected registered machine and reloads it in that machine library', async () => {
    const user = userEvent.setup();
    apiMock.post.mockResolvedValue({ id: 'note-1', machine_id: 'machine-cnc', title: 'Coolant check', kind: 'notes', original_name: 'note.txt', created_at: new Date().toISOString(), content: 'Check coolant flow.' });
    render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
    await screen.findByRole('option', { name: 'MRI' });
    await user.selectOptions(screen.getByLabelText('Machine'), 'machine-cnc');
    await user.click(screen.getByRole('button', { name: 'notes' }));
    await user.type(screen.getByPlaceholderText('Knowledge title'), 'Coolant check');
    await user.type(screen.getByPlaceholderText(/Write a machine observation/), 'Check coolant flow.');
    await user.click(screen.getByRole('button', { name: 'Save to machine knowledge' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/machine-knowledge/machine-cnc/notes', expect.any(FormData)));
    expect(await screen.findByText('Coolant check')).toBeTruthy();
    apiMock.patch.mockResolvedValue({ id: 'note-1', machine_id: 'machine-cnc', title: 'Coolant check revised', description: 'Check indicator level.', tags: 'coolant, daily' });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Asset title'));
    await user.type(screen.getByLabelText('Asset title'), 'Coolant check revised');
    await user.type(screen.getByLabelText('Asset description'), 'Check indicator level.');
    await user.type(screen.getByLabelText('Asset tags'), 'coolant, daily');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/media/note-1', expect.objectContaining({ title: 'Coolant check revised' })));
    expect(await screen.findByText('Coolant check revised')).toBeTruthy();
  });

  it('rejects a PDF in the video workflow before upload', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
    await user.selectOptions(await screen.findByLabelText('Machine'), 'machine-cnc');
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const pdf = new File(['%PDF-1.4'], 'manual.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });
    await user.click(screen.getByRole('button', { name: 'Save to machine knowledge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a supported video file.');
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('supports cancelling and confirming asset deletion', async () => {
    const user = userEvent.setup();
    apiMock.post.mockResolvedValue({ id: 'note-delete-1', machine_id: 'machine-cnc', title: 'Delete test note', kind: 'notes', original_name: 'delete.txt', created_at: new Date().toISOString(), content: 'Temporary note.' });
    apiMock.delete.mockResolvedValue(undefined);
    render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
    await user.selectOptions(await screen.findByLabelText('Machine'), 'machine-cnc');
    await user.click(screen.getByRole('button', { name: 'notes' }));
    await user.type(screen.getByPlaceholderText('Knowledge title'), 'Delete test note');
    await user.type(screen.getByPlaceholderText(/Write a machine observation/), 'Temporary note.');
    await user.click(screen.getByRole('button', { name: 'Save to machine knowledge' }));
    await screen.findByText('Delete test note');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete knowledge asset?');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiMock.delete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete test note')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete asset' }));
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('note-delete-1'));
    expect(await screen.findByText('Asset deleted.')).toBeInTheDocument();
    expect(screen.queryByText('Delete test note')).not.toBeInTheDocument();
  });

  it('records with permission, pauses, resumes, previews, discards, and saves audio', async () => {
    const user = userEvent.setup();
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const originalMediaRecorder = globalThis.MediaRecorder;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    class FakeMediaRecorder {
      state = 'inactive'; mimeType = 'audio/webm'; ondataavailable: ((event: {data: Blob})=>void) | null = null; onstop: (()=>void) | null = null;
      start() { this.state = 'recording'; }
      pause() { this.state = 'paused'; }
      resume() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({data:new Blob(['recorded bytes'],{type:'audio/webm'})}); this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(URL, 'createObjectURL', { configurable:true, value:()=> 'blob:audio-preview' });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable:true, value:()=> undefined });
    apiMock.upload.mockResolvedValue({ id:'audio-1', machine_id:'machine-cnc', title:'Audio tip', kind:'audio', original_name:'recording.webm', created_at:new Date().toISOString() });
    try {
      render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
      await user.selectOptions(await screen.findByLabelText('Machine'), 'machine-cnc');
      await user.click(screen.getByRole('button', {name:'audio'}));
      await user.click(screen.getByRole('button', {name:'Start recording'}));
      await user.click(screen.getByRole('button', {name:'Pause'}));
      await user.click(screen.getByRole('button', {name:'Resume'}));
      await user.click(screen.getByRole('button', {name:'Stop recording'}));
      expect(await screen.findByLabelText('Recorded audio preview')).toBeTruthy();
      await user.click(screen.getByRole('button', {name:'Discard and record again'}));
      await user.click(screen.getByRole('button', {name:'Start recording'}));
      await user.click(screen.getByRole('button', {name:'Stop recording'}));
      await user.type(screen.getByPlaceholderText('Knowledge title'), 'Audio tip');
      await user.click(screen.getByRole('button', {name:'Save to machine knowledge'}));
      await waitFor(() => expect(apiMock.upload).toHaveBeenCalledWith('', expect.any(File), expect.objectContaining({endpoint:'/machine-knowledge/machine-cnc/media', kind:'audio'})));
      expect(track.stop).toHaveBeenCalled();
    } finally {
      cleanup();
      vi.stubGlobal('MediaRecorder', originalMediaRecorder);
      if (originalCreateObjectURL) Object.defineProperty(URL,'createObjectURL',{configurable:true,value:originalCreateObjectURL}); else delete (URL as Partial<typeof URL>).createObjectURL;
      if (originalRevokeObjectURL) Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:originalRevokeObjectURL}); else delete (URL as Partial<typeof URL>).revokeObjectURL;
    }
  });

  it('shows a clear microphone permission error', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) } });
    const originalMediaRecorder = globalThis.MediaRecorder;
    vi.stubGlobal('MediaRecorder', class PermissionCheckMediaRecorder {});
    try {
      render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
      await user.selectOptions(await screen.findByLabelText('Machine'), 'machine-cnc');
      await user.click(screen.getByRole('button', {name:'audio'}));
      await user.click(screen.getByRole('button', {name:'Start recording'}));
      expect(await screen.findByRole('alert')).toHaveTextContent('Microphone permission was denied');
    } finally {
      cleanup();
      vi.stubGlobal('MediaRecorder', originalMediaRecorder);
    }
  });

  it('explains when microphone recording is unsupported', async () => {
    const user = userEvent.setup();
    const originalMediaRecorder = globalThis.MediaRecorder;
    const originalMediaDevices = navigator.mediaDevices;
    vi.stubGlobal('MediaRecorder', undefined);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    try {
      render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
      await user.selectOptions(await screen.findByLabelText('Machine'), 'machine-cnc');
      await user.click(screen.getByRole('button', { name: 'audio' }));
      await user.click(screen.getByRole('button', { name: 'Start recording' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('not supported by this browser');
      expect(apiMock.upload).not.toHaveBeenCalled();
    } finally {
      cleanup();
      vi.stubGlobal('MediaRecorder', originalMediaRecorder);
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices });
    }
  });

  it('does not save an empty recording', async () => {
    const user = userEvent.setup();
    const stream = { getTracks: () => [{ stop: vi.fn() }] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const originalMediaRecorder = globalThis.MediaRecorder;
    class EmptyMediaRecorder {
      state = 'inactive'; mimeType = 'audio/webm'; ondataavailable: ((event: {data: Blob})=>void) | null = null; onstop: (()=>void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', EmptyMediaRecorder);
    try {
      render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
      await user.selectOptions(await screen.findByLabelText('Machine'), 'machine-cnc');
      await user.click(screen.getByRole('button', { name: 'audio' }));
      await user.click(screen.getByRole('button', { name: 'Start recording' }));
      await user.click(screen.getByRole('button', { name: 'Stop recording' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No audio was captured');
      await user.type(screen.getByPlaceholderText('Knowledge title'), 'Empty recording');
      await user.click(screen.getByRole('button', { name: 'Save to machine knowledge' }));
      expect(apiMock.upload).not.toHaveBeenCalled();
    } finally {
      cleanup();
      vi.stubGlobal('MediaRecorder', originalMediaRecorder);
    }
  });

  it('opens, edits, and saves a transcript linked to its original machine recording', async () => {
    const user = userEvent.setup();
    const audio = { id: 'audio-linked', machine_id: 'machine-cnc', title: 'Spindle sound', kind: 'audio', original_name: 'spindle.webm', mime: 'audio/webm', size_bytes: 20, uploaded_by: 'expert', created_at: new Date().toISOString(), transcript_id: 'transcript-linked', transcript_status: 'completed' };
    apiMock.get.mockImplementation((path: string) => {
      if (path === '/machine-knowledge/machine-cnc/media') return Promise.resolve([audio]);
      if (path === '/voice/transcripts/transcript-linked') return Promise.resolve({ id: 'transcript-linked', media_id: 'audio-linked', machine_id: 'machine-cnc', status: 'completed', full_text: 'Initial transcript' });
      if (path === '/machine-knowledge/machine-cnc/media?kind=audio') return Promise.resolve([audio]);
      return Promise.resolve([]);
    });
    apiMock.patch.mockResolvedValue({ id: 'transcript-linked', media_id: 'audio-linked', status: 'completed', full_text: 'Reviewed transcript' });
    const { container } = render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
    await user.selectOptions(await screen.findByLabelText('Machine'), 'machine-cnc');
    await user.click(await screen.findByRole('button', { name: 'Transcript · completed' }));
    const editor = await screen.findByLabelText('Transcript text');
    await user.clear(editor);
    await user.type(editor, 'Reviewed transcript');
    await user.click(screen.getByRole('button', { name: 'Save transcript edit' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/voice/transcripts/transcript-linked', { full_text: 'Reviewed transcript' }));
    expect(await screen.findAllByText('Transcript updated.')).not.toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Open original recording' }));
    expect(await screen.findByRole('heading', { name: 'Spindle sound' })).toBeInTheDocument();
    expect(container.querySelector('audio')).toBeInTheDocument();
  });

  it('reports recording save failures and allows retry', async () => {
    const user = userEvent.setup();
    const stream = { getTracks: () => [{ stop: vi.fn() }] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const originalMediaRecorder = globalThis.MediaRecorder;
    class FailingSaveMediaRecorder {
      state = 'inactive'; mimeType = 'audio/webm'; ondataavailable: ((event: {data: Blob})=>void) | null = null; onstop: (()=>void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({data:new Blob(['audio bytes'],{type:'audio/webm'})}); this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', FailingSaveMediaRecorder);
    apiMock.upload.mockRejectedValueOnce(new Error('Upload service unavailable'));
    apiMock.upload.mockResolvedValueOnce({ id:'retry-audio-1', machine_id:'machine-cnc', title:'Retry recording', kind:'audio', original_name:'recording.webm', created_at:new Date().toISOString() });
    try {
      render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
      await user.selectOptions(await screen.findByLabelText('Machine'), 'machine-cnc');
      await user.click(screen.getByRole('button', { name: 'audio' }));
      await user.click(screen.getByRole('button', { name: 'Start recording' }));
      await user.click(screen.getByRole('button', { name: 'Stop recording' }));
      await user.type(screen.getByPlaceholderText('Knowledge title'), 'Retry recording');
      await user.click(screen.getByRole('button', { name: 'Save to machine knowledge' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Upload service unavailable');
      expect(screen.getByRole('button', { name: 'Discard and record again' })).toBeInTheDocument();
      expect(apiMock.upload).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Save to machine knowledge' }));
      expect(await screen.findByText('Knowledge saved to the selected machine.')).toBeInTheDocument();
      expect(apiMock.upload).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
      vi.stubGlobal('MediaRecorder', originalMediaRecorder);
    }
  });
});
