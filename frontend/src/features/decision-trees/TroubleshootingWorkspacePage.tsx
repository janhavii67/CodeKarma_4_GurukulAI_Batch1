import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { DecisionTreesPage } from './DecisionTreesPage';
import { TroubleshootHubPage } from './trainee/TroubleshootHubPage';

type WorkspaceView = 'library' | 'run';

/** Gives Experts one Troubleshooting destination for tree authoring and interactive runs. */
export const TroubleshootingWorkspacePage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const canManageTrees = hasPermission('knowledge.create');
  const canRunTroubleshooting = hasPermission('troubleshoot.use');
  const [view, setView] = useState<WorkspaceView>(canManageTrees ? 'library' : 'run');

  if (user?.role_id !== 'EXPERT') return <TroubleshootHubPage />;

  const activeView = canManageTrees ? view : 'run';

  return (
    <>
      <div className="mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="px-2">
          <p className="text-sm font-bold text-slate-900">Troubleshooting workspace</p>
          <p className="mt-0.5 text-xs text-slate-500">Manage expert trees or run a published guide.</p>
        </div>
        <div role="tablist" aria-label="Troubleshooting workspace views" className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {canManageTrees && <button
            id="troubleshooting-tree-library-tab"
            role="tab"
            type="button"
            aria-selected={activeView === 'library'}
            aria-controls="troubleshooting-workspace-panel"
            onClick={() => setView('library')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${activeView === 'library' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >Tree library</button>}
          {canRunTroubleshooting && <button
            id="troubleshooting-run-tab"
            role="tab"
            type="button"
            aria-selected={activeView === 'run'}
            aria-controls="troubleshooting-workspace-panel"
            onClick={() => setView('run')}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${activeView === 'run' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >Run a tree</button>}
        </div>
      </div>
      <section id="troubleshooting-workspace-panel" role="tabpanel" aria-labelledby={activeView === 'library' ? 'troubleshooting-tree-library-tab' : 'troubleshooting-run-tab'}>
        {activeView === 'library' && canManageTrees ? <DecisionTreesPage /> : <TroubleshootHubPage />}
      </section>
    </>
  );
};
