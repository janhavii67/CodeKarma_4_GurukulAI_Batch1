import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api/client';
import { Button } from '../../components/ui/Button';
import { fetchMachines } from '../knowledge-capture/knowledgeApi';
import { MachineListResponse } from '../knowledge-capture/types';
import { MediaAsset } from '../knowledge-capture/media/types';
import { getSupportedMachineOptions, getUnavailableSupportedMachineLabels } from '../machines/supportedMachines';

interface ProcedureDraft {
  id: string;
  title: string;
  description: string;
  machine_id: string | null;
  machine_name: string | null;
  status: string;
  steps: Array<{ id: string; title: string; instruction: string }>;
}

export const ProcedureCreatePage: React.FC = () => {
  const [machines, setMachines] = useState<MachineListResponse['items']>([]);
  const [machineId, setMachineId] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [safetyWarnings, setSafetyWarnings] = useState('');
  const [drafts, setDrafts] = useState<ProcedureDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProcedureDraft | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const machineOptions = getSupportedMachineOptions(machines);
  const unavailableMachines = getUnavailableSupportedMachineLabels(machines);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try { setDrafts(await api.get<ProcedureDraft[]>('/procedures/mine/drafts')); }
    catch { setError('Could not load your draft procedures.'); }
    finally { setDraftsLoading(false); }
  }, []);

  useEffect(() => {
    fetchMachines({ page_size: 100 }).then(result => setMachines(result.items)).catch(() => setError('Could not load registered machines.'));
    void loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    if (!machineId) { setAssets([]); setAssetIds([]); return; }
    setAssets([]); setAssetIds([]);
    api.get<MediaAsset[]>(`/machine-knowledge/${machineId}/media`).then(setAssets).catch(() => setError('Could not load machine assets.'));
  }, [machineId]);

  const save = async () => {
    if (busy) return;
    setError(''); setStatus('');
    const stepList = steps.split('\n').map(step => step.trim()).filter(Boolean).map((instruction, index) => ({ title: `Step ${index + 1}`, instruction }));
    if (!machineOptions.some(option => option.machine?.id === machineId) || !title.trim() || !description.trim() || !stepList.length) {
      setError('Choose a machine and provide a title, summary, and at least one procedure step.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/procedures', { title: title.trim(), description: description.trim(), machine_id: machineId, prerequisites, safety_warnings: safetyWarnings, steps: stepList, asset_ids: assetIds });
      setStatus('Procedure saved as a draft. It remains separate from its linked knowledge assets.');
      setTitle(''); setDescription(''); setSteps(''); setPrerequisites(''); setSafetyWarnings(''); setAssetIds([]);
      await loadDrafts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Procedure could not be saved.'); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      await api.delete(deleteTarget.id);
      setDrafts(current => current.filter(draft => draft.id !== deleteTarget.id));
      setStatus(`Draft “${deleteTarget.title}” deleted. Its linked knowledge assets remain in the machine library.`);
      setDeleteTarget(null);
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Procedure could not be deleted.'); }
    finally { setDeleting(false); }
  };

  return <main className="max-w-3xl mx-auto p-5 md:p-8 space-y-6">
    <header>
      <Link to="/app/knowledge-assets" className="text-sm text-blue-700 underline">← Machine knowledge</Link>
      <h1 className="text-2xl font-bold mt-3">Create a machine procedure</h1>
      <p className="text-sm text-slate-600 mt-1">Procedures are separate from knowledge assets. Attach existing assets without copying their files.</p>
      <Link to="/app/guided-workflows" className="inline-block mt-3 text-sm text-blue-700 underline">Open guided workflows</Link>
    </header>

    <section className="bg-white border rounded-2xl p-5 space-y-4" aria-label="Create procedure">
      <label className="block text-sm font-semibold">Machine
        <select className="mt-2 block w-full border rounded-lg p-3 bg-white" value={machineId} onChange={event => setMachineId(event.target.value)}>
          <option value="">Select a registered machine…</option>{machineOptions.map(({ label, machine }) => <option key={label} value={machine?.id || ''} disabled={!machine}>{label}</option>)}
        </select>
      </label>
      {unavailableMachines.length > 0 && <p className="text-xs text-amber-700">{unavailableMachines.join(', ')} {unavailableMachines.length === 1 ? 'is' : 'are'} not registered yet and cannot be selected. Existing machine records and procedures are unchanged.</p>}
      <input className="w-full border rounded-lg p-3" placeholder="Procedure title" value={title} onChange={event => setTitle(event.target.value)}/>
      <textarea className="w-full border rounded-lg p-3" placeholder="Summary" rows={3} value={description} onChange={event => setDescription(event.target.value)}/>
      <textarea className="w-full border rounded-lg p-3" placeholder="Prerequisites (optional)" value={prerequisites} onChange={event => setPrerequisites(event.target.value)}/>
      <textarea className="w-full border rounded-lg p-3" placeholder="Safety warnings (optional)" value={safetyWarnings} onChange={event => setSafetyWarnings(event.target.value)}/>
      <label className="block text-sm font-semibold">Steps <span className="font-normal text-slate-500">(one instruction per line)</span>
        <textarea className="mt-2 w-full border rounded-lg p-3" rows={6} value={steps} onChange={event => setSteps(event.target.value)}/>
      </label>
      {machineId && <fieldset className="space-y-2"><legend className="font-semibold text-sm">Attach existing machine assets</legend>
        {assets.length ? assets.map(asset => <label key={asset.id} className="flex items-center gap-2 text-sm border rounded-lg p-3"><input type="checkbox" checked={assetIds.includes(asset.id)} onChange={event => setAssetIds(current => event.target.checked ? [...current, asset.id] : current.filter(id => id !== asset.id))}/><span>{asset.title || asset.original_name}<span className="text-slate-500"> · {asset.kind}</span></span></label>) : <p className="text-sm text-slate-500">No assets are available for this machine.</p>}
      </fieldset>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {status && <p role="status" className="text-sm text-emerald-700">{status}</p>}
      <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save procedure'}</Button>
    </section>

    <section className="space-y-3" aria-labelledby="draft-procedures-heading">
      <h2 id="draft-procedures-heading" className="text-lg font-bold">My draft procedures</h2>
      {draftsLoading ? <p role="status" className="text-sm text-slate-500">Loading your drafts…</p> : drafts.length === 0 ? <p className="text-sm text-slate-500">You have no draft procedures.</p> : <div className="grid gap-3">{drafts.map(draft => <article key={draft.id} className="bg-white border rounded-xl p-4 flex items-start justify-between gap-4"><div><h3 className="font-semibold">{draft.title}</h3><p className="text-xs text-slate-500 mt-1">{draft.machine_name || 'Machine'} · {draft.steps.length} steps · Draft</p></div><Button type="button" variant="secondary" onClick={() => { setDeleteError(''); setDeleteTarget(draft); }}>Delete draft</Button></article>)}</div>}
    </section>

    {deleteTarget && <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-procedure-title">
      <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4"><div><h2 id="delete-procedure-title" className="text-lg font-bold">Delete draft procedure?</h2><p className="text-sm text-slate-600 mt-2">Delete “{deleteTarget.title}”? This cannot be undone. Linked knowledge files remain independently available. Procedures with execution history cannot be deleted.</p></div>
        {deleteError && <p role="alert" className="text-sm text-red-700">{deleteError}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button type="button" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? 'Deleting…' : 'Delete procedure'}</Button></div>
      </div>
    </div>}
  </main>;
};
