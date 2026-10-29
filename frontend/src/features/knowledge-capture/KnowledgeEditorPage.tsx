import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
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
  CheckSquare,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api/client';
import {
  useKnowledgeDetail,
  useUpdateKnowledge,
  useVersionList,
  useCreateRevision,
  useMachines,
  useCreateKnowledge,
  useSubmitKnowledge,
  knowledgeKeys,
} from './hooks';
import { StepEditor } from './StepEditor';
import { MediaPanel } from './media/MediaPanel';
import { Button } from '../../components/ui/Button';
import { ApiClientError } from '../../lib/api/client';
import type { Step, KnowledgeVersion, KnowledgeSourceReference } from './types';
import { machineOptionLabel, selectableMachines } from '../machines/registeredMachines';
import type { KnowledgeVersionComparison } from './types';
import { fetchVersionComparison } from './knowledgeApi';
import { isEditableStatus } from './types';
import { MedicalHeroBanner } from './components/MedicalHeroBanner';
import { DraftStatusBar } from './components/DraftStatusBar';

interface KnowledgeSourceCandidatePreview {
  title: string;
  machine_id: string | null;
  category: string;
  tags?: string | null;
  summary?: string | null;
  content: string;
  source_refs: KnowledgeSourceReference[];
}

interface SourceReferenceDraft {
  source_title: string;
  revision: string;
  pdf_pages: string;
  printed_pages: string;
  section: string;
  source_provenance: string;
  source_manufacturer: string;
  source_model: string;
  machine_manufacturer: string;
  machine_model: string;
  machine_identity_basis: string;
  machine_identity_reference: string;
  audience_clearance: string;
  verified: boolean;
}

const emptySourceReferenceDraft: SourceReferenceDraft = {
  source_title: '', revision: '', pdf_pages: '', printed_pages: '', section: '',
  source_provenance: '', source_manufacturer: '', source_model: '',
  machine_manufacturer: '', machine_model: '', machine_identity_basis: '',
  machine_identity_reference: '', audience_clearance: 'unknown', verified: false,
};

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
  const [compareOpen, setCompareOpen] = useState(false);
  const [baseVersionNo, setBaseVersionNo] = useState('');
  const [targetVersionNo, setTargetVersionNo] = useState('');
  const [comparison, setComparison] = useState<KnowledgeVersionComparison | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
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

  if (isLoading || !Array.isArray(versions) || versions.length <= 1) return null;

  const current = versions.find((v) => v.id === currentVersionId);
  const runCompare = async () => {
    if (!baseVersionNo || !targetVersionNo || baseVersionNo === targetVersionNo) return;
    setCompareLoading(true); setCompareError(''); setComparison(null);
    try {
      setComparison(await fetchVersionComparison(itemId, Number(baseVersionNo), Number(targetVersionNo)));
    } catch (cause) {
      setCompareError(cause instanceof Error ? cause.message : 'Could not compare these saved versions.');
    } finally { setCompareLoading(false); }
  };
  const compareFields = ['title', 'machine_id', 'summary', 'description', 'content', 'operating_conditions', 'prerequisites', 'safety_warnings', 'common_mistakes', 'corrective_actions', 'steps'] as const;
  const displayField = (value: unknown) => {
    if (value == null || value === '') return '—';
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  };

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

      <div className="mt-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => { setCompareOpen(value => !value); setCompareError(''); }} aria-expanded={compareOpen}>
          {compareOpen ? 'Close comparison' : 'Compare versions'}
        </Button>
      </div>
      {compareOpen && <section aria-label="Compare knowledge versions" className="mt-3 w-[min(90vw,56rem)] rounded-xl border border-[#DCE8F5] bg-white p-4 shadow-sm space-y-3">
        <p className="text-xs text-slate-600">Compare saved snapshots. Unsaved editor changes are not included.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-semibold">Earlier version
            <select aria-label="Earlier version" className="mt-1 block w-full rounded-lg border p-2" value={baseVersionNo} onChange={event => { setBaseVersionNo(event.target.value); setComparison(null); }}>
              <option value="">Choose version…</option>{versions.map(version => <option key={version.id} value={version.version_no}>v{version.version_no} · {version.status}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">Later version
            <select aria-label="Later version" className="mt-1 block w-full rounded-lg border p-2" value={targetVersionNo} onChange={event => { setTargetVersionNo(event.target.value); setComparison(null); }}>
              <option value="">Choose version…</option>{versions.map(version => <option key={version.id} value={version.version_no}>v{version.version_no} · {version.status}</option>)}
            </select>
          </label>
          <Button type="button" disabled={compareLoading || !baseVersionNo || !targetVersionNo || baseVersionNo === targetVersionNo} onClick={() => void runCompare()}>{compareLoading ? 'Comparing…' : 'Compare'}</Button>
        </div>
        {compareError && <p role="alert" className="text-sm text-red-700">{compareError}</p>}
        {comparison && <div role="region" aria-label={`Comparison of v${comparison.base.version_no} and v${comparison.target.version_no}`} className="space-y-3">
          <p role="status" className="text-xs text-slate-600">{comparison.changed_fields.length ? `Changed: ${comparison.changed_fields.join(', ')}` : 'No compared content fields changed.'}</p>
          <div className="grid gap-3 md:grid-cols-2">{compareFields.map(field => {
            const changed = comparison.changed_fields.includes(field);
            return <article key={field} className={`rounded-lg border p-3 ${changed ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-slate-50/50'}`}>
              <h3 className="text-xs font-bold capitalize">{field.replace(/_/g, ' ')}{changed && <span className="ml-2 text-amber-800">Changed</span>}</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div><p className="font-semibold text-slate-500">v{comparison.base.version_no}</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans">{displayField(comparison.base[field])}</pre></div><div><p className="font-semibold text-slate-500">v{comparison.target.version_no}</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans">{displayField(comparison.target[field])}</pre></div></div>
            </article>;
          })}</div>
        </div>}
      </section>}
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
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuth();
  const { data: machinesData } = useMachines();
  const machineOptions = selectableMachines(machinesData?.items ?? []);

  const isNewRoute = !id || id === 'new';
  const captureKind = searchParams.get('capture') ?? undefined;
  const versionIdParam = searchParams.get('version_id') ?? undefined;

  // New Draft Creation Modal State (if accessing /app/knowledge/new)
  const [newTitle, setNewTitle] = useState('');
  const [newMachineId, setNewMachineId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const createMutation = useCreateKnowledge();

  // Fetch item detail if an ID exists
  const { data, isLoading, isError, error } = useKnowledgeDetail(
    isNewRoute ? '' : id!,
    versionIdParam
  );

  // Local editable state
  const [localTitle, setLocalTitle] = useState('');
  const [localMachineId, setLocalMachineId] = useState('');
  const [localSummary, setLocalSummary] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const [localContent, setLocalContent] = useState('');
  const [localOperatingConditions, setLocalOperatingConditions] = useState('');
  const [localSafetyWarnings, setLocalSafetyWarnings] = useState('');
  const [localPrerequisites, setLocalPrerequisites] = useState('');
  const [localCommonMistakes, setLocalCommonMistakes] = useState('');
  const [localCorrectiveActions, setLocalCorrectiveActions] = useState('');
  const [localSteps, setLocalSteps] = useState<Step[]>([]);
  const [localRevisionReason, setLocalRevisionReason] = useState('');
  const [localSourceRefs, setLocalSourceRefs] = useState<KnowledgeSourceReference[]>([]);
  const [sourceReferenceDraft, setSourceReferenceDraft] = useState<SourceReferenceDraft>(emptySourceReferenceDraft);
  const [sourceReferenceError, setSourceReferenceError] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [showDetailsSection, setShowDetailsSection] = useState(false);

  // UX state
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ecgPreview, setEcgPreview] = useState<KnowledgeSourceCandidatePreview | null>(null);
  const [ecgPreviewLoading, setEcgPreviewLoading] = useState(false);
  const [ecgPreviewError, setEcgPreviewError] = useState('');
  const [syntheticPreview, setSyntheticPreview] = useState<KnowledgeSourceCandidatePreview | null>(null);
  const [syntheticPreviewLoading, setSyntheticPreviewLoading] = useState(false);
  const [syntheticPreviewError, setSyntheticPreviewError] = useState('');

  // Reviewer Decision State (Module 06)
  const [reviewComments, setReviewComments] = useState('');
  const [acknowledgedAiDraft, setAcknowledgedAiDraft] = useState(false);
  const [reviewActionLoading, setReviewActionLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  const handleReviewDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!id) return;
    setReviewError(null);
    setReviewSuccess(null);

    if (data?.author_id === user?.id && user?.role_id !== 'ADMIN') {
      setReviewError(
        'System Governance Rule: Authors cannot approve their own submissions. A separate authorized peer reviewer must approve this submission.'
      );
      return;
    }

    const isAiGeneratedDraft = ['ai_draft', 'ai_draft_edited'].includes(data?.version?.origin || '');
    if (decision === 'APPROVED' && isAiGeneratedDraft && !acknowledgedAiDraft) {
      setReviewError('Acknowledge that you checked the AI draft against its source before publishing.');
      return;
    }

    setReviewActionLoading(true);
    try {
      await api.post(`/reviews/${id}/decision`, {
        decision,
        comments: reviewComments.trim() || undefined,
        acknowledged_ai_draft: decision === 'APPROVED' && acknowledgedAiDraft,
      });
      setReviewSuccess(
        decision === 'APPROVED'
          ? '🎉 Procedure successfully approved and published! Now live on the shopfloor and grounded in AI Knowledge Assistant (RAG).'
          : 'Draft returned to author with requested modifications.'
      );
      setReviewComments('');
      setAcknowledgedAiDraft(false);
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.all });
    } catch (err: any) {
      setReviewError(err?.message || 'Failed to submit review decision.');
    } finally {
      setReviewActionLoading(false);
    }
  };

  const updateMutation = useUpdateKnowledge(id || '');
  const submitMutation = useSubmitKnowledge(id || '');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populate state on data load
  useEffect(() => {
    if (!data) return;
    const v = data.version;
    setLocalTitle(data.title);
    setLocalMachineId(data.machine_id || '');
    setLocalSummary(v.summary ?? '');
    setLocalDescription(v.description ?? '');
    setLocalContent(v.content ?? '');
    setLocalOperatingConditions(v.operating_conditions ?? '');
    setLocalSafetyWarnings(v.safety_warnings ?? '');
    setLocalPrerequisites(v.prerequisites ?? '');
    setLocalCommonMistakes(v.common_mistakes ?? '');
    setLocalCorrectiveActions(v.corrective_actions ?? '');
    setLocalSteps(v.steps ?? []);
    setLocalRevisionReason(v.revision_reason ?? '');
    setLocalSourceRefs(v.source_refs ?? []);
    setSourceReferenceDraft(emptySourceReferenceDraft);
    setSourceReferenceError('');
    setIsDirty(false);
    setSaveStatus('idle');
    setSaveError(null);
    setSubmitError(null);
    setAcknowledgedAiDraft(false);
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

  const previewEcgSource = async () => {
    setEcgPreviewError('');
    setEcgPreviewLoading(true);
    try {
      setEcgPreview(await api.get<KnowledgeSourceCandidatePreview>('/knowledge/import-candidates/uganda-ecg-training-manual'));
    } catch (err) {
      setEcgPreviewError(err instanceof Error ? err.message : 'Could not load the ECG source excerpt.');
    } finally {
      setEcgPreviewLoading(false);
    }
  };

  const saveEcgSourceDraft = async () => {
    if (!ecgPreview) return;
    setEcgPreviewError('');
    try {
      const saved = await api.post<{ id: string }>('/knowledge', ecgPreview);
      navigate(`/app/knowledge/${saved.id}`);
    } catch (err) {
      setEcgPreviewError(err instanceof Error ? err.message : 'Could not save the ECG review draft.');
    }
  };

  const previewSyntheticExample = async () => {
    const selectedMachine = machineOptions.find((machine) => machine.id === newMachineId);
    if (!selectedMachine?.is_demo) return;
    setSyntheticPreviewError('');
    setSyntheticPreviewLoading(true);
    try {
      setSyntheticPreview(await api.get<KnowledgeSourceCandidatePreview>(`/knowledge/synthetic-demo/templates/${encodeURIComponent(selectedMachine.id)}`));
    } catch (err) {
      setSyntheticPreviewError(err instanceof Error ? err.message : 'Could not load the synthetic example.');
    } finally {
      setSyntheticPreviewLoading(false);
    }
  };

  const saveSyntheticDraft = async () => {
    if (!syntheticPreview) return;
    setSyntheticPreviewError('');
    try {
      const saved = await api.post<{ id: string }>('/knowledge', syntheticPreview);
      navigate(`/app/knowledge/${saved.id}`);
    } catch (err) {
      setSyntheticPreviewError(err instanceof Error ? err.message : 'Could not save the synthetic draft.');
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
  const canSubmit = isEditable && isAuthor && canSubmitReview && (version?.status === 'draft' || version?.status === 'changes_requested');

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

  const handleMachineAssociationChange = (machineId: string) => {
    setLocalMachineId(machineId);
    if (machineId !== localMachineId) {
      setLocalSourceRefs((references) => references.map((reference) => {
        if (reference.type !== 'document' || !reference.verification) return reference;
        return {
          ...reference,
          verification: { status: 'unverified', audience_clearance: 'unknown' },
        };
      }));
    }
    markDirty();
  };

  const addSourceReference = () => {
    setSourceReferenceError('');
    if (!sourceReferenceDraft.source_title.trim()) {
      setSourceReferenceError('Enter a source document title before adding it.');
      return;
    }
    const pdfPages = sourceReferenceDraft.pdf_pages.split(/[\s,]+/).map((page) => page.trim()).filter(Boolean);
    const printedPages = sourceReferenceDraft.printed_pages.split(/[\s,]+/).map((page) => page.trim()).filter(Boolean);
    if (sourceReferenceDraft.verified && (!sourceReferenceDraft.revision.trim() || (!pdfPages.length && !sourceReferenceDraft.section.trim()))) {
      setSourceReferenceError('A verified source needs its revision and an exact page or section.');
      return;
    }
    const verification: Record<string, string> = {
      status: sourceReferenceDraft.verified ? 'verified' : 'unverified',
      audience_clearance: sourceReferenceDraft.audience_clearance || 'unknown',
    };
    const verificationFields: Array<[keyof SourceReferenceDraft, string]> = [
      ['source_provenance', 'source_provenance'],
      ['source_manufacturer', 'source_manufacturer'],
      ['source_model', 'source_model'],
      ['machine_manufacturer', 'machine_manufacturer'],
      ['machine_model', 'machine_model'],
      ['machine_identity_basis', 'machine_identity_basis'],
      ['machine_identity_reference', 'machine_identity_reference'],
    ];
    for (const [draftField, verificationField] of verificationFields) {
      const value = sourceReferenceDraft[draftField];
      if (typeof value === 'string' && value.trim()) verification[verificationField] = value.trim();
    }
    const reference: KnowledgeSourceReference = {
      type: 'document',
      source_title: sourceReferenceDraft.source_title.trim(),
      revision: sourceReferenceDraft.revision.trim() || undefined,
      pdf_pages: pdfPages.length ? pdfPages : undefined,
      printed_pages: printedPages.length ? printedPages : undefined,
      section: sourceReferenceDraft.section.trim() || undefined,
      verification: verification as unknown as KnowledgeSourceReference['verification'],
    };
    setLocalSourceRefs((references) => [...references, reference]);
    setSourceReferenceDraft(emptySourceReferenceDraft);
    markDirty();
  };

  const removeSourceReference = (index: number) => {
    setLocalSourceRefs((references) => references.filter((_, currentIndex) => currentIndex !== index));
    markDirty();
  };

  const handleSave = async () => {
    if (!version || !isEditable) return;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await updateMutation.mutateAsync({
        title: localTitle.trim() || undefined,
        machine_id: localMachineId || null,
        summary: localSummary.trim() || null,
        description: localDescription.trim() || null,
        content: localContent || null,
        operating_conditions: localOperatingConditions.trim() || null,
        safety_warnings: localSafetyWarnings.trim() || null,
        prerequisites: localPrerequisites.trim() || null,
        common_mistakes: localCommonMistakes.trim() || null,
        corrective_actions: localCorrectiveActions.trim() || null,
        source_refs: localSourceRefs,
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

  const handleSubmitForReview = async () => {
    if (!id || !version || !canSubmit) return;
    if (!localTitle.trim()) {
      setSubmitError('Add a title before submitting for review.');
      return;
    }
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      if (isDirty) {
        await updateMutation.mutateAsync({
          title: localTitle.trim() || undefined,
          machine_id: localMachineId || null,
          summary: localSummary.trim() || null,
          description: localDescription.trim() || null,
          content: localContent || null,
          operating_conditions: localOperatingConditions.trim() || null,
          safety_warnings: localSafetyWarnings.trim() || null,
          prerequisites: localPrerequisites.trim() || null,
          common_mistakes: localCommonMistakes.trim() || null,
          corrective_actions: localCorrectiveActions.trim() || null,
          source_refs: localSourceRefs,
          steps: localSteps,
          revision_reason: localRevisionReason.trim() || null,
          version_id: version.id,
        });
        setIsDirty(false);
      }
      await submitMutation.mutateAsync();
      setSubmitSuccess('Draft successfully submitted for peer review!');
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : 'Failed to submit draft for review.');
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
                  placeholder="e.g. CNC Spindle Warm-Up & Concentricity Protocol"
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
                  {machineOptions.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machineOptionLabel(machine)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#536780] mt-1">
                  Link this knowledge to registered equipment when relevant.
                </p>
              </div>

              {canCreate && (
                <div className="space-y-3 border-t border-[#DCE8F5] pt-4">
                  <h3 className="text-sm font-bold">Source review candidates</h3>
                  <button type="button" onClick={previewEcgSource} disabled={ecgPreviewLoading} className="px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50">
                    {ecgPreviewLoading ? 'Loading ECG source…' : 'Review ECG source excerpt'}
                  </button>
                  {ecgPreviewError && <p role="alert" className="text-xs text-rose-700">{ecgPreviewError}</p>}
                  {ecgPreview && <div className="space-y-2 rounded-lg bg-[#F7FAFE] p-3 text-xs">
                    <strong>{ecgPreview.title}</strong>
                    <p className="whitespace-pre-wrap">{ecgPreview.content}</p>
                    <p>PDF page(s) {ecgPreview.source_refs.flatMap((ref) => ref.pdf_pages ?? []).join(', ')}</p>
                    <p>Not saved yet</p>
                    <button type="button" onClick={saveEcgSourceDraft} className="px-3 py-2 rounded-lg bg-[#1473E6] text-white">Save unassigned ECG review draft</button>
                  </div>}
                  {machineOptions.find((machine) => machine.id === newMachineId)?.is_demo && <div className="space-y-2">
                    <button type="button" onClick={previewSyntheticExample} disabled={syntheticPreviewLoading} className="px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50">
                      {syntheticPreviewLoading ? 'Loading synthetic example…' : 'Preview synthetic example'}
                    </button>
                    {syntheticPreviewError && <p role="alert" className="text-xs text-rose-700">{syntheticPreviewError}</p>}
                    {syntheticPreview && <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-xs">
                      <strong>{syntheticPreview.title}</strong>
                      <p className="whitespace-pre-wrap">{syntheticPreview.content}</p>
                      <p>Not saved · Machine linked · Saving creates a draft only</p>
                      <button type="button" onClick={saveSyntheticDraft} className="px-3 py-2 rounded-lg bg-[#1473E6] text-white">Save synthetic draft</button>
                    </div>}
                  </div>}
                </div>
              )}

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
    const is404 =
      (error instanceof ApiClientError && (error.status === 404 || error.code === 'not_found')) ||
      (error as any)?.status === 404 ||
      (error as any)?.code === 'not_found' ||
      (error as any)?.status === 'not_found' ||
      String((error as any)?.code).toLowerCase() === 'not_found';
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
          errorMessage={saveError || submitError}
          onSave={handleSave}
          canEdit={isEditable}
          isDirty={isDirty}
          canSubmit={canSubmit}
          onSubmit={handleSubmitForReview}
          isSubmitting={submitMutation.isPending}
          onAskAssistant={v.status === 'published' ? () => navigate(`/app/assistant?q=${encodeURIComponent(data.title)}`) : undefined}
          canApproveReview={hasPermission('knowledge.approve')}
          onApproveReview={() => handleReviewDecision('APPROVED')}
          isApprovingReview={reviewActionLoading}
        />
        {submitError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{submitError}</div>}

        {v.status === 'in_review' && ['ai_draft', 'ai_draft_edited'].includes(v.origin || '') && (
          <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <input
              type="checkbox"
              checked={acknowledgedAiDraft}
              onChange={(event) => setAcknowledgedAiDraft(event.target.checked)}
              className="mt-0.5"
              aria-label="Acknowledge AI draft verification"
            />
            <span>I reviewed this AI-generated draft against its source transcript and verified its procedures, parameters, and safety details before publishing.</span>
          </label>
        )}

        {/* Role Perspective Banners */}
        {user?.role_id === 'TRAINEE' && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <GraduationCap className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Apprentice Study Mode:</strong> Study each operational instruction, tooling setup, and safety warning below.
              </span>
            </div>
            {v.status === 'published' && (
              <button
                type="button"
                onClick={() => navigate(`/app/assistant?q=Explain%20steps%20and%20tolerances%20for%20${encodeURIComponent(data.title)}`)}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold shrink-0 shadow-xs transition-colors flex items-center gap-1"
              >
                <span>Ask AI Tutor About This SOP</span>
                <span>→</span>
              </button>
            )}
          </div>
        )}

        {user?.role_id === 'OPERATOR' && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Shopfloor Workstation Mode:</strong> Ensure all PPE prerequisites and machine operating conditions are verified before operating.
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-white border border-amber-300 text-amber-800 text-[10px] font-bold uppercase">
              Active SOP Execution
            </span>
          </div>
        )}

        {/* ═══ PEER REVIEW & APPROVAL DECISION CARD (Module 06) ═══ */}
        {v.status === 'in_review' && (
          <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm p-6 space-y-4 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-[#12345A]">
                      Peer Review &amp; Technical Verification Decision
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                      Pending Approval
                    </span>
                  </div>
                  <p className="text-xs text-[#536780] mt-0.5">
                    Module 06 • Review step instructions, tooling setups, PPE warnings, and tolerance limits before shopfloor release.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#536780]">Author:</span>
                <span className="font-semibold text-[#12345A] bg-[#EFF7FF] px-2 py-0.5 rounded-md border border-[#BCD7F5]">
                  {data.author_id === user?.id ? 'You (Current Author)' : 'Expert Author'}
                </span>
              </div>
            </div>

            {reviewSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{reviewSuccess}</span>
              </div>
            )}

            {reviewError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2.5 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{reviewError}</span>
              </div>
            )}

            {data.author_id === user?.id && !hasPermission('knowledge.approve') ? (
              /* Author Self-Review Guard with 1-Click Allow Option */
              <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-300 space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                      Strict Two-Person Peer Review Rule (Safety Invariant 3)
                    </h3>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      You authored this standard procedure. In accordance with precision manufacturing quality standards, an author cannot approve their own submission to prevent uncalibrated machine cycles.
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200/80 text-xs font-semibold text-amber-900">
                  Sign in with a separate authorized reviewer account to review and publish this submission.
                </div>
              </div>
            ) : hasPermission('knowledge.approve') ? (
              /* Reviewer Decision Controls (Expert B or Admin) */
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 text-xs text-[#536780] bg-[#F7FAFE] p-3 rounded-xl border border-[#DCE8F5]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Eligible Reviewer: <strong className="text-[#12345A]">{user?.name}</strong></span>
                    <span className="text-[10px] uppercase font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.2 rounded-full">
                      {user?.role_id === 'ADMIN' ? 'Admin Compliance Override' : 'Peer Expert Reviewer'}
                    </span>
                  </span>
                  <span className="text-[11px] text-[#536780]">Two-Person Invariant Verified</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#12345A] mb-1.5">
                    Reviewer Remarks / Verification Notes <span className="text-[#8FA0BF] font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    placeholder="e.g. Verified dial indicator concentricity step, spindle warm-up tolerances, and chip shield safety interlocks. Qualified for shopfloor deployment."
                    rows={2}
                    className="w-full bg-white border border-[#DCE8F5] rounded-xl p-3 text-xs text-[#12345A] placeholder-[#8FA0BF] focus:border-[#1473E6] focus:ring-2 focus:ring-[#1473E6]/20 outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <p className="text-[11px] text-[#536780]">
                    Approving this procedure immediately publishes it to the shopfloor library and indexes all steps and tolerances into the AI Knowledge Assistant (RAG).
                  </p>
                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      disabled={reviewActionLoading}
                      onClick={() => handleReviewDecision('REJECTED')}
                      className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Request Changes / Reject</span>
                    </button>
                    <button
                      type="button"
                      disabled={reviewActionLoading || (['ai_draft', 'ai_draft_edited'].includes(v.origin || '') && !acknowledgedAiDraft)}
                      onClick={() => handleReviewDecision('APPROVED')}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-extrabold shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{reviewActionLoading ? 'Publishing SOP…' : 'Approve & Publish SOP (Post to RAG)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-center gap-3">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  This procedure is currently undergoing technical peer review by manufacturing engineering specialists. It will become executable once published.
                </span>
              </div>
            )}
          </div>
        )}

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
                <label htmlFor="machine-association" className="block text-[11px] font-semibold uppercase tracking-wider text-[#536780] mb-1.5">Machine association</label>
                {isEditable ? <select id="machine-association" aria-label="Machine association" value={localMachineId} onChange={(e) => handleMachineAssociationChange(e.target.value)} className="w-full rounded-lg border border-[#DCE8F5] bg-white px-3 py-2 text-xs">
                  <option value="">Unassigned</option>{machineOptions.map((machine) => <option key={machine.id} value={machine.id}>{machineOptionLabel(machine)}</option>)}
                </select> : <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F7FAFE] border border-[#DCE8F5] text-xs font-semibold text-[#12345A]"><Cpu className="w-3.5 h-3.5 text-[#1473E6] shrink-0" /><span className="truncate">{data.machine ? `${data.machine.name}` : machineName}</span></div>}
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

              {/* Draft Status Panel & Submission Action */}
              <div className="rounded-xl bg-[#EFF7FF] border border-[#BCD7F5] p-3.5 text-xs text-[#536780] space-y-2.5">
                <div className="flex items-center gap-1.5 font-semibold text-[#1473E6]">
                  <Info className="w-3.5 h-3.5" />
                  <span>Draft Status</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {v.status === 'draft'
                    ? 'This procedure is currently in draft. Once finished, submit it for peer review to qualify parameters and safety protocols.'
                    : `This procedure is currently in ${v.status.replace('_', ' ')} status.`}
                </p>

                {submitSuccess && (
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium animate-in fade-in">
                    {submitSuccess}
                  </div>
                )}

                {submitError && (
                  <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium animate-in fade-in">
                    {submitError}
                  </div>
                )}

                <div className="text-[10px] text-[#536780]">
                  Module 06 governs the peer review &amp; verification queue.
                </div>

                {!canSubmit && isAuthor && (
                  <p className="text-[10px] text-[#7C8DA1]">Submission is unavailable while this item is in its current status.</p>
                )}
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
                  <div className="pt-3 space-y-3.5 animate-in fade-in">
                    <div>
                      <label htmlFor="common-mistakes" className="block text-[10px] uppercase font-semibold text-[#536780] mb-1">Common mistakes, symptoms and verified causes</label>
                      {isEditable ? <textarea id="common-mistakes" aria-label="Common mistakes, symptoms and verified causes" value={localCommonMistakes} onChange={(e) => { setLocalCommonMistakes(e.target.value); markDirty(); }} rows={3} className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2 text-xs text-[#12345A]" /> : <p className="whitespace-pre-wrap text-xs">{localCommonMistakes || '—'}</p>}
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-[#536780] mb-1">
                        Operating Conditions &amp; Environment
                      </label>
                      {isEditable ? (
                        <textarea
                          value={localOperatingConditions}
                          onChange={(e) => {
                            setLocalOperatingConditions(e.target.value);
                            markDirty();
                          }}
                          placeholder="e.g. Ambient 20±2°C, spindle warmed up for 15 min at 3000 RPM, hydraulic pressure 50 bar…"
                          rows={2}
                          className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2 text-xs text-[#12345A] focus:border-[#1473E6] focus:ring-1 focus:ring-[#1473E6] outline-none"
                        />
                      ) : (
                        <p className="text-xs text-[#536780] bg-[#F7FAFE] p-2 rounded-lg">{localOperatingConditions || '—'}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-[#536780] mb-1">
                        Safety Warnings &amp; PPE
                      </label>
                      {isEditable ? (
                        <textarea
                          value={localSafetyWarnings}
                          onChange={(e) => {
                            setLocalSafetyWarnings(e.target.value);
                            markDirty();
                          }}
                          placeholder="e.g. Wear ANSI Z87.1 safety glasses, engage interlock safety door, ensure chip shield closed…"
                          rows={2}
                          className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2 text-xs text-[#12345A] focus:border-[#1473E6] focus:ring-1 focus:ring-[#1473E6] outline-none"
                        />
                      ) : (
                        <p className="text-xs text-[#536780] bg-[#F7FAFE] p-2 rounded-lg">{localSafetyWarnings || '—'}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-[#536780] mb-1">
                        Prerequisites &amp; Tooling Setup
                      </label>
                      {isEditable ? (
                        <textarea
                          value={localPrerequisites}
                          onChange={(e) => {
                            setLocalPrerequisites(e.target.value);
                            markDirty();
                          }}
                          placeholder="e.g. Dial indicator 0.001mm resolution, magnetic base, cleaned ISO 40 taper gauge…"
                          rows={2}
                          className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2 text-xs text-[#12345A] focus:border-[#1473E6] focus:ring-1 focus:ring-[#1473E6] outline-none"
                        />
                      ) : (
                        <p className="text-xs text-[#536780] bg-[#F7FAFE] p-2 rounded-lg">{localPrerequisites || '—'}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-[#536780] mb-1">
                        Corrective Actions / Troubleshooting
                      </label>
                      {isEditable ? (
                        <textarea
                          value={localCorrectiveActions}
                          onChange={(e) => {
                            setLocalCorrectiveActions(e.target.value);
                            markDirty();
                          }}
                          placeholder="e.g. If TIR exceeds 0.008mm, clean spindle socket with non-abrasive wiper and re-measure…"
                          rows={2}
                          className="w-full bg-white border border-[#DCE8F5] rounded-lg p-2 text-xs text-[#12345A] focus:border-[#1473E6] focus:ring-1 focus:ring-[#1473E6] outline-none"
                        />
                      ) : (
                        <p className="text-xs text-[#536780] bg-[#F7FAFE] p-2 rounded-lg">{localCorrectiveActions || '—'}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-[#536780] mb-1">
                        {captureKind === 'notes' ? 'Practical Knowledge Notes' : 'Full Description'}
                      </label>
                      {isEditable ? (
                        <textarea
                          value={localDescription}
                          onChange={handleDescriptionChange}
                          placeholder="Describe the practical know-how, what to watch for, and useful operating context…"
                          rows={captureKind === 'notes' ? 4 : 2}
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
            <div className="bg-white rounded-2xl border border-[#DCE8F5] p-5 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-[#12345A]">Machine-specific technical knowledge</h2>
              {isEditable ? <textarea aria-label="Machine-specific technical knowledge" value={localContent} onChange={(event) => { setLocalContent(event.target.value); markDirty(); }} rows={7} className="w-full bg-white border border-[#DCE8F5] rounded-xl p-3 text-sm" /> : <p className="whitespace-pre-wrap text-sm">{localContent || '—'}</p>}
            </div>

            <div className="bg-white rounded-2xl border border-[#DCE8F5] p-5 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-[#12345A]">Source references</h2>
              <ul className="space-y-2 text-xs">
                {localSourceRefs.map((reference, index) => <li key={`${reference.source_title ?? reference.title ?? 'source'}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-[#F7FAFE] p-2">
                  <span>{reference.source_title ?? reference.title ?? 'Related knowledge'}{reference.revision ? ` · ${reference.revision}` : ''}</span>
                  {isEditable && <button type="button" aria-label={`Remove source reference ${index + 1}`} onClick={() => removeSourceReference(index)} className="text-rose-700">Remove</button>}
                </li>)}
              </ul>
              {isEditable && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">Source document title<input aria-label="Source document title" value={sourceReferenceDraft.source_title} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, source_title: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Revision / date<input aria-label="Revision / date" value={sourceReferenceDraft.revision} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, revision: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">PDF page(s)<input aria-label="PDF page(s)" value={sourceReferenceDraft.pdf_pages} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, pdf_pages: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Printed page(s)<input aria-label="Printed page(s)" value={sourceReferenceDraft.printed_pages} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, printed_pages: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Section<input aria-label="Section" value={sourceReferenceDraft.section} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, section: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Source provenance<input aria-label="Source provenance" value={sourceReferenceDraft.source_provenance} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, source_provenance: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Source manufacturer<input aria-label="Source manufacturer" value={sourceReferenceDraft.source_manufacturer} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, source_manufacturer: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Source exact model<input aria-label="Source exact model" value={sourceReferenceDraft.source_model} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, source_model: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Verified machine manufacturer<input aria-label="Verified machine manufacturer" value={sourceReferenceDraft.machine_manufacturer} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, machine_manufacturer: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Verified machine exact model<input aria-label="Verified machine exact model" value={sourceReferenceDraft.machine_model} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, machine_model: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Machine identity basis<select aria-label="Machine identity basis" value={sourceReferenceDraft.machine_identity_basis} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, machine_identity_basis: e.target.value })} className="w-full rounded border p-2"><option value="">Unverified</option><option value="asset_plate">Asset plate</option><option value="trusted_registry">Trusted registry</option></select></label>
                <label className="space-y-1">Identity evidence reference<input aria-label="Identity evidence reference" value={sourceReferenceDraft.machine_identity_reference} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, machine_identity_reference: e.target.value })} className="w-full rounded border p-2" /></label>
                <label className="space-y-1">Source audience clearance<select aria-label="Source audience clearance" value={sourceReferenceDraft.audience_clearance} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, audience_clearance: e.target.value })} className="w-full rounded border p-2"><option value="unknown">Unknown</option><option value="trainee_authorized">Trainee authorized</option><option value="expert_only">Expert only</option><option value="restricted">Restricted</option><option value="demo_only">Demo only</option></select></label>
                <label className="flex items-center gap-2"><input type="checkbox" aria-label="Mark source verified" checked={sourceReferenceDraft.verified} onChange={(e) => setSourceReferenceDraft({ ...sourceReferenceDraft, verified: e.target.checked })} />Mark source verified</label>
                {sourceReferenceError && <p role="alert" className="sm:col-span-2 text-rose-700">{sourceReferenceError}</p>}
                <button type="button" onClick={addSourceReference} className="sm:col-span-2 justify-self-start rounded-lg bg-[#1473E6] px-3 py-2 font-semibold text-white">Add source reference</button>
              </div>}
            </div>

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
                      placeholder="This procedure describes the precise operating sequence, tooling setup, operating conditions, and safety protocols for this equipment. Follow all steps in order and observe required tolerances."
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
              Start documenting an authoritative Standard Operating Procedure for precision machinery.
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
                  placeholder="e.g. CNC Spindle Warm-Up & Concentricity Protocol"
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
                  <option value="">Select machine…</option>
                  {machineOptions.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machineOptionLabel(machine)}
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
