import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MachineKnowledgePage } from '../features/knowledge/MachineKnowledgePage';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), upload: vi.fn() }));
vi.mock('../lib/api/client', () => ({ api: apiMock, getApiUrl: (path: string) => `http://api.test/api/v1${path}` }));
vi.mock('../features/knowledge-capture/knowledgeApi', () => ({ fetchMachines: vi.fn().mockResolvedValue({ items: [{ id: 'machine-cnc', name: 'CNC Machine', code: 'CNC-1' }] }) }));
vi.mock('../features/knowledge-capture/media/mediaApi', () => ({ mediaApi: { delete: apiMock.delete } }));
vi.mock('../features/knowledge-capture/media/uploadWithProgress', () => ({ uploadWithProgress: apiMock.upload }));

describe('machine knowledge capture', () => {
  beforeEach(() => {
    apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.patch.mockReset(); apiMock.delete.mockReset();
    apiMock.get.mockResolvedValue([]);
  });

  it('saves a note to the selected registered machine and reloads it in that machine library', async () => {
    const user = userEvent.setup();
    apiMock.post.mockResolvedValue({ id: 'note-1', machine_id: 'machine-cnc', title: 'Coolant check', kind: 'notes', original_name: 'note.txt', created_at: new Date().toISOString(), content: 'Check coolant flow.' });
    render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
    await screen.findByRole('option', { name: /CNC Machine/ });
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
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<MemoryRouter><MachineKnowledgePage /></MemoryRouter>);
    await user.selectOptions(await screen.findByLabelText('Machine'), 'machine-cnc');
    await user.click(screen.getByRole('button', {name:'audio'}));
    await user.click(screen.getByRole('button', {name:'Start recording'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was denied');
  });
});
