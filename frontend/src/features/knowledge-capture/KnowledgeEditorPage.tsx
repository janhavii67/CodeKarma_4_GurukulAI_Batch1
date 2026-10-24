import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  History,
  RefreshCw,
  Save,
  AlertTriangle,
  CheckCircle,
  Lock,
  Info,
  GitBranch,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  useKnowledgeDetail,
  useUpdateKnowledge,
  useVersionList,
  useCreateRevision,
} from './hooks';
import { StepEditor } from './StepEditor';
import { StatusBadge } from './StatusBadge';
import { MediaPanel } from './media/MediaPanel';
import { Button } from '../../components/ui/Button';
import { ApiClientError } from '../../lib/api/client';
import type { Step, KnowledgeVersion } from './types';
import { isEditableStatus } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TA_BASE =
  'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 resize-none transition-colors';

const INPUT_BASE =
  'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-colors';

const FROZEN_INPUT =
  'w-full bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2.5 text-sm text-slate-300 cursor-not-allowed select-none';

const Label: React.FC<{ htmlFor?: string; children: React.ReactNode; optional?: boolean }> = ({
  htmlFor,
  children,
  optional,
}) => (
  <label
    htmlFor={htmlFor}
    className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
  >
    {children}
    {optional && <span className="ml-1 text-slate-500 normal-case font-normal">(optional)</span>}
  </label>
);

// ─── Version Switcher ─────────────────────────────────────────────────────────

interface VersionSwitcherProps {
  itemId: string;
  currentVersionId: string;
  onSwitch: (versionId: string) => void;
  hasUnsaved: boolean;
}

const VersionSwitcher: React.FC<VersionSwitcherProps> = ({
  itemId,
  currentVersionId,
  onSwitch,
  hasUnsaved,
}) => {
  const { data: versions = [], isLoading } = useVersionList(itemId);

  if (isLoading || versions.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <History className="w-4 h-4 text-slate-500 shrink-0" />
      <select
        id="version-switcher"
        value={currentVersionId}
        onChange={(e) => {
          if (hasUnsaved) {
            const ok = window.confirm(
              'You have unsaved changes. Switching versions will discard them. Continue?'
            );
            if (!ok) return;
          }
          onSwitch(e.target.value);
        }}
        className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
        aria-label="Switch version"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version_no} — {v.status}{' '}
            {v.id === currentVersionId ? '(current)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
};

// ─── Revision Dialog ──────────────────────────────────────────────────────────

interface RevisionDialogProps {
  itemId: string;
  onClose: () => void;
  onCreated: (newVersion: KnowledgeVersion) => void;
}

const RevisionDialog: React.FC<RevisionDialogProps> = ({ itemId, onClose, onCreated }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateRevision(itemId);

  const handleSubmit = async () => {
    setError(null);
    if (!reason.trim()) {
      setError('Revision reason is required.');
      return;
    }
    try {
      const newVersion = await mutation.mutateAsync({ revision_reason: reason.trim() });
      onCreated(newVersion);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create revision.');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revision-dialog-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-5">
        <div>
          <h2 id="revision-dialog-title" className="text-lg font-bold text-slate-100">
            Create New Revision
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            A new draft will be created from the current published version.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}

        <div>
          <Label htmlFor="revision-reason">Revision Reason</Label>
          <textarea
            id="revision-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe why you're creating a new revision…"
            maxLength={2000}
            rows={4}
            className={TA_BASE}
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            id="confirm-revision-btn"
            variant="primary"
            className="flex-1"
            isLoading={mutation.isPending}
            onClick={handleSubmit}
          >
            Create Draft
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Editor Page ─────────────────────────────────────────────────────────

export const KnowledgeEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();

  const versionIdParam = searchParams.get('version_id') ?? undefined;

  // Fetch item detail (selected or default version)
  const { data, isLoading, isError, error } = useKnowledgeDetail(
    id!,
    versionIdParam
  );

  // Local editable state
  const [localTitle, setLocalTitle] = useState('');
  const [localSummary, setLocalSummary] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localSteps, setLocalSteps] = useState<Step[]>([]);
  const [localRevisionReason, setLocalRevisionReason] = useState('');

  // UX state
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);

  const updateMutation = useUpdateKnowledge(id!);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise local state from fetched data
  useEffect(() => {
    if (!data) return;
    const v = data.version;
    setLocalTitle(data.title);
    setLocalSummary(v.summary ?? '');
    setLocalDescription(v.description ?? '');
    setLocalSteps(v.steps ?? []);
    setLocalRevisionReason(v.revision_reason ?? '');
    setIsDirty(false);
    setSaveStatus('idle');
    setSaveError(null);
  }, [data]);

  // Unsaved changes: browser unload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Determine editability
  const version = data?.version;
  const canCreate = hasPermission('knowledge.create');
  const isAuthor = version?.created_by === user?.id;
  const editableStatus = version ? isEditableStatus(version.status) : false;
  const isEditable = canCreate && isAuthor && editableStatus;
  const isFrozen = !!version && !editableStatus;

  // Mark dirty on any field change
  const markDirty = () => setIsDirty(true);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTitle(e.target.value);
    markDirty();
  };
  const handleSummaryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalSummary(e.target.value);
    markDirty();
  };
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalDescription(e.target.value);
    markDirty();
  };
  const handleRevisionReasonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalRevisionReason(e.target.value);
    markDirty();
  };
  const handleStepsChange = (steps: Step[]) => {
    setLocalSteps(steps);
    markDirty();
  };

  const handleSave = async () => {
    if (!version || !isEditable) return;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await updateMutation.mutateAsync({
        title: localTitle.trim() || undefined,
        summary: localSummary.trim() || null,
        description: localDescription.trim() || null,
        steps: localSteps,
        revision_reason: localRevisionReason.trim() || null,
        version_id: version.id,
      });
      setIsDirty(false);
      setSaveStatus('saved');
      // Reset saved indicator after 3s
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof ApiClientError ? err.message : 'Save failed.');
    }
  };

  // Keyboard shortcut: Ctrl+S / Cmd+S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isEditable && isDirty) handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  });

  const handleVersionSwitch = (newVersionId: string) => {
    setSearchParams(newVersionId ? { version_id: newVersionId } : {});
    setIsDirty(false);
  };

  const handleRevisionCreated = (newVersion: KnowledgeVersion) => {
    setShowRevisionDialog(false);
    // Navigate to the new draft
    setSearchParams({ version_id: newVersion.id });
  };

  // ── Error / Not Found ────────────────────────────────────────────────────

  if (isError) {
    const is404 = error instanceof ApiClientError && error.status === 404;
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-400" />
        <h2 className="text-xl font-semibold text-slate-200">
          {is404 ? 'Not Found' : 'Something went wrong'}
        </h2>
        <p className="text-slate-400 text-sm text-center max-w-sm">
          {is404
            ? 'This knowledge item does not exist or is not accessible to you.'
            : error instanceof ApiClientError
            ? error.message
            : 'An unexpected error occurred.'}
        </p>
        <Button variant="outline" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/app/knowledge')}>
          Back to Library
        </Button>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading || !data) {
    return (
      <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading knowledge item">
        <div className="h-8 w-64 bg-slate-800 rounded-lg" />
        <div className="h-48 bg-slate-800 rounded-xl" />
        <div className="h-32 bg-slate-800 rounded-xl" />
      </div>
    );
  }

  const v = data.version;
  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Breadcrumb + actions row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/app/knowledge')}
            className="mt-0.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Back to library"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100 leading-tight">
              {data.title}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={v.status} />
              <span className="text-xs text-slate-500 font-mono">v{v.version_no}</span>
              {data.machine && (
                <span className="text-xs text-slate-500">{data.machine.name}</span>
              )}
              {data.is_demo && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 bg-sky-500/10 border border-sky-500/30 rounded-full px-2 py-0.5">
                  Demo
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <VersionSwitcher
            itemId={id!}
            currentVersionId={v.id}
            onSwitch={handleVersionSwitch}
            hasUnsaved={isDirty}
          />

          {/* Create revision (only if current version is published and user can write) */}
          {canCreate && v.status === 'published' && (
            <Button
              variant="secondary"
              size="sm"
              icon={<GitBranch className="w-4 h-4" />}
              onClick={() => setShowRevisionDialog(true)}
              id="create-revision-btn"
            >
              New Revision
            </Button>
          )}

          {/* Save */}
          {isEditable && (
            <Button
              id="save-knowledge-btn"
              variant="primary"
              size="sm"
              isLoading={saveStatus === 'saving'}
              disabled={!isDirty || saveStatus === 'saving'}
              icon={
                saveStatus === 'saved' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )
              }
              onClick={handleSave}
              aria-label="Save changes (Ctrl+S)"
            >
              {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {/* Frozen / read-only banner */}
      {isFrozen && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400">
          <Lock className="w-4 h-4 shrink-0 text-slate-500" />
          <span className="text-sm">
            This version is <strong className="text-slate-300">{v.status}</strong> and cannot be
            edited.{' '}
            {v.status === 'published' && canCreate
              ? 'Create a new revision to make changes.'
              : null}
          </span>
        </div>
      )}

      {/* Not-author banner (draft that belongs to someone else — shouldn't normally occur,
          but guards against UI showing editable fields for a version one can't edit) */}
      {!isFrozen && editableStatus && !isAuthor && canCreate && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
          <Info className="w-4 h-4 shrink-0" />
          <span className="text-sm">
            This draft was created by another expert. You can view it but not edit it.
          </span>
        </div>
      )}

      {/* Save error banner */}
      {saveError && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm flex-1">{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="text-rose-400 hover:text-rose-200 transition-colors text-xs">Dismiss</button>
        </div>
      )}

      {/* Submit for Review (Module 06 not implemented — always disabled) */}
      {isEditable && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
          <Info className="w-4 h-4 shrink-0 text-slate-500" />
          <div className="flex-1 text-sm text-slate-400">
            <strong className="text-slate-300">Submit for Review</strong> is unavailable — the
            review &amp; publication workflow (Module 06) has not been implemented yet.
          </div>
          <button
            type="button"
            disabled
            title="Module 06 (Review & Publication) is not yet implemented"
            className="px-3 py-1.5 rounded-lg border border-slate-600/40 text-xs text-slate-600 cursor-not-allowed select-none"
            aria-disabled="true"
          >
            Submit for Review
          </button>
        </div>
      )}

      {/* ── Content form ──────────────────────────────────────────────────── */}

      {/* Metadata panel */}
      <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 p-5 space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Metadata</h2>

        {/* Title */}
        <div>
          <Label htmlFor="item-title">Title</Label>
          {isEditable ? (
            <input
              id="item-title"
              type="text"
              value={localTitle}
              onChange={handleTitleChange}
              maxLength={255}
              className={INPUT_BASE}
            />
          ) : (
            <div className={FROZEN_INPUT}>{data.title}</div>
          )}
        </div>

        {/* Machine */}
        <div>
          <Label>Machine</Label>
          <div className={FROZEN_INPUT}>
            {data.machine ? `${data.machine.name} (${data.machine.code})` : 'No machine linked'}
          </div>
          {isEditable && (
            <p className="text-[11px] text-slate-500 mt-1">
              Machine linkage cannot be changed after creation.
            </p>
          )}
        </div>

        {/* Version metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Origin</span>
            <span className="text-slate-300 font-medium capitalize">{v.origin.replace('_', ' ')}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Created</span>
            <span className="text-slate-300 font-medium">{formatDate(v.created_at)}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Last Updated</span>
            <span className="text-slate-300 font-medium">{formatDate(v.updated_at)}</span>
          </div>
          {v.published_at && (
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Published</span>
              <span className="text-slate-300 font-medium">{formatDate(v.published_at)}</span>
            </div>
          )}
          {v.submitted_at && (
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Submitted</span>
              <span className="text-slate-300 font-medium">{formatDate(v.submitted_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 p-5 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Summary</h2>
        {isEditable ? (
          <textarea
            id="version-summary"
            value={localSummary}
            onChange={handleSummaryChange}
            placeholder="Brief summary of this procedure (shown in the library list)…"
            maxLength={10000}
            rows={3}
            className={TA_BASE}
          />
        ) : (
          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
            {v.summary || <span className="text-slate-500 italic">No summary provided.</span>}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 p-5 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Description</h2>
        {isEditable ? (
          <textarea
            id="version-description"
            value={localDescription}
            onChange={handleDescriptionChange}
            placeholder="Full procedure description, background context, prerequisites…"
            maxLength={10000}
            rows={5}
            className={TA_BASE}
          />
        ) : (
          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
            {v.description || <span className="text-slate-500 italic">No description provided.</span>}
          </p>
        )}
      </div>

      {/* Revision Reason */}
      {(isEditable || localRevisionReason) && (
        <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Revision Reason
          </h2>
          {isEditable ? (
            <textarea
              id="revision-reason-field"
              value={localRevisionReason}
              onChange={handleRevisionReasonChange}
              placeholder="Why is this version being created or updated?…"
              maxLength={2000}
              rows={2}
              className={TA_BASE}
            />
          ) : (
            <p className="text-sm text-slate-300 whitespace-pre-wrap">
              {v.revision_reason || <span className="text-slate-500 italic">Not specified.</span>}
            </p>
          )}
        </div>
      )}

      {/* Steps */}
      <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 p-5">
        <StepEditor
          steps={isEditable ? localSteps : v.steps}
          isReadOnly={!isEditable}
          onChange={handleStepsChange}
        />
      </div>

      {/* Media panel (T2.4) */}
      <MediaPanel
        key={v.id}
        versionId={v.id}
        canEdit={isEditable}
        versionNo={v.version_no}
      />

      {/* Floating unsaved changes indicator */}
      {isDirty && (
        <div
          className="fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 bg-slate-800 border border-brand-500/40 rounded-xl shadow-2xl shadow-brand-500/10 text-sm z-40 animate-in fade-in slide-in-from-bottom-2"
          role="status"
          aria-live="polite"
        >
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-slate-300">Unsaved changes</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="px-3 py-1 rounded-lg bg-brand-500 hover:bg-brand-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              if (!data) return;
              setLocalTitle(data.title);
              setLocalSummary(data.version.summary ?? '');
              setLocalDescription(data.version.description ?? '');
              setLocalSteps(data.version.steps ?? []);
              setLocalRevisionReason(data.version.revision_reason ?? '');
              setIsDirty(false);
            }}
            className="p-1 rounded text-slate-500 hover:text-slate-200 transition-colors"
            aria-label="Discard changes"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Revision Dialog */}
      {showRevisionDialog && (
        <RevisionDialog
          itemId={id!}
          onClose={() => setShowRevisionDialog(false)}
          onCreated={handleRevisionCreated}
        />
      )}
    </div>
  );
};
