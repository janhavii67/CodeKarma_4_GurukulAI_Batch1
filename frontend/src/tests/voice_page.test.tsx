import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { VoiceToKnowledgePage } from '../features/voice/VoiceToKnowledgePage';
import * as voiceApi from '../features/voice/voiceApi';
import { api } from '../lib/api/client';

describe('VoiceToKnowledgePage Integration Test', () => {
  beforeEach(() => {
    vi.spyOn(voiceApi, 'listVoiceAssets').mockResolvedValue([]);
    vi.spyOn(api, 'get').mockResolvedValue([]);
  });

  it('renders VoiceToKnowledgePage without crashing', async () => {
    render(
      <BrowserRouter>
        <VoiceToKnowledgePage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Voice-to-Knowledge Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/Record \/ Upload Narration/i)).toBeInTheDocument();
    expect(screen.getByText(/Semantic Vector Search/i)).toBeInTheDocument();
  });
});
