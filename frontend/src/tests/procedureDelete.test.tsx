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

describe('procedure step removal', () => {
  beforeEach(() => {
    apiMock.get.mockReset(); apiMock.post.mockReset(); apiMock.delete.mockReset();
    apiMock.get.mockResolvedValue([]);
    machineQueryMock.useMachines.mockReturnValue({
      data: { items: [{ id: 'machine-cnc', name: 'CNC Machine', code: 'CNC-001', status: 'ACTIVE' }] },
      isLoading: false,
      isError: false,
    });
  });

  it('requires confirmation before removing a step and preserves it on cancel', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ProcedureCreatePage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Add First Step' }));
    await user.type(screen.getByLabelText('Step title'), 'Step 1 To Remove');

    await user.click(screen.getByRole('button', { name: 'Remove Step 1' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove this procedure step?');

    await user.click(screen.getByRole('button', { name: 'Keep step' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Step 1 To Remove')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Step 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove step' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Step 1 To Remove')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add First Step' })).toBeInTheDocument();
  });
});
