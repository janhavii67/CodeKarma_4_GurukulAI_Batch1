import React from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  Save,
  SendHorizonal,
  CheckCircle,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { StatusBadge } from '../StatusBadge';
import { Button } from '../../../components/ui/Button';
import type { VersionStatus } from '../types';
import type { EditorMode } from './deriveEditorMode';

export type SaveStatusState = 'idle' | 'saving' | 'saved' | 'dirty' | 'error';

export type WorkspaceTab =
  | 'overview'
  | 'audio'
  | 'video'
  | 'images'
  | 'documents'
  | 'procedure';

const TAB_LABELS: Record<WorkspaceTab, string> = {
  overview: 'Overview',
  audio: 'Audio',
  video: 'Video',
  images: 'Images',
  documents: 'Documents',
  procedure: 'Procedure Builder',
};

const ALL_TABS: WorkspaceTab[] = [
  'overview',
  'audio',
  'video',
  'images',
  'documents',
  'procedure',
];

interface TabCounts {
  audio: number | null;
  video: number | null;
  images: number | null;
  documents: number | null;
  procedure: number | null;
}

interface RecordHeaderProps {
  /** Item title from saved server data (not live-typed) */
  savedTitle: string;
  itemId: string;
  versionStatus: VersionStatus;
  versionNo: number;
  isDemo: boolean;
  machineName: string | null;
  /** Author display name (from server) */
  authorName?: string | null;
  mode: EditorMode;
  saveStatus: SaveStatusState;
  savedAt: string | null;
  saveError: string | null;
  activeTab: WorkspaceTab;
  tabCounts: TabCounts;
  /** Whether there are unsaved changes (drives preview label) */
  isDirty: boolean;
  onTabChange: (tab: WorkspaceTab) => void;
  onSave: () => void;
  onPreview: () => void;
}

/** Save status indicator with live region */
const SaveStatusLabel: React.FC<{
  status: SaveStatusState;
  savedAt: string | null;
  error: string | null;
}> = ({ status, savedAt, error }) => {
  let content: React.ReactNode;

  if (status === 'saving') {
    content = (
      <span className="flex items-center gap-1.5 text-blue-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Saving…</span>
      </span>
    );
  } else if (status === 'saved' && savedAt) {
    const t = new Date(savedAt).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    content = (
      <span className="flex items-center gap-1.5 text-emerald-400">
        <CheckCircle className="w-3.5 h-3.5" />
        <span>Saved {t}</span>
      </span>
    );
  } else if (status === 'dirty') {
    content = (
      <span className="flex items-center gap-1.5 text-amber-400">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span>Unsaved changes</span>
      </span>
    );
  } else if (status === 'error') {
    content = (
      <span className="flex items-center gap-1.5 text-rose-400">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>{error ? 'Save failed' : 'Save failed'}</span>
      </span>
    );
  } else if (status === 'idle' && savedAt) {
    const t = new Date(savedAt).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    content = (
      <span className="text-slate-500 text-xs">
        Saved {t}
      </span>
    );
  } else {
    content = null;
  }

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="text-xs min-w-[120px]"
    >
      {content}
    </span>
  );
};

/** Tab pill with count badge */
const TabButton: React.FC<{
  tab: WorkspaceTab;
  isActive: boolean;
  count: number | null;
  onClick: () => void;
  id: string;
  panelId: string;
}> = ({ tab, isActive, count, onClick, id, panelId }) => (
  <button
    type="button"
    role="tab"
    id={id}
    aria-selected={isActive}
    aria-controls={panelId}
    tabIndex={isActive ? 0 : -1}
    onClick={onClick}
    className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap rounded-t-lg border-b-2 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
      isActive
        ? 'border-blue-500 text-blue-300 bg-blue-500/8'
        : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
    }`}
  >
    <span>{TAB_LABELS[tab]}</span>
    {count !== null && count >= 0 && (
      <span
        className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold ${
          isActive
            ? 'bg-blue-500/25 text-blue-300'
            : 'bg-slate-700 text-slate-400'
        }`}
        aria-label={`${count} items`}
      >
        {count}
      </span>
    )}
  </button>
);

export const RecordHeader: React.FC<RecordHeaderProps> = ({
  savedTitle,
  itemId: _itemId,
  versionStatus,
  versionNo,
  isDemo,
  mode,
  saveStatus,
  savedAt,
  saveError,
  activeTab,
  tabCounts,
  isDirty,
  onTabChange,
  onSave,
  onPreview,
}) => {
  const isEditable = mode === 'editable';
  const isTrainee = mode === 'trainee';

  // Compute save-disabled state
  const saveDisabled =
    !isDirty ||
    saveStatus === 'saving' ||
    !isEditable;

  // Breadcrumb based on status
  const libraryHref = '/app/knowledge';
  const myDraftsHref = '/app/knowledge?status=draft';
  const isMyDraftsContext =
    versionStatus === 'draft' || versionStatus === 'changes_requested';

  // Keyboard navigation for tabs
  const handleTabKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % ALL_TABS.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + ALL_TABS.length) % ALL_TABS.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = ALL_TABS.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    onTabChange(ALL_TABS[nextIndex]);
    // Focus the next tab button
    const nextId = `tab-${ALL_TABS[nextIndex]}`;
    setTimeout(() => {
      document.getElementById(nextId)?.focus();
    }, 0);
  };

  // Submit for review description (for aria-describedby)
  const submitDescId = 'submit-review-description';

  return (
    <div
      className="sticky top-0 z-20 bg-[#0D1426] border-b border-[#22304D]"
      style={{ backdropFilter: 'blur(12px)' }}
    >
      {/* Main header row */}
      <div className="px-4 md:px-6 py-3 space-y-2">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
          <Link
            to={libraryHref}
            className="hover:text-slate-300 transition-colors"
          >
            Knowledge Library
          </Link>
          {!isTrainee && isMyDraftsContext && (
            <>
              <span aria-hidden>/</span>
              <Link
                to={myDraftsHref}
                className="hover:text-slate-300 transition-colors"
              >
                My Drafts
              </Link>
            </>
          )}
          <span aria-hidden>/</span>
          <span className="text-slate-400 truncate max-w-[200px]" aria-current="page">
            {savedTitle || 'Untitled'}
          </span>
        </nav>

        {/* Title row + actions */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Left: Title + badges */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h1
              className="text-lg font-bold text-slate-100 truncate leading-tight"
              title={savedTitle}
            >
              {savedTitle || 'Untitled'}
            </h1>
            {isTrainee ? (
              <span className="shrink-0 text-xs font-medium text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full">
                Approved version {versionNo}
              </span>
            ) : (
              <StatusBadge status={versionStatus} />
            )}
            <span className="shrink-0 text-xs font-mono text-slate-500">v{versionNo}</span>
            {isDemo && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 border border-sky-500/30 rounded-full px-2 py-0.5">
                Demonstration data
              </span>
            )}
          </div>

          {/* Right: Save status + actions */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {/* Save status */}
            {!isTrainee && (
              <SaveStatusLabel
                status={saveStatus}
                savedAt={savedAt}
                error={saveError}
              />
            )}

            {/* Preview button */}
            {!isTrainee && (
              <Button
                id="preview-btn"
                variant="outline"
                size="sm"
                icon={<Eye className="w-3.5 h-3.5" />}
                onClick={onPreview}
              >
                {isDirty ? 'Preview (unsaved)' : 'Preview'}
              </Button>
            )}

            {/* Save Draft */}
            {isEditable && (
              <Button
                id="save-draft-btn"
                variant="primary"
                size="sm"
                isLoading={saveStatus === 'saving'}
                disabled={saveDisabled}
                icon={<Save className="w-3.5 h-3.5" />}
                onClick={onSave}
                aria-label="Save Draft (Ctrl+S)"
                className="bg-blue-600 hover:bg-blue-500 text-white border-blue-500/30"
              >
                {saveStatus === 'saving' ? 'Saving…' : 'Save Draft'}
              </Button>
            )}

            {/* Submit for Review — always disabled */}
            {isEditable && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  aria-describedby={submitDescId}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/40 text-xs font-medium text-slate-600 cursor-not-allowed select-none"
                  id="submit-review-btn"
                >
                  <SendHorizonal className="w-3.5 h-3.5" />
                  Submit for Review
                </button>
                <span id={submitDescId} className="sr-only">
                  Review workflow (Module 06) isn't available yet.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* "Review workflow not available" note — visible hint for users */}
        {isEditable && (
          <p
            className="text-[11px] text-slate-500 flex items-center gap-1"
          >
            <Info className="w-3 h-3 shrink-0" />
            Review workflow (Module 06) isn't available yet.
          </p>
        )}
      </div>

      {/* Tab bar */}
      <div
        className="px-4 md:px-6 overflow-x-auto scrollbar-none"
        role="tablist"
        aria-label="Workspace sections"
        onKeyDown={(e) => {
          const currentIndex = ALL_TABS.indexOf(activeTab);
          handleTabKeyDown(e as React.KeyboardEvent, currentIndex);
        }}
      >
        <div className="flex items-end gap-0 min-w-max border-b border-transparent">
          {ALL_TABS.map((tab) => {
            const count =
              tab === 'audio'
                ? tabCounts.audio
                : tab === 'video'
                ? tabCounts.video
                : tab === 'images'
                ? tabCounts.images
                : tab === 'documents'
                ? tabCounts.documents
                : tab === 'procedure'
                ? tabCounts.procedure
                : null;

            return (
              <TabButton
                key={tab}
                tab={tab}
                isActive={activeTab === tab}
                count={count}
                onClick={() => onTabChange(tab)}
                id={`tab-${tab}`}
                panelId={`tabpanel-${tab}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
