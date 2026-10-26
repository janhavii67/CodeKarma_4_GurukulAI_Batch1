import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { SymptomSelectorPlaceholder } from './components/SymptomSelectorPlaceholder';
import { DecisionTreeViewerPlaceholder } from './components/DecisionTreeViewerPlaceholder';
import { EscalationPlaceholder } from './components/EscalationPlaceholder';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Wrench, Plus, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';

export type DemoDisplayState = 'normal' | 'loading' | 'error';

export const TroubleshootingPage: React.FC = () => {
  const { user, hasRole } = useAuth();
  const isExpert = hasRole('EXPERT');

  // Interactive toggle to verify loading, empty, and error states without mock API calls
  const [displayState, setDisplayState] = useState<DemoDisplayState>('normal');

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* 1. Header with Role Awareness */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-sm">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
                  Troubleshooting & Decision Trees
                </h1>
                <Badge variant="warning" size="sm">
                  MODULE 05 · PLACEHOLDER
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Deterministic fault diagnosis and machine alarm resolution trees
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* State Demo Toggle (For UI inspection & testing) */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setDisplayState('normal')}
              className={`px-2.5 py-1 rounded transition-colors ${
                displayState === 'normal'
                  ? 'bg-slate-800 text-slate-100 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Empty State
            </button>
            <button
              type="button"
              onClick={() => setDisplayState('loading')}
              className={`px-2.5 py-1 rounded transition-colors ${
                displayState === 'loading'
                  ? 'bg-slate-800 text-slate-100 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Loading State
            </button>
            <button
              type="button"
              onClick={() => setDisplayState('error')}
              className={`px-2.5 py-1 rounded transition-colors ${
                displayState === 'error'
                  ? 'bg-slate-800 text-slate-100 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Error State
            </button>
          </div>

          {/* Expert-only Create Guide button (Disabled Placeholder) */}
          {isExpert && (
            <Button
              variant="primary"
              disabled
              className="opacity-60 cursor-not-allowed flex items-center gap-1.5 text-xs"
              aria-disabled="true"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Guide (Placeholder)</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Mandatory Banner */}
      <Alert
        variant="warning"
        title="Planned Feature (Phase 4)"
        className="border-amber-500/30 bg-amber-950/20 text-amber-200"
      >
        <span>
          <strong>Planned feature. No approved troubleshooting guides exist yet.</strong>{' '}
          In production, decision trees run on a deterministic application rule engine with zero LLM branch selection.
        </span>
      </Alert>

      {/* 3. Conditional States: Loading, Error, or Main Empty Placeholder */}
      {displayState === 'loading' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-16 flex flex-col items-center justify-center text-center">
          <LoadingSpinner size="lg" message="Loading approved troubleshooting guide version..." />
          <p className="text-xs text-slate-400 mt-2 font-mono">
            [PLACEHOLDER LOADING STATE DEMONSTRATION]
          </p>
        </div>
      )}

      {displayState === 'error' && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-rose-300">
            Guide Retrieval Failed
          </h3>
          <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            The requested troubleshooting guide version could not be resolved or was revoked. Please verify the machine ID or escalate to a senior technician.
          </p>
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDisplayState('normal')}
              className="text-xs flex items-center gap-1.5 mx-auto border-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset State</span>
            </Button>
          </div>
        </div>
      )}

      {displayState === 'normal' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Symptom Selector & Escalation */}
          <div className="space-y-6 lg:col-span-1">
            <SymptomSelectorPlaceholder disabled={true} />
            <EscalationPlaceholder />
          </div>

          {/* Right Column: Decision Tree Viewer Canvas */}
          <div className="lg:col-span-2">
            <DecisionTreeViewerPlaceholder />
          </div>
        </div>
      )}

      {/* 4. Non-Negotiable Safety Invariants Footer */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-[11px] text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Safety Invariant:</strong> Only published, approved guide versions start sessions. Stop & escalation nodes are strictly enforced by backend verification.
          </span>
        </div>
        <div className="text-[10px] font-mono text-slate-400 shrink-0">
          User Role: <span className="text-slate-300">{user?.role_id || 'TRAINEE'}</span>
        </div>
      </div>
    </div>
  );
};
