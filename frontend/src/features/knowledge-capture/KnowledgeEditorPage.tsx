import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Cpu,
  User,
  Info,
  Lock,
  AlertTriangle,
  GitBranch,
  ShieldCheck,
  ListChecks,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  useKnowledgeDetail,
  useUpdateKnowledge,
  useVersionList,
  useCreateRevision,
  useMachines,
  useCreateKnowledge,
  useSubmitKnowledgeForReview,
} from './hooks';
import { StepEditor } from './StepEditor';
import { MediaPanel } from './media/MediaPanel';
import { Button } from '../../components/ui/Button';
import { ApiClientError } from '../../lib/api/client';
import type { Step, KnowledgeVersion } from './types';
import { isEditableStatus } from './types';
import { MedicalHeroBanner } from './components/MedicalHeroBanner';
import { DraftStatusBar } from './components/DraftStatusBar';

// ─── Version Switcher Component ───────────────────────────────────────────────

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
  const { data: versions, isLoading } = useVersionList(itemId);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  if (isLoading || !versions || versions.length <= 1) return null;

  const current = versions.find((v) => v.id === currentVersionId);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#BCD7F5] bg-white hover:bg-[#F7FAFE] text-xs font-semibold text-[#1473E6] shadow-xs transition-colors"
        aria-label="Switch version"
        aria-expanded={open}
      >
        <GitBranch className="w-3.5 h-3.5" />
        <span>v{current?.version_no ?? '—'}</span>
        <ChevronDown className="w-3 h-3 text-[#536780]" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white rounded-xl shadow-lg border border-[#DCE8F5] py-1 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs">
          <div className="px-3 py-1.5 border-b border-[#DCE8F5] font-semibold text-[10px] uppercase tracking-wider text-[#536780]">
            Version History
          </div>
          {versions.map((ver) => (
            <button
              key={ver.id}
              type="button"
              onClick={() => {
                if (hasUnsaved && !window.confirm('You have unsaved changes. Switch version anyway?')) {
                  return;
                }
                setOpen(false);
                onSwitch(ver.id);
              }}
              className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                ver.id === currentVersionId
                  ? 'bg-[#EFF7FF] text-[#1473E6] font-bold'
                  : 'text-[#12345A] hover:bg-[#F7FAFE]'
              }`}
            >
              <span>v{ver.version_no} ({ver.status.replace('_', ' ')})</span>
              {ver.id === currentVersionId && <span className="text-[10px] text-[#1473E6]">Active</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Revision Modal Component ─────────────────────────────────────────────────

const CreateRevisionDialog: React.FC<{
  isOpen: boolean;
  itemId: string;
  sourceVersionNo: number;
  onClose: () => void;
  onCreated: (v: KnowledgeVersion) => void;
}> = ({ isOpen, itemId, sourceVersionNo, onClose, onCreated }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateRevision(itemId);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const v = await mutation.mutateAsync({ revision_reason: reason.trim() || 'New revision' });
      onCreated(v);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create revision.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#DCE8F5] shadow-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-[#12345A]">Create New Revision</h3>
        <p className="text-xs text-[#536780]">
          Create a new editable draft derived from published <strong>v{sourceVersionNo}</strong>.
          The published procedure will remain active until the new revision is peer-reviewed.
        </p>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#12345A] mb-1">
              Revision Reason <span className="text-[#8FA0BF] font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Updated tolerance parameters and added emergency stop guidance…"
              rows={3}
              className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2.5 text-xs text-[#12345A] focus:border-[#1473E6] focus:ring-2 focus:ring-[#1473E6]/20 outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[#BCD7F5] bg-white text-xs font-semibold text-[#536780] hover:bg-[#F7FAFE]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-1.5 rounded-lg bg-[#1473E6] hover:bg-[#1060C4] text-white text-xs font-semibold shadow-xs disabled:opacity-50"
            >
              {mutation.isPending ? 'Creating…' : 'Create Draft Revision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main KnowledgeEditorPage ─────────────────────────────────────────────────

export const KnowledgeEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { data: machinesData } = useMachines();
  const machines = machinesData?.items ?? [];

  const isNewRoute = !id || id === 'new';
  const captureKind = searchParams.get('capture') ?? undefined;
  const versionIdParam = searchParams.get('version_id') ?? undefined;

  // New Draft Creation Modal State (if accessing /app/knowledge/new)
  const [newTitle, setNewTitle] = useState('');
  const [newMachineId, setNewMachineId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const createMutation = useCreateKnowledge();
  const submitReviewMutation = useSubmitKnowledgeForReview(id || '');

  // Fetch item detail if an ID exists
  const { data, isLoading, isError, error } = useKnowledgeDetail(
    isNewRoute ? '' : id!,
    versionIdParam
  );

  // Local editable state
  const [localTitle, setLocalTitle] = useState('');
  const [localSummary, setLocalSummary] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localSteps, setLocalSteps] = useState<Step[]>([]);
  const [localRevisionReason, setLocalRevisionReason] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [showDetailsSection, setShowDetailsSection] = useState(false);

  // UX state
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const updateMutation = useUpdateKnowledge(id || '');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populate state on data load
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

  useEffect(() => {
    if (captureKind === 'notes' && data) setShowDetailsSection(true);
    if (captureKind && data && captureKind !== 'notes') {
      window.setTimeout(() => document.getElementById('media-evidence')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }
  }, [captureKind, data]);

  // Handle new creation submission
  const handleCreateNew = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError('Title is required.');
      return;
    }
    try {
      const res = await createMutation.mutateAsync({
        title: newTitle.trim(),
        machine_id: newMachineId || null,
      });
      setShowCreateModal(false);
      navigate(`/app/knowledge/${res.id}${captureKind ? `?capture=${encodeURIComponent(captureKind)}` : ''}`);
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : 'Creation failed.');
    }
  };

  // Browser unload guard
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
  const canSubmitReview = hasPermission('knowledge.submit_review') && isAuthor && editableStatus;
  const isFrozen = !!version && !editableStatus;

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
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof ApiClientError ? err.message : 'Save failed.');
    }
  };

  const handleSubmitReview = async () => {
    if (!canSubmitReview || !version) return;
    setSubmitError(null);
    try {
      if (isDirty) {
        if (!localTitle.trim()) { setSubmitError('Add a title before submitting for review.'); return; }
        await updateMutation.mutateAsync({
          title: localTitle.trim(), summary: localSummary.trim() || null,
          description: localDescription.trim() || null, steps: localSteps,
          revision_reason: localRevisionReason.trim() || null, version_id: version.id,
        });
        setIsDirty(false);
      }
      await submitReviewMutation.mutateAsync();
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : 'Could not submit this draft for review.');
    }
  };

  // Keyboard shortcut: Ctrl+S
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
    setSearchParams({ version_id: newVersion.id });
  };

  // ─── If on /app/knowledge/new directly: Render Fast Creation Interface ──
  if (isNewRoute) {
    return (
      <div className="min-h-screen bg-[#F7FAFE] text-[#12345A] font-sans">
        <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <MedicalHeroBanner onCreateClick={() => setShowCreateModal(true)} />
          
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-[#DCE8F5] shadow-sm p-6 sm:p-8 space-y-6">
            <div className="border-b border-[#DCE8F5] pb-4">
              <h2 className="text-xl font-bold text-[#12345A]">Start a knowledge draft</h2>
              <p className="text-xs text-[#536780] mt-1">
                Give this practical knowledge a title and link it to the relevant machine.
              </p>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateNew} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#536780] mb-1.5">
                  Knowledge Title *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Diagnostic Analyzer Calibration"
                  className="w-full bg-white border border-[#DCE8F5] rounded-lg px-3.5 py-2.5 text-sm text-[#12345A] focus:border-[#1473E6] focus:ring-2 focus:ring-[#1473E6]/20 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#536780] mb-1.5">
                  Select Machine Asset (optional)
                </label>
                <select
                  value={newMachineId}
                  onChange={(e) => setNewMachineId(e.target.value)}
                  className="w-full bg-white border border-[#DCE8F5] rounded-lg px-3.5 py-2.5 text-sm text-[#12345A] focus:border-[#1473E6] focus:ring-2 focus:ring-[#1473E6]/20 outline-none"
                >
                  <option value="">Select equipment…</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#536780] mt-1">
                  Link this knowledge to registered equipment when relevant.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DCE8F5]">
                <button
                  type="button"
                  onClick={() => navigate('/app/knowledge')}
                  className="px-4 py-2 rounded-lg border border-[#BCD7F5] bg-white text-xs font-semibold text-[#536780] hover:bg-[#F7FAFE]"
                >
                  Back to Library
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 rounded-lg bg-[#1473E6] hover:bg-[#1060C4] text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Initializing…' : '+ Start Documenting'}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ─── 404 / Error State ───────────────────────────────────────────────────────
  if (isError) {
    const is404 = error instanceof ApiClientError && error.status === 404;
    return (
      <div className="min-h-screen bg-[#F7FAFE] text-[#12345A] font-sans">
        <div className="max-w-md mx-auto py-24 text-center space-y-4 px-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#12345A]">
            {is404 ? 'Not Found' : 'Something went wrong'}
          </h2>
          <p className="text-[#536780] text-sm leading-relaxed">
            {is404
              ? 'This knowledge item does not exist or is not accessible to you.'
              : error instanceof ApiClientError
              ? error.message
              : 'An unexpected error occurred while loading this procedure.'}
          </p>
          <Button
            variant="outline"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate('/app/knowledge')}
            className="border-[#BCD7F5] text-[#1473E6] bg-white hover:bg-[#F7FAFE]"
          >
            Back to Library
          </Button>
        </div>
      </div>
    );
  }

  // ─── Loading Skeleton State ──────────────────────────────────────────────────
  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-[#F7FAFE] text-[#12345A] font-sans" aria-busy="true" aria-label="Loading knowledge item">
        <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="h-44 rounded-2xl bg-white border border-[#DCE8F5] animate-pulse" />
          <div className="h-14 rounded-xl bg-white border border-[#DCE8F5] animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3 h-80 rounded-2xl bg-white border border-[#DCE8F5] animate-pulse" />
            <div className="lg:col-span-5 space-y-6">
              <div className="h-48 rounded-2xl bg-white border border-[#DCE8F5] animate-pulse" />
              <div className="h-56 rounded-2xl bg-white border border-[#DCE8F5] animate-pulse" />
            </div>
            <div className="lg:col-span-4 h-96 rounded-2xl bg-white border border-[#DCE8F5] animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  const v = data.version;
  const machineName = data.machine ? `${data.machine.name} (${data.machine.code})` : 'No equipment linked';
  const originDisplay = v.origin ? `${v.origin.replace('_', ' ')} Draft` : 'Expert Draft';

  return (
    <div className="min-h-screen bg-[#F7FAFE] text-[#12345A] font-sans">
      {/* 1. TOP NAVIGATION */}

      {/* Main Container */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 2. MEDICAL HERO BANNER */}
        <MedicalHeroBanner onCreateClick={() => setShowCreateModal(true)} />

        {/* Breadcrumb & Procedure Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#536780]">
            <Link to="/app/knowledge" className="hover:text-[#1473E6] transition-colors">
              Library
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-[#12345A]">{data.title}</span>
          </nav>
        </div>

        {/* 3. DRAFT STATUS & SAVE BAR */}
        <DraftStatusBar
          status={v.status}
          versionNo={v.version_no}
          isSaving={saveStatus === 'saving'}
          saveStatus={saveStatus === 'saving' ? 'idle' : saveStatus}
          errorMessage={saveError}
          onSave={handleSave}
          canEdit={isEditable}
          isDirty={isDirty}
          canSubmitReview={canSubmitReview}
          isSubmittingReview={submitReviewMutation.isPending}
          onSubmitReview={handleSubmitReview}
        />
        {submitError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{submitError}</div>}

        {/* Frozen Version Notice Banner (Required by tests) */}
        {isFrozen && (
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 shadow-xs">
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs sm:text-sm">
                This version is <strong className="font-semibold">{v.status}</strong> and cannot be edited.{' '}
                {v.status === 'published' && canCreate
                  ? 'Create a new revision to make changes.'
                  : null}
              </span>
            </div>

            {canCreate && v.status === 'published' && (
              <Button
                variant="secondary"
                size="sm"
                icon={<GitBranch className="w-3.5 h-3.5" />}
                onClick={() => setShowRevisionDialog(true)}
                id="create-revision-btn"
                className="bg-white border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                New Revision
              </Button>
            )}
          </div>
        )}

        {/* Not-Author Notice Banner */}
        {!isFrozen && editableStatus && !isAuthor && canCreate && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>This draft was created by another expert. You can view it but not edit it.</span>
          </div>
        )}

        {/* 4. THREE-COLUMN CARD LAYOUT (1fr 1.5fr 1.4fr approx) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ════════════ LEFT COLUMN: PROCEDURE DETAILS (lg:col-span-3) ════════════ */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl border border-[#DCE8F5] p-5 shadow-xs space-y-4.5">
              {/* Card Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#DCE8F5]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#EFF7FF] border border-[#BCD7F5] flex items-center justify-center text-[#1473E6]">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-[#12345A]">Procedure Details</h2>
                </div>
                <VersionSwitcher
                  itemId={id!}
                  currentVersionId={v.id}
                  onSwitch={handleVersionSwitch}
                  hasUnsaved={isDirty}
                />
              </div>

              {/* Title Field */}
              <div>
                <label htmlFor="item-title" className="block text-[11px] font-semibold uppercase tracking-wider text-[#536780] mb-1.5">
                  Title <span className="text-rose-500">*</span>
                </label>
                {isEditable ? (
                  <input
                    id="item-title"
                    type="text"
                    value={localTitle}
                    onChange={handleTitleChange}
                    placeholder="Procedure title"
                    maxLength={255}
                    className="w-full bg-white border border-[#DCE8F5] rounded-lg px-3 py-2 text-sm text-[#12345A] font-medium focus:border-[#1473E6] focus:ring-2 focus:ring-[#1473E6]/20 outline-none transition-colors"
                  />
                ) : (
                  <div className="w-full bg-[#F7FAFE] border border-[#DCE8F5] rounded-lg px-3 py-2 text-sm font-bold text-[#12345A]">
                    {data.title}
                  </div>
                )}
              </div>

              {/* Machine Field */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#536780] mb-1.5">
                  Machine <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F7FAFE] border border-[#DCE8F5] text-xs font-semibold text-[#12345A]">
                  <Cpu className="w-3.5 h-3.5 text-[#1473E6] shrink-0" />
                  <span className="truncate">{data.machine ? `${data.machine.name}` : machineName}</span>
                </div>
                <p className="text-[10px] text-[#536780] mt-1 italic">
                  Machine linkage cannot be changed after creation.
                </p>
              </div>

              {/* Origin Badge */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#536780] mb-1.5">
                  Origin
                </label>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF7FF] border border-[#BCD7F5] text-xs font-semibold text-[#1473E6]">
                  <User className="w-3.5 h-3.5" />
                  <span className="capitalize">{originDisplay}</span>
                </div>
              </div>

              {/* Subtle Draft Status Panel */}
              <div className="rounded-xl bg-[#EFF7FF] border border-[#BCD7F5] p-3.5 text-xs text-[#536780] space-y-2.5">
                <div className="flex items-center gap-1.5 font-semibold text-[#1473E6]">
                  <Info className="w-3.5 h-3.5" />
                  <span>Draft Status</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  This knowledge is saved as a draft. Save your changes, then submit it for peer review when ready.
                </p>
              </div>

              {/* Optional Expandable Details Section */}
              <div className="pt-2 border-t border-[#DCE8F5]">
                <button
                  type="button"
                  onClick={() => setShowDetailsSection(!showDetailsSection)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-[#536780] hover:text-[#12345A] py-1"
                >
                  <span>{captureKind === 'notes' ? 'Practical Knowledge Notes' : 'Additional Information'}</span>
                  {showDetailsSection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showDetailsSection && (
                  <div className="pt-3 space-y-3 animate-in fade-in">
                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-[#536780] mb-1">
                        Practical knowledge and notes
                      </label>
                      {isEditable ? (
                        <textarea
                          value={localDescription}
                          onChange={handleDescriptionChange}
                          placeholder="Describe the practical know-how, what to watch for, and useful operating context…"
                          rows={3}
                          autoFocus={captureKind === 'notes'}
                          className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2 text-xs text-[#12345A] focus:border-[#1473E6] focus:ring-1 focus:ring-[#1473E6] outline-none"
                        />
                      ) : (
                        <p className="text-xs text-[#536780] bg-[#F7FAFE] p-2 rounded-lg">{localDescription || '—'}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-[#536780] mb-1">
                        Revision Reason
                      </label>
                      {isEditable ? (
                        <textarea
                          value={localRevisionReason}
                          onChange={handleRevisionReasonChange}
                          placeholder="Why this version was created…"
                          rows={2}
                          className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2 text-xs text-[#12345A] focus:border-[#1473E6] focus:ring-1 focus:ring-[#1473E6] outline-none"
                        />
                      ) : (
                        <p className="text-xs text-[#536780] bg-[#F7FAFE] p-2 rounded-lg">{localRevisionReason || '—'}</p>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ════════════ CENTER COLUMN: SUMMARY & MEDIA (lg:col-span-5) ════════════ */}
          <div className="lg:col-span-5 space-y-6">
            {/* Card 1: Procedure Summary */}
            <div className="bg-white rounded-2xl border border-[#DCE8F5] p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-[#DCE8F5]">
                <div className="w-7 h-7 rounded-lg bg-[#EFF7FF] border border-[#BCD7F5] flex items-center justify-center text-[#1473E6]">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#12345A]">Procedure Summary</h2>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-[#536780]">
                  Briefly explain what this procedure does, when it should be used, and its intended outcome.
                </p>
                {isEditable ? (
                  <div className="relative">
                    <textarea
                      id="procedure-summary"
                      value={localSummary}
                      onChange={handleSummaryChange}
                      placeholder="This procedure describes the steps to calibrate the diagnostic analyzer to ensure accurate and reliable results. Follow the steps in order and observe all safety precautions."
                      rows={5}
                      maxLength={500}
                      className="w-full bg-white border border-[#DCE8F5] rounded-xl p-3.5 text-sm text-[#12345A] leading-relaxed placeholder-[#8FA0BF] focus:border-[#1473E6] focus:ring-2 focus:ring-[#1473E6]/20 outline-none transition-colors"
                    />
                    <div className="text-right text-[11px] text-[#8FA0BF] mt-1 font-mono">
                      {localSummary.length} / 500
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-[#F7FAFE] border border-[#DCE8F5] text-sm text-[#12345A] leading-relaxed whitespace-pre-wrap">
                    {localSummary || 'No summary recorded.'}
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Media & Evidence */}
            <div className="bg-white rounded-2xl border border-[#DCE8F5] p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#DCE8F5]">
                <div className="w-7 h-7 rounded-lg bg-[#EFF7FF] border border-[#BCD7F5] flex items-center justify-center text-[#1473E6]">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#12345A]">Media &amp; Evidence</h2>
                  <p className="text-[11px] text-[#536780]">
                    Add recordings, images, videos, or reference documents to support this procedure.
                  </p>
                </div>
              </div>

              {/* Renders the full Media subsystem (Uploader + Voice Recorder + Media List) */}
              <MediaPanel
                versionId={v.id}
                canEdit={isEditable}
                versionNo={v.version_no}
              />
            </div>
          </div>

          {/* ════════════ RIGHT COLUMN: STEPS & VERIFICATION (lg:col-span-4) ════════════ */}
          <div className="lg:col-span-4 space-y-6">
            {/* Card 1: Procedure Steps */}
            <div className="bg-white rounded-2xl border border-[#DCE8F5] p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#DCE8F5]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#EFF7FF] border border-[#BCD7F5] flex items-center justify-center text-[#1473E6]">
                    <ListChecks className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-[#12345A]">Procedure Steps</h2>
                </div>
              </div>

              {/* Step Editor Component */}
              <StepEditor
                steps={localSteps}
                isReadOnly={!isEditable}
                onChange={handleStepsChange}
              />
            </div>

            {/* Card 2: Expert Verification */}
            <div className="bg-white rounded-2xl border border-[#DCE8F5] p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-[#DCE8F5]">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#16865C]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-[#12345A]">Expert Verification</h2>
              </div>

              <p className="text-xs text-[#536780] leading-relaxed">
                Review your steps and ensure all information is accurate and safe for operation.
              </p>

              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    id="expert-verified-checkbox"
                    checked={isVerified}
                    onChange={(e) => setIsVerified(e.target.checked)}
                    className="w-4 h-4 rounded border-[#BCD7F5] text-[#1473E6] focus:ring-[#1473E6]/30 cursor-pointer mt-0.5"
                  />
                  <span className="text-xs font-semibold text-[#12345A] group-hover:text-[#1473E6] transition-colors leading-snug">
                    I have verified these instructions for safe use
                  </span>
                </label>
              </div>

              {/* Notice if steps have review flags */}
              {localSteps.some((s) => s.needs_review) && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    {localSteps.filter((s) => s.needs_review).length} step(s) are flagged for expert review.
                  </span>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Revision Dialog */}
      <CreateRevisionDialog
        isOpen={showRevisionDialog}
        itemId={id!}
        sourceVersionNo={v.version_no}
        onClose={() => setShowRevisionDialog(false)}
        onCreated={handleRevisionCreated}
      />

      {/* Quick Creation Modal triggered by Hero button */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#DCE8F5] shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#12345A]">Create New Procedure</h3>
            <p className="text-xs text-[#536780]">
              Start documenting a Standard Operating Procedure for laboratory equipment.
            </p>

            <form onSubmit={handleCreateNew} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#12345A] mb-1">
                  Procedure Title *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Diagnostic Analyzer Calibration"
                  className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2.5 text-xs text-[#12345A] focus:border-[#1473E6] focus:ring-2 focus:ring-[#1473E6]/20 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#12345A] mb-1">
                  Machine Asset *
                </label>
                <select
                  value={newMachineId}
                  onChange={(e) => setNewMachineId(e.target.value)}
                  className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2.5 text-xs text-[#12345A] focus:border-[#1473E6] outline-none"
                >
                  <option value="">Select equipment…</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#BCD7F5] bg-white text-xs font-semibold text-[#536780] hover:bg-[#F7FAFE]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-[#1473E6] hover:bg-[#1060C4] text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create Procedure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
