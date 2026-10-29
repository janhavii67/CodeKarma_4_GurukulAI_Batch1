import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MessageBubble } from '../features/assistant/components/MessageBubble';
import type { Message } from '../features/assistant/types';

const answer = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  conversation_id: 'conv-1',
  role: 'assistant',
  content: 'Inspect the spindle using the documented sequence.',
  is_ai_generated: true,
  evidence_status: 'sufficient',
  sources: [{ chunk_id: 'chk-1', source_id: 'src-1', title: 'Spindle inspection SOP', snippet: 'Inspect the spindle.', type: 'knowledge_version' } as never],
  related_media: [
    { id: 'img-1', title: 'Spindle diagram', kind: 'image', mime: 'image/png', filename: 'spindle.png', size_bytes: 2048, url: '/api/v1/media/img-1', source_id: 'src-1', source_title: 'Spindle inspection SOP' },
    { id: 'aud-1', title: 'Normal spindle tone', kind: 'audio', mime: 'audio/wav', filename: 'tone.wav', size_bytes: 4096, url: '/api/v1/media/aud-1', source_id: 'src-1', source_title: 'Spindle inspection SOP' },
  ],
  ...overrides,
});

describe('Tutor related media', () => {
  it('lists media from cited knowledge as citations without embedding the files', () => {
    render(<MemoryRouter><MessageBubble message={answer()} /></MemoryRouter>);
    expect(screen.getByRole('region', { name: 'Related media from cited knowledge' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open image citation 1: Spindle diagram, from Spindle inspection SOP' })).toHaveAttribute('href', expect.stringContaining('/api/v1/media/img-1'));
    expect(screen.getByRole('link', { name: 'Open audio citation 2: Normal spindle tone, from Spindle inspection SOP' })).toHaveAttribute('href', expect.stringContaining('/api/v1/media/aud-1'));
    expect(screen.queryByRole('img', { name: 'Spindle diagram' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Normal spindle tone preview')).not.toBeInTheDocument();
  });

  it('never shows media on an insufficient-evidence answer', () => {
    render(<MemoryRouter><MessageBubble message={answer({ evidence_status: 'insufficient', sources: [] })} /></MemoryRouter>);
    expect(screen.queryByRole('region', { name: 'Related media from cited knowledge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Spindle diagram' })).not.toBeInTheDocument();
  });
});
