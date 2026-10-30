import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TroubleshootingWorkspacePage } from '../features/decision-trees/TroubleshootingWorkspacePage';

const authState = vi.hoisted(() => ({
  role: 'EXPERT',
  permissions: ['knowledge.create', 'troubleshoot.use'] as string[],
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { role_id: authState.role },
    hasPermission: (permission: string) => authState.permissions.includes(permission),
  }),
}));

vi.mock('../features/decision-trees/DecisionTreesPage', () => ({
  DecisionTreesPage: () => <div>Decision tree library content</div>,
}));

vi.mock('../features/decision-trees/trainee/TroubleshootHubPage', () => ({
  TroubleshootHubPage: () => <div>Published troubleshooting content</div>,
}));

describe('TroubleshootingWorkspacePage', () => {
  beforeEach(() => {
    authState.role = 'EXPERT';
    authState.permissions = ['knowledge.create', 'troubleshoot.use'];
  });

  it('combines Expert tree management and published-tree use in one workspace', () => {
    render(<TroubleshootingWorkspacePage />);

    expect(screen.getByRole('tab', { name: 'Tree library' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Decision tree library content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Run a tree' }));
    expect(screen.getByRole('tab', { name: 'Run a tree' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Published troubleshooting content')).toBeInTheDocument();
  });

  it('shows trainees the existing troubleshooting hub without Expert tabs', () => {
    authState.role = 'TRAINEE';
    render(<TroubleshootingWorkspacePage />);

    expect(screen.getByText('Published troubleshooting content')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
