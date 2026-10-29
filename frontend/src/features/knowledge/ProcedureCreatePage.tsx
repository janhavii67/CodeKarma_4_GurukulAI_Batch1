import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FileAudio,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  Plus,
  Trash2,
  Video,
} from 'lucide-react';
import { api, getApiUrl } from '../../lib/api/client';
import { Button } from '../../components/ui/Button';
import { AudioRecorder } from '../knowledge-capture/media/AudioRecorder';
import { mediaApi } from '../knowledge-capture/media/mediaApi';
import { uploadWithProgress } from '../knowledge-capture/media/uploadWithProgress';
import { MediaAsset, MediaConfig, UploadProgress } from '../knowledge-capture/media/types';
import { useMachines } from '../knowledge-capture/hooks';
import { Machine } from '../knowledge-capture/types';
import { machineOptionLabel, selectableMachines } from '../machines/registeredMachines';


interface ProcedureStepDraft {
  clientId: string;
  title: string;
  instruction: string;
  expected_observation: string;
  safety_warning: string;
  is_critical: boolean;
  notes: string;
  asset_ids: string[];
}

type UploadKind = 'image' | 'video' | 'audio';
type EditorStage = 'edit' | 'review';

const fileAccept: Record<UploadKind, string> = {
  image: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  video: '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime',
  audio: '.webm,.mp3,.wav,.m4a,.ogg,.flac,audio/*',
};

const fallbackAllowedMimeTypes: Record<UploadKind, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/flac'],
};

const fileExtensionMime: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac',
};

const theme = {
  page: 'min-h-full bg-[#F5F8FC] text-[#173B5E]',
  panel: 'rounded-2xl border border-[#E2E8F0] bg-white shadow-sm',
  muted: 'text-[#536779]',
};

function newStep(): ProcedureStepDraft {
  return {
    clientId: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '', instruction: '', expected_observation: '', safety_warning: '',
    is_critical: false, notes: '', asset_ids: [],
  };
}

function getFileMime(file: File): string {
  const declared = file.type.split(';')[0].trim().toLowerCase();
  if (declared) return declared;
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return fileExtensionMime[extension] || '';
}

function isSupportedFile(file: File, kind: UploadKind, allowed: string[]): boolean {
  const mime = getFileMime(file);
  return Boolean(mime && allowed.includes(mime) && fallbackAllowedMimeTypes[kind].includes(mime));
}

function AssetPreview({ asset }: { asset: MediaAsset }) {
  if (!asset.url) return <p className="text-xs text-[#536779]">Preview is unavailable for this asset.</p>;
  const source = getApiUrl(asset.url);
  if (asset.kind === 'image') return <img src={source} alt={asset.title || asset.original_name} className="mt-2 max-h-48 max-w-full rounded-lg border border-[#E2E8F0] object-contain" />;
  if (asset.kind === 'video') return <video src={source} controls preload="metadata" className="mt-2 max-h-56 w-full rounded-lg bg-slate-950" aria-label={`Preview ${asset.title || asset.original_name}`} />;
  if (asset.kind === 'audio') return <audio src={source} controls preload="metadata" className="mt-2 w-full" aria-label={`Preview ${asset.title || asset.original_name}`} />;
  if (asset.kind === 'document') return <a href={source} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-[#1976C9] underline">Open document</a>;
  if (asset.kind === 'notes') return <p className="mt-2 whitespace-pre-wrap text-sm text-[#536779]">{asset.content || 'Saved note'}</p>;
  return null;
}

export const ProcedureCreatePage: React.FC = () => {
  const machineQuery = useMachines();
  const machines = selectableMachines(machineQuery.data?.items ?? []) as Machine[];
  const [machineId, setMachineId] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetLoadError, setAssetLoadError] = useState('');
  const [mediaConfig, setMediaConfig] = useState<MediaConfig | undefined>();
  const [mediaConfigError, setMediaConfigError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [safetyWarnings, setSafetyWarnings] = useState('');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [steps, setSteps] = useState<ProcedureStepDraft[]>([]);
  const [editorStage, setEditorStage] = useState<EditorStage>('edit');
  const [savedProcedureId, setSavedProcedureId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState('');
  const [stepToRemove, setStepToRemove] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingStepId, setUploadingStepId] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [operation, setOperation] = useState('');
  const [searchParams] = useSearchParams();
  const sourceWorkflowId = searchParams.get('from');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceArchived, setSourceArchived] = useState(false);

  // "Edit steps" opens an existing workflow here; saving creates a new workflow so in-progress runs keep their steps.
  useEffect(() => {
    if (!sourceWorkflowId) return;
    let active = true;
    Promise.all([
      api.get<{ title: string; description: string; machine_id: string; operation?: string | null; prerequisites?: string | null; safety_warnings?: string | null; steps: { title: string; instruction: string; expected_observation?: string | null; safety_warning?: string | null; is_critical: boolean; details?: Record<string, unknown> }[] }>(`/procedures/${encodeURIComponent(sourceWorkflowId)}`),
      api.get<{ id: string }[]>(`/procedures/${encodeURIComponent(sourceWorkflowId)}/assets`),
    ]).then(([source, sourceAssets]) => {
      if (!active) return;
      const stepIds = (step: { details?: Record<string, unknown> }) => Array.isArray(step.details?.asset_ids) ? (step.details?.asset_ids as unknown[]).filter((id): id is string => typeof id === 'string') : [];
      const stepAssetIds = new Set(source.steps.flatMap(stepIds));
      setSourceTitle(source.title);
      setMachineId(source.machine_id);
      setTitle(source.title);
      setDescription(source.description);
      setOperation(source.operation || '');
      setPrerequisites(source.prerequisites || '');
      setSafetyWarnings(source.safety_warnings || '');
      setAssetIds(sourceAssets.map(asset => asset.id).filter(id => !stepAssetIds.has(id)));
      setSteps(source.steps.map(step => ({
        ...newStep(),
        title: step.title, instruction: step.instruction, expected_observation: step.expected_observation || '',
        safety_warning: step.safety_warning || '', is_critical: step.is_critical,
        notes: typeof step.details?.notes === 'string' ? step.details.notes : '', asset_ids: stepIds(step),
      })));
    }).catch(cause => { if (active) setError(`The workflow to edit could not be loaded: ${cause instanceof Error ? cause.message : 'unknown error'}`); });
    return () => { active = false; };
  }, [sourceWorkflowId]);

  const archiveSource = async () => {
    if (!sourceWorkflowId) return;
    try {
      await api.post(`/procedures/${encodeURIComponent(sourceWorkflowId)}/archive`, {});
      setSourceArchived(true);
      setStatus('The original workflow is archived. Trainees now see only the new version.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The original workflow could not be archived.'); }
  };

  const selectedMachine = useMemo(() => machines.find(machine => machine.id === machineId), [machineId, machines]);

  useEffect(() => {
    let active = true;
    mediaApi.getConfig().then(config => { if (active) setMediaConfig(config); }).catch(() => {
      if (active) setMediaConfigError('Upload rules could not be loaded. File uploads will still be checked by the server.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!machineId) {
      setAssets([]); setAssetLoadError(''); setAssetsLoading(false);
      return;
    }
    let active = true;
    setAssets([]); setAssetLoadError(''); setAssetsLoading(true);
    api.get<MediaAsset[]>(`/machine-knowledge/${encodeURIComponent(machineId)}/media`)
      .then(result => { if (active) setAssets(result); })
      .catch(() => { if (active) setAssetLoadError('Could not load this machine’s knowledge assets. Retry before attaching existing files.'); })
      .finally(() => { if (active) setAssetsLoading(false); });
    return () => { active = false; };
  }, [machineId]);

  useEffect(() => {
    if (editorStage === 'edit' && editingStepId) {
      const stepElement = document.getElementById(`procedure-step-${editingStepId}`);
      if (typeof stepElement?.scrollIntoView === 'function') {
        stepElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setEditingStepId('');
    }
  }, [editorStage, editingStepId]);

  const changeMachine = (nextMachineId: string) => {
    if (nextMachineId !== machineId && (assetIds.length || steps.some(step => step.asset_ids.length))) {
      setAssetIds([]);
      setSteps(current => current.map(step => ({ ...step, asset_ids: [] })));
      setStatus('Knowledge references from the previous machine were unlinked. Their original files remain in that machine’s library.');
    }
    setMachineId(nextMachineId);
    setError('');
    setAssetLoadError('');
  };

  const updateStep = (stepId: string, changes: Partial<ProcedureStepDraft>) => {
    setSteps(current => current.map(step => step.clientId === stepId ? { ...step, ...changes } : step));
  };

  const addStep = () => {
    const step = newStep();
    setSteps(current => [...current, step]);
    setEditingStepId(step.clientId);
    setError('');
  };

  const moveStep = (stepIndex: number, direction: -1 | 1) => {
    const targetIndex = stepIndex + direction;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    setSteps(current => {
      const reordered = [...current];
      [reordered[stepIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[stepIndex]];
      return reordered;
    });
  };

  const toggleStepAsset = (stepId: string, assetId: string, checked: boolean) => {
    setSteps(current => current.map(step => step.clientId !== stepId ? step : {
      ...step,
      asset_ids: checked
        ? Array.from(new Set([...step.asset_ids, assetId]))
        : step.asset_ids.filter(id => id !== assetId),
    }));
  };

  const uploadStepFile = async (stepId: string, file: File, kind: UploadKind, onProgress?: (progress: UploadProgress) => void): Promise<MediaAsset> => {
    if (!machineId) throw new Error('Choose a machine before uploading procedure media.');
    const allowed = mediaConfig?.allowed_mime_types?.[kind] ?? fallbackAllowedMimeTypes[kind];
    if (!isSupportedFile(file, kind, allowed)) {
      throw new Error(`Choose a supported ${kind} file (${allowed.join(', ')}).`);
    }
    if (!file.size) throw new Error('The selected file is empty. Choose a non-empty media file.');
    const maxBytes = mediaConfig?.max_upload_bytes ?? 100 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error(`File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB upload limit.`);
    setUploadingStepId(stepId);
    setUploadProgress(0);
    setError('');
    try {
      const asset = await uploadWithProgress('', file, {
        endpoint: `/machine-knowledge/${encodeURIComponent(machineId)}/media`,
        kind,
        title: file.name,
        onProgress: progress => { setUploadProgress(progress.percent); onProgress?.(progress); },
      });
      setAssets(current => [asset, ...current.filter(existing => existing.id !== asset.id)]);
      setSteps(current => current.map(step => step.clientId === stepId
        ? { ...step, asset_ids: Array.from(new Set([...step.asset_ids, asset.id])) }
        : step));
      setStatus(`${file.name} uploaded to ${selectedMachine?.name || 'the selected machine'} and attached to its procedure step.`);
      return asset;
    } finally {
      setUploadingStepId('');
    }
  };

  const handleFileSelection = (stepId: string, kind: UploadKind, file?: File) => {
    if (!file) return;
    void uploadStepFile(stepId, file, kind).catch(cause => setError(cause instanceof Error ? cause.message : 'Media upload failed.'));
  };

  const validate = (): string | null => {
    if (!selectedMachine && !machineId) return 'Choose a registered machine.';
    if (!title.trim()) return 'Enter a procedure title.';
    if (!description.trim()) return 'Enter a procedure summary.';
    if (!steps.length) return 'Add at least one procedure step.';
    const incomplete = steps.findIndex(step => !step.title.trim() || !step.instruction.trim());
    if (incomplete >= 0) return `Complete the title and instructions for Step ${incomplete + 1}.`;
    if (uploadingStepId) return 'Wait for the current media upload to finish.';
    return null;
  };

  const openReview = () => {
    setError(''); setStatus('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      return;
    }
    setEditorStage('review');
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };

  const save = async () => {
    if (busy || savedProcedureId) return;
    setError(''); setStatus('');
    const validationError = validate();
    if (validationError) { setEditorStage('edit'); setError(validationError); return; }
    setBusy(true);
    try {
      const created = await api.post<{ id: string }>('/procedures', {
        title: title.trim(),
        description: description.trim(),
        machine_id: machineId,
        prerequisites: prerequisites.trim() || undefined,
        safety_warnings: safetyWarnings.trim() || undefined,
        operation: operation.trim() || undefined,
        steps: steps.map(step => ({
          title: step.title.trim(),
          instruction: step.instruction.trim(),
          expected_observation: step.expected_observation.trim() || undefined,
          safety_warning: step.safety_warning.trim() || undefined,
          is_critical: step.is_critical,
          notes: step.notes.trim() || undefined,
          asset_ids: step.asset_ids,
        })),
        asset_ids: assetIds,
      });
      setSavedProcedureId(created.id);
      setStatus('Procedure is now live in Guided Workflows.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Procedure could not be saved.'); }
    finally { setBusy(false); }
  };

  const startAnotherProcedure = () => {
    setSavedProcedureId(null);
    setMachineId(''); setTitle(''); setDescription(''); setPrerequisites(''); setSafetyWarnings(''); setOperation('');
    setAssetIds([]); setSteps([]); setEditorStage('edit'); setEditingStepId('');
    setError('');
    setStatus('Procedure created. Start another one here.');
  };

  const allReferencedAssetIds = useMemo(() => new Set([...assetIds, ...steps.flatMap(step => step.asset_ids)]), [assetIds, steps]);
  const referencedAssets = useMemo(() => assets.filter(asset => allReferencedAssetIds.has(asset.id)), [allReferencedAssetIds, assets]);

  return <main className={`${theme.page} mx-auto w-full max-w-5xl space-y-6 px-4 py-6 font-sans sm:px-6 lg:px-8`}>
    <header>
      <Link to="/app/knowledge-assets" className="text-sm font-semibold text-[#1976C9] underline">← Machine knowledge</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex rounded-full border border-[#1976C9]/20 bg-[#EFF4FF] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#1976C9]">Expert workspace · Procedure authoring</span>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Create a machine procedure</h1>
          <p className={`mt-1 max-w-2xl text-sm leading-6 ${theme.muted}`}>Build and review an ordered procedure using registered equipment and its existing knowledge assets.</p>
          <Link to="/app/guided-workflows" className="mt-3 inline-block text-sm font-semibold text-[#1976C9] underline">Open guided workflows</Link>
        </div>
        {editorStage === 'review' && <div className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#536779]">Review before saving</div>}
      </div>
    </header>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {sourceWorkflowId && sourceTitle && <div className="rounded-xl border border-[#C8DCE7] bg-[#F4F8FA] p-3 text-sm text-[#17324D]">
      <p>Editing a copy of <span className="font-bold">{sourceTitle}</span>. Saving publishes it as a new workflow; the original stays available until you archive it.</p>
      {savedProcedureId && !sourceArchived && <button type="button" onClick={() => void archiveSource()} className="mt-2 rounded-full bg-[#176E8A] px-4 py-2 text-xs font-bold text-white">Archive the original workflow</button>}
    </div>}
    {status && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{status}</p>}

    {editorStage === 'edit' ? <>
      <section className={`${theme.panel} space-y-4 p-4 sm:p-6`} aria-label="Procedure details">
        <h2 className="text-lg font-bold">Procedure details</h2>
        <label className="block text-sm font-semibold">Machine
          <select className="mt-2 block w-full rounded-lg border border-[#C8D6E4] bg-white p-3" value={machineId} onChange={event => changeMachine(event.target.value)}>
            <option value="">Select a registered machine…</option>{machines.map(machine => <option key={machine.id} value={machine.id}>{machineOptionLabel(machine)}</option>)}
          </select>
        </label>
        {machineQuery.isLoading && <p role="status" className="text-xs text-slate-500">Loading registered equipment…</p>}
        {machineQuery.isError && <p role="alert" className="text-xs text-red-700">Could not load registered machines. Retry the page before creating a procedure.</p>}
        {!machineQuery.isLoading && !machineQuery.isError && machines.length === 0 && <p role="status" className="text-xs text-slate-600">No active equipment is registered. <Link className="font-semibold text-[#1976C9] underline" to="/app/machines">Register equipment</Link> before creating a procedure.</p>}
        <label className="block text-sm font-semibold">Procedure title<input className="mt-2 w-full rounded-lg border border-[#C8D6E4] p-3 font-normal" placeholder="e.g. CT-Scan startup inspection" value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label className="block text-sm font-semibold">Category <span className="font-normal text-[#536779]">(optional)</span><input className="mt-2 w-full rounded-lg border border-[#C8D6E4] p-3 font-normal" placeholder="e.g. Startup, Calibration, Shutdown" maxLength={120} value={operation} onChange={event => setOperation(event.target.value)} /></label>
        <label className="block text-sm font-semibold">Summary<textarea className="mt-2 w-full rounded-lg border border-[#C8D6E4] p-3 font-normal" placeholder="Describe the scope and intended outcome" rows={3} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label className="block text-sm font-semibold">Prerequisites <span className="font-normal text-[#536779]">(optional)</span><textarea className="mt-2 w-full rounded-lg border border-[#C8D6E4] p-3 font-normal" placeholder="Required preparation or conditions" rows={2} value={prerequisites} onChange={event => setPrerequisites(event.target.value)} /></label>
        <label className="block text-sm font-semibold">Procedure-wide safety warnings <span className="font-normal text-[#536779]">(optional)</span><textarea className="mt-2 w-full rounded-lg border border-[#C8D6E4] p-3 font-normal" placeholder="Safety cautions for the full procedure" rows={2} value={safetyWarnings} onChange={event => setSafetyWarnings(event.target.value)} /></label>
      </section>

      <section className={`${theme.panel} space-y-4 p-4 sm:p-6`} aria-labelledby="procedure-steps-heading">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] pb-4">
          <div><h2 id="procedure-steps-heading" className="text-lg font-bold">Procedure Steps</h2><p className={`mt-1 text-sm ${theme.muted}`}>Create each checkpoint separately. Every step needs a title and clear instruction.</p></div>
          {steps.length > 0 && <span className="rounded-full bg-[#EFF4FF] px-3 py-1 text-xs font-bold text-[#1976C9]">{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>}
        </div>

        {steps.length === 0 ? <div className="rounded-xl border border-dashed border-[#C8D6E4] bg-[#F8FAFC] px-5 py-8 text-center">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#EFF4FF] text-[#1976C9]"><Plus size={22} /></div>
          <h3 className="mt-3 font-semibold">No steps added yet</h3>
          <p className={`mt-1 text-sm ${theme.muted}`}>Start with the first verified procedure checkpoint.</p>
          <Button type="button" className="mt-4" onClick={addStep}><Plus size={16} className="mr-1.5" />Add First Step</Button>
        </div> : <div className="space-y-4">
          {steps.map((step, index) => {
            const attached = assets.filter(asset => step.asset_ids.includes(asset.id));
            const stepUploading = uploadingStepId === step.clientId;
            return <article id={`procedure-step-${step.clientId}`} key={step.clientId} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg border border-[#E2E8F0] bg-[#EFF4FF] text-sm font-bold text-[#1976C9]">{index + 1}</span><div><h3 className="font-bold">Step {index + 1}</h3><p className="text-xs text-[#536779]">Checkpoint details and related knowledge</p></div></div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="sm" aria-label={`Move Step ${index + 1} up`} disabled={index === 0 || busy || Boolean(uploadingStepId)} onClick={() => moveStep(index, -1)}><ArrowUp size={15} /></Button>
                  <Button type="button" variant="outline" size="sm" aria-label={`Move Step ${index + 1} down`} disabled={index === steps.length - 1 || busy || Boolean(uploadingStepId)} onClick={() => moveStep(index, 1)}><ArrowDown size={15} /></Button>
                  <Button type="button" variant="outline" size="sm" aria-label={`Remove Step ${index + 1}`} disabled={busy || Boolean(uploadingStepId)} onClick={() => setStepToRemove(step.clientId)}><Trash2 size={15} className="text-red-600" /><span className="sr-only">Remove step</span></Button>
                </div>
              </div>

              <div className="grid gap-4">
                <label className="block text-sm font-semibold">Step title<input className="mt-1.5 w-full rounded-lg border border-[#C8D6E4] bg-white p-3 font-normal" placeholder="Short checkpoint title" value={step.title} onChange={event => updateStep(step.clientId, { title: event.target.value })} /></label>
                <label className="block text-sm font-semibold">Instructions<textarea className="mt-1.5 w-full rounded-lg border border-[#C8D6E4] bg-white p-3 font-normal" placeholder="Describe the required action using approved procedure content" rows={3} value={step.instruction} onChange={event => updateStep(step.clientId, { instruction: event.target.value })} /></label>
                <label className="block text-sm font-semibold">Expected observation <span className="font-normal text-[#536779]">(optional)</span><textarea className="mt-1.5 w-full rounded-lg border border-[#C8D6E4] bg-white p-3 font-normal" placeholder="What should the expert observe or confirm?" rows={2} value={step.expected_observation} onChange={event => updateStep(step.clientId, { expected_observation: event.target.value })} /></label>
                <label className="block text-sm font-semibold">Step safety warning <span className="font-normal text-[#536779]">(optional)</span><textarea className="mt-1.5 w-full rounded-lg border border-[#C8D6E4] bg-white p-3 font-normal" placeholder="Add an approved caution for this checkpoint" rows={2} value={step.safety_warning} onChange={event => updateStep(step.clientId, { safety_warning: event.target.value })} /></label>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={step.is_critical} onChange={event => updateStep(step.clientId, { is_critical: event.target.checked })} /><span><span className="font-semibold">Critical verification step</span><span className="mt-0.5 block text-xs text-[#536779]">Mark only when the checkpoint requires verification during guided execution.</span></span></label>
              </div>

              <div className="mt-5 border-t border-[#E2E8F0] pt-4">
                <div className="flex items-center gap-2"><Paperclip size={16} className="text-[#1976C9]" /><h4 className="font-semibold">Step attachments</h4></div>
                <p className={`mt-1 text-xs ${theme.muted}`}>Attach existing machine knowledge by reference, or upload a supported file. Removing it here only unlinks it from this procedure.</p>
                {mediaConfigError && <p role="status" className="mt-2 text-xs text-amber-800">{mediaConfigError}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['image', 'video', 'audio'] as UploadKind[]).map(kind => <label key={kind} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#1976C9] hover:bg-[#EFF4FF] ${stepUploading ? 'pointer-events-none opacity-60' : ''}`}>
                    {kind === 'image' ? <ImageIcon size={15} /> : kind === 'video' ? <Video size={15} /> : <FileAudio size={15} />}
                    {kind === 'image' ? 'Add Image/Photo' : kind === 'video' ? 'Add Video' : 'Add Audio'}
                    <input className="sr-only" type="file" accept={fileAccept[kind]} aria-label={`${kind === 'image' ? 'Add Image/Photo' : `Add ${kind[0].toUpperCase()}${kind.slice(1)}`} to Step ${index + 1}`} disabled={!machineId || stepUploading || busy} onChange={event => { handleFileSelection(step.clientId, kind, event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
                  </label>)}
                  <Button type="button" variant="outline" size="sm" aria-expanded={Boolean(step.notes)} onClick={() => { if (!step.notes) updateStep(step.clientId, { notes: ' ' }); }}><FileText size={15} className="mr-1.5" />{step.notes.trim() ? 'Notes added' : 'Add Notes'}</Button>
                </div>

                {step.notes !== '' && <label className="mt-3 block text-sm font-semibold">Step notes<textarea className="mt-1.5 w-full rounded-lg border border-[#C8D6E4] bg-white p-3 font-normal" placeholder="Add contextual notes for this procedure step" rows={3} value={step.notes.trimStart()} onChange={event => updateStep(step.clientId, { notes: event.target.value })} /></label>}

                {machineId && <fieldset className="mt-4 space-y-2 rounded-lg border border-[#E2E8F0] bg-white p-3">
                  <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[#536779]">Use existing machine knowledge</legend>
                  {assetsLoading ? <p role="status" className="text-sm text-[#536779]">Loading {selectedMachine?.name || 'machine'} knowledge…</p>
                    : assetLoadError ? <p role="alert" className="text-sm text-red-700">{assetLoadError}</p>
                    : assets.length ? <div className="grid gap-2 sm:grid-cols-2">{assets.map(asset => <label key={asset.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#E2E8F0] p-2.5 text-sm hover:bg-[#F8FAFC]">
                      <input type="checkbox" className="mt-0.5" checked={step.asset_ids.includes(asset.id)} onChange={event => toggleStepAsset(step.clientId, asset.id, event.target.checked)} />
                      <span className="min-w-0"><span className="block truncate font-semibold">{asset.title || asset.original_name}</span><span className="text-xs text-[#536779]">{asset.kind} · {asset.original_name}</span></span>
                    </label>)}</div>
                    : <p className="text-sm text-[#536779]">No knowledge assets are available for this machine.</p>}
                </fieldset>}

                {attached.length > 0 && <ul className="mt-3 space-y-3" aria-label={`Step ${index + 1} attachments`}>{attached.map(asset => <li key={asset.id} className="rounded-lg border border-[#E2E8F0] bg-white p-3">
                  <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Paperclip size={14} className="shrink-0 text-[#1976C9]" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{asset.title || asset.original_name}</p><p className="text-xs text-[#536779]">{asset.kind} · Machine knowledge asset</p></div></div>
                    <Button type="button" variant="outline" size="sm" onClick={() => toggleStepAsset(step.clientId, asset.id, false)} aria-label={`Remove ${asset.title || asset.original_name} from Step ${index + 1}`}>Remove</Button></div>
                  <AssetPreview asset={asset} />
                </li>)}</ul>}
                {stepUploading && <div className="mt-3" role="status"><div className="flex items-center justify-between text-xs text-[#536779]"><span className="inline-flex items-center gap-2"><LoaderCircle size={14} className="animate-spin text-[#1976C9]" />Uploading media…</span><span>{uploadProgress}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F8FAFC]"><div className="h-full bg-[#1976C9] transition-all" style={{ width: `${uploadProgress}%` }} /></div></div>}
                {machineId && <div className="mt-3 space-y-2"><h5 className="text-sm font-semibold">Add Voice Recording</h5><AudioRecorder
                  versionId="procedure-step"
                  config={mediaConfig}
                  onUploadFile={(file, onProgress) => uploadStepFile(step.clientId, file, 'audio', onProgress)}
                  onUploaded={() => undefined}
                /></div>}
              </div>
            </article>;
          })}
          <Button type="button" variant="outline" onClick={addStep} disabled={busy || Boolean(uploadingStepId)}><Plus size={16} className="mr-1.5" />Add Next Step</Button>
        </div>}
      </section>

      {machineId && <section className={`${theme.panel} space-y-3 p-4 sm:p-5`} aria-label="Procedure-wide knowledge references">
        <div className="flex items-center gap-2"><Paperclip size={16} className="text-[#1976C9]" /><h2 className="font-bold">Procedure-wide references <span className="font-normal text-[#536779]">(optional)</span></h2></div>
        <p className={`text-sm ${theme.muted}`}>Use this for files that apply to the full procedure. Step-specific media can be attached in each step above.</p>
        {assetsLoading ? <p role="status" className="text-sm text-[#536779]">Loading machine knowledge…</p> : assetLoadError ? <p role="alert" className="text-sm text-red-700">{assetLoadError}</p> : assets.length ? <div className="grid gap-2 sm:grid-cols-2">{assets.map(asset => <label key={asset.id} className="flex items-start gap-2 rounded-lg border border-[#E2E8F0] p-3 text-sm"><input type="checkbox" className="mt-0.5" checked={assetIds.includes(asset.id)} onChange={event => setAssetIds(current => event.target.checked ? Array.from(new Set([...current, asset.id])) : current.filter(id => id !== asset.id))} /><span className="min-w-0"><span className="block truncate font-semibold">{asset.title || asset.original_name}</span><span className="text-xs text-[#536779]">{asset.kind} · {asset.original_name}</span></span></label>)}</div> : <p className="text-sm text-[#536779]">No knowledge assets are available for this machine.</p>}
      </section>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[#536779]">Only approved source content should be used for medical instructions. A media attachment is optional.</p>
        {steps.length > 0 && <Button type="button" disabled={busy || Boolean(uploadingStepId) || machineQuery.isLoading || machineQuery.isError || machines.length === 0} onClick={openReview}>Finish Procedure <ArrowDown className="ml-2 rotate-[-90deg]" size={16} /></Button>}
      </div>
    </> : <>
      <section className={`${theme.panel} space-y-5 p-4 sm:p-6`} aria-labelledby="review-procedure-heading">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] pb-4"><div><h2 id="review-procedure-heading" className="text-xl font-bold">Review Procedure</h2><p className={`mt-1 text-sm ${theme.muted}`}>Confirm the machine, instructions, sequence, and referenced assets before saving.</p></div><span className="rounded-full border border-[#E2E8F0] bg-[#EFF4FF] px-3 py-1 text-xs font-bold text-[#1976C9]">{steps.length} checkpoints</span></div>
        {savedProcedureId && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Procedure is live in <Link to="/app/guided-workflows" className="font-semibold underline">Guided Workflows</Link>. This review is read-only; create another procedure to add more.</p>}
        <dl className="grid gap-4 rounded-xl bg-[#F8FAFC] p-4 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wide text-[#536779]">Selected machine</dt><dd className="mt-1 font-bold">{selectedMachine?.name}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-[#536779]">Procedure title</dt><dd className="mt-1 font-bold">{title}</dd></div><div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-[#536779]">Summary</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{description}</dd></div>
          {prerequisites?.trim() && <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-[#536779]">Prerequisites</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{prerequisites}</dd></div>}
          {safetyWarnings?.trim() && <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-amber-900">Safety warnings</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{safetyWarnings}</dd></div>}
        </dl>
        <ol className="space-y-4">{steps.map((step, index) => {
          const attached = assets.filter(asset => step.asset_ids.includes(asset.id));
          const unavailable = step.asset_ids.filter(id => !assets.some(asset => asset.id === id));
          return <li key={step.clientId} className="rounded-xl border border-[#E2E8F0] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EFF4FF] font-bold text-[#1976C9]">{index + 1}</span><div><h3 className="font-bold">{step.title || `Step ${index + 1} · Missing title`}</h3>{step.is_critical && <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Requires verification</span>}</div></div>{!savedProcedureId && <Button type="button" variant="outline" size="sm" onClick={() => { setEditingStepId(step.clientId); setEditorStage('edit'); }}><ArrowLeft size={14} className="mr-1" />Edit step</Button>}</div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{step.instruction}</p>
            {step.expected_observation?.trim() && <p className="mt-3 rounded-lg bg-[#F8FAFC] p-3 text-sm"><strong>Expected observation:</strong> {step.expected_observation}</p>}
            {step.safety_warning?.trim() && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Safety warning:</strong> {step.safety_warning}</p>}
            {step.notes?.trim() && <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3"><h4 className="text-xs font-bold uppercase tracking-wide text-[#536779]">Step notes</h4><p className="mt-1 whitespace-pre-wrap text-sm">{step.notes}</p></div>}
            {unavailable.length > 0 && <p role="alert" className="mt-3 text-sm text-red-700">{unavailable.length} selected asset(s) could not be verified. Return to editing and remove or reselect them.</p>}
            {attached.length > 0 && <div className="mt-4 space-y-3"><h4 className="text-sm font-semibold">Attachments</h4>{attached.map(asset => <div key={asset.id} className="rounded-lg border border-[#E2E8F0] bg-white p-3"><p className="text-sm font-semibold">{asset.title || asset.original_name} <span className="font-normal text-[#536779]">· {asset.kind}</span></p><AssetPreview asset={asset} /></div>)}</div>}
          </li>;
        })}</ol>
        {assetIds.length > 0 && <div className="rounded-xl border border-[#E2E8F0] p-4"><h3 className="font-semibold">Procedure-wide references</h3><ul className="mt-3 grid gap-3 sm:grid-cols-2">{assets.filter(asset => assetIds.includes(asset.id)).map(asset => <li key={asset.id} className="rounded-lg border border-[#E2E8F0] bg-white p-3"><p className="text-sm font-semibold">{asset.title || asset.original_name} <span className="font-normal text-[#536779]">· {asset.kind}</span></p><AssetPreview asset={asset} /></li>)}</ul>{assetIds.some(id => !assets.some(asset => asset.id === id)) && <p role="alert" className="mt-2 text-sm text-red-700">One or more procedure-wide assets are unavailable.</p>}</div>}
      </section>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">{savedProcedureId ? <Button type="button" onClick={startAnotherProcedure}>Create Another Procedure</Button> : <><Button type="button" variant="outline" disabled={busy} onClick={() => setEditorStage('edit')}><ArrowLeft size={16} className="mr-1.5" />Back to Edit</Button><Button type="button" disabled={busy || Boolean(uploadingStepId) || allReferencedAssetIds.size !== referencedAssets.length} onClick={() => void save()}>{busy ? 'Saving…' : 'Save Procedure'}</Button></> }</div>
    </>}

    {stepToRemove && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="remove-step-title"><div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5"><div><h2 id="remove-step-title" className="text-lg font-bold">Remove this procedure step?</h2><p className="mt-2 text-sm text-[#536779]">This removes the step and its references from this unsaved procedure. Machine knowledge files remain in the library.</p></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setStepToRemove(null)}>Keep step</Button><Button type="button" variant="danger" onClick={() => { setSteps(current => current.filter(step => step.clientId !== stepToRemove)); setStepToRemove(null); }}>Remove step</Button></div></div></div>}
  </main>;
};
