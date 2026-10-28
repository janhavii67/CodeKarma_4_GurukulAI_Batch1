import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAssistantChat } from '../features/assistant/useAssistantChat';
import { api } from '../lib/api/client';

function createMockSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('useAssistantChat Hook Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('streams tokens and attaches sources successfully', async () => {
    const sseChunks = [
      'event: token\ndata: {"token":"Check "}\n\n',
      'event: token\ndata: {"token":"valve pressure."}\n\n',
      'event: sources\ndata: {"sources":[{"chunk_id":"chk-1","source_id":"src-1","title":"Pneumatics SOP","snippet":"Check valve pressure to 75 PSI."}],"insufficient_evidence":false,"conversation_id":"conv-101","message_id":"msg-202"}\n\n',
      'event: done\ndata: [DONE]\n\n',
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createMockSSEStream(sseChunks),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    });

    const { result } = renderHook(() => useAssistantChat());

    expect(result.current.state).toBe('idle');
    expect(result.current.messages).toEqual([]);

    await act(async () => {
      await result.current.sendMessage('How do I inspect the pneumatic valve?');
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.conversationId).toBe('conv-101');
    expect(result.current.messages).toHaveLength(2);

    const [userMsg, asstMsg] = result.current.messages;
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('How do I inspect the pneumatic valve?');

    expect(asstMsg.role).toBe('assistant');
    expect(asstMsg.content).toBe('Check valve pressure.');
    expect(asstMsg.evidence_status).toBe('sufficient');
    expect(asstMsg.sources).toHaveLength(1);
    expect(asstMsg.sources![0].title).toBe('Pneumatics SOP');
    expect(asstMsg.sources![0].url).toBe('/app/knowledge/src-1');
  });

  it('handles insufficient_evidence state when knowledge base lacks answers', async () => {
    const sseChunks = [
      'event: token\ndata: {"token":"The verified technical knowledge base does not contain sufficient information."}\n\n',
      'event: sources\ndata: {"sources":[],"insufficient_evidence":true,"conversation_id":"conv-insuf","message_id":"msg-insuf"}\n\n',
      'event: done\ndata: [DONE]\n\n',
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createMockSSEStream(sseChunks),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    });

    const { result } = renderHook(() => useAssistantChat());

    await act(async () => {
      await result.current.sendMessage('Unknown alien machine instructions');
    });

    expect(result.current.state).toBe('insufficient_evidence');
    expect(result.current.messages).toHaveLength(2);
    const asstMsg = result.current.messages[1];
    expect(asstMsg.evidence_status).toBe('insufficient');
    expect(asstMsg.sources).toEqual([]);
    expect(asstMsg.content).toContain('does not contain sufficient information');
  });

  it('reports provider failure separately and drops partial text and citations', async () => {
    const sseChunks = [
      'event: token\ndata: {"token":"partial unsafe answer"}\n\n',
      'event: failure\ndata: {"answer":"The AI assistant is temporarily unavailable. Please try again shortly.","conversation_id":"conv-down","message_id":"msg-down"}\n\n',
      'event: sources\ndata: {"sources":[],"insufficient_evidence":false,"provider_unavailable":true,"conversation_id":"conv-down","message_id":"msg-down"}\n\n',
      'event: done\ndata: [DONE]\n\n',
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: createMockSSEStream(sseChunks),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    });

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage('Question with retrieved context');
    });

    const assistant = result.current.messages[1];
    expect(assistant.content).toContain('temporarily unavailable');
    expect(assistant.content).not.toContain('partial unsafe answer');
    expect(assistant.provider_unavailable).toBe(true);
    expect(assistant.evidence_status).toBe('n_a');
    expect(assistant.sources).toEqual([]);
    expect(result.current.state).toBe('idle');
  });

  it('falls back to non-streaming endpoint when streaming fails', async () => {
    // 1. Streaming fails
    global.fetch = vi.fn().mockRejectedValue(new Error('SSE network disconnect'));

    // 2. Non-streaming fallback succeeds
    const mockPost = vi.spyOn(api, 'post').mockResolvedValue({
      answer: 'Standard spindle warmup is 15 minutes at 5000 RPM.',
      sources: [
        {
          chunk_id: 'chk-warmup',
          source_id: 'src-warmup',
          title: 'Spindle SOP',
          snippet: 'Run spindle at 5000 RPM for 15 minutes.',
          score: 0.95,
          rank: 1,
          source_type: 'knowledge_version',
        },
      ],
      insufficient_evidence: false,
      conversation_id: 'conv-fallback-42',
      message_id: 'msg-fallback-99',
    });

    const { result } = renderHook(() => useAssistantChat());

    await act(async () => {
      await result.current.sendMessage('Spindle warmup procedure');
    });

    expect(mockPost).toHaveBeenCalledWith('/assistant/chat', {
      message: 'Spindle warmup procedure',
      conversation_id: undefined,
      machine_id: undefined,
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.conversationId).toBe('conv-fallback-42');
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe('Standard spindle warmup is 15 minutes at 5000 RPM.');
    expect(result.current.messages[1].sources).toHaveLength(1);
    expect(result.current.messages[1].sources![0].title).toBe('Spindle SOP');

    mockPost.mockRestore();
  });

  it('enters error state when both streaming and fallback fail', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('SSE stream connection refused'));
    const mockPost = vi.spyOn(api, 'post').mockRejectedValue(new Error('Gateway 502 Bad Gateway'));

    const onError = vi.fn();
    const { result } = renderHook(() => useAssistantChat({ onError }));

    await act(async () => {
      await result.current.sendMessage('Any question');
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error?.message).toBe('Gateway 502 Bad Gateway');
    expect(onError).toHaveBeenCalled();

    mockPost.mockRestore();
  });

  it('supports cancellation via cancel() / AbortController', async () => {
    let abortCalled = false;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      init?.signal?.addEventListener('abort', () => {
        abortCalled = true;
      });
      return new Promise(() => {
        // Never resolves to simulate ongoing stream
      });
    });

    const { result } = renderHook(() => useAssistantChat());

    act(() => {
      result.current.sendMessage('Long running query');
    });

    expect(result.current.state).toBe('streaming');
    expect(result.current.isStreaming).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(abortCalled).toBe(true);
    expect(result.current.state).toBe('idle');
    expect(result.current.isStreaming).toBe(false);
  });
});
