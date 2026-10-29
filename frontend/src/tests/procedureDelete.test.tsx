import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProcedureCreatePage } from '../features/knowledge/ProcedureCreatePage';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
const machineQueryMock = vi.hoisted(() => ({ useMachines: vi.fn() }));
vi.mock('../lib/api/client', () => ({ api: apiMock }));
vi.mock('../features/knowledge-capture/hooks', () => ({ useMachines: machineQueryMock.useMachines }));

const draft = { id: 'draft-1', title: 'CNC setup draft', description: 'Setup checklist', machine_id: 'machine-cnc', machine_name: 'CNC Machine', status: 'DRAFT', steps: [{ id: 'step-1', title: 'Step 1', instruction: 'Check chuck.' }] };

describe('procedure draft deletion', () => {
  beforeEach(() => {
    apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.delete.mockReset();
    apiMock.get.mockResolvedValue([draft]);
    machineQueryMock.useMachines.mockReturnValue({
      data: { items: [{ id: 'machine-cnc', name: 'CNC Machine', code: 'CNC-001', status: 'ACTIVE' }] },
      isLoading: false,
      isError: false,
    });
  });

  it('requires confirmation and retains the draft and form state when deletion fails', async () => {
    const user = userEvent.setup();
    apiMock.delete.mockRejectedValueOnce(new Error('Procedure has execution history.'));
    apiMock.delete.mockResolvedValueOnce(undefined);
    render(<MemoryRouter><ProcedureCreatePage /></MemoryRouter>);

    expect(await screen.findByText('CNC setup draft')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Procedure title'), 'Unsaved next procedure');
    await user.click(screen.getByRole('button', { name: 'Delete draft' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Linked knowledge files remain independently available.');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiMock.delete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete draft' }));
    await user.click(screen.getByRole('button', { name: 'Delete procedure' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Procedure has execution history.');
    expect(screen.getByText('CNC setup draft')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Procedure title')).toHaveValue('Unsaved next procedure');

    await user.click(screen.getByRole('button', { name: 'Delete procedure' }));
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/procedures/draft-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('deleted.');
    expect(screen.queryByText('CNC setup draft')).not.toBeInTheDocument();
  });
});
