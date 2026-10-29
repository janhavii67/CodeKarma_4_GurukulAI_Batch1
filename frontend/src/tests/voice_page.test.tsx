import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoiceToKnowledgePage } from '../features/voice/VoiceToKnowledgePage';
import * as voiceApi from '../features/voice/voiceApi';
import { api } from '../lib/api/client';

describe('VoiceToKnowledgePage Integration Test', () => {
  beforeEach(() => {
    vi.spyOn(voiceApi, 'listVoiceAssets').mockResolvedValue([]);
    vi.spyOn(api, 'get').mockImplementation((path: string) => path.startsWith('/machines?')
      ? Promise.resolve({ items: [], total: 0, page: 1, page_size: 100 }) as any
      : Promise.resolve([]) as any);
  });

  it('renders VoiceToKnowledgePage without crashing', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><BrowserRouter><VoiceToKnowledgePage /></BrowserRouter></QueryClientProvider>);

    expect(screen.getByText(/Voice-to-Knowledge Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/Record \/ Upload Narration/i)).toBeInTheDocument();
    expect(screen.getByText(/Semantic Vector Search/i)).toBeInTheDocument();
  });
});
