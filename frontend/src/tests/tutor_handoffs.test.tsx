import React, { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../features/assistant/components/MessageBubble';
import { api } from '../lib/api/client';

const LocationProbe = () => <output data-testid="location">{useLocation().pathname + useLocation().search}</output>;

describe('Tutor contextual handoffs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts an explicitly selected handoff and navigates to its existing session page', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      kind: 'workflow', session_id: 'run-123', title: 'Approved inspection workflow', resumed: true,
    });
    render(
      <MemoryRouter initialEntries={['/app/assistant']}>
        <Routes>
          <Route path="/app/assistant" element={
            <>
              <MessageBubble message={{
                id: 'assistant-message-1',
                conversation_id: 'conversation-1',
                role: 'assistant',
                content: 'Follow the approved inspection sequence.',
                evidence_status: 'sufficient',
                handoffs: [{ kind: 'workflow', target_id: 'procedure-1', title: 'Approved inspection workflow', reason: 'It matches your request and the cited source.' }],
              }} />
              <LocationProbe />
            </>
          } />
          <Route path="/app/guided-workflows" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /start or resume/i }));
    });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/app/guided-workflows?run_id=run-123'));
    expect(post).toHaveBeenCalledWith('/assistant/handoffs/workflow/procedure-1/start', {
      conversation_id: 'conversation-1', message_id: 'assistant-message-1',
    });
  });
});
