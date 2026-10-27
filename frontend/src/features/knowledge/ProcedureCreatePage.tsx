import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api/client';
import { fetchMachines } from '../knowledge-capture/knowledgeApi';
import { MachineListResponse } from '../knowledge-capture/types';
import { MediaAsset } from '../knowledge-capture/media/types';
import { Button } from '../../components/ui/Button';

export const ProcedureCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [machines, setMachines] = useState<MachineListResponse['items']>([]);
  const [machineId, setMachineId] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [safetyWarnings, setSafetyWarnings] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchMachines({page_size:100}).then(r=>setMachines(r.items)).catch(()=>setError('Could not load registered machines.')); }, []);
  useEffect(() => { if (!machineId) { setAssets([]); setAssetIds([]); return; } api.get<MediaAsset[]>(`/machine-knowledge/${machineId}/media`).then(setAssets).catch(()=>setError('Could not load machine assets.')); }, [machineId]);

  const save = async () => {
    setError('');
    const stepList = steps.split('\n').map(s=>s.trim()).filter(Boolean).map((instruction,i)=>({title:`Step ${i+1}`,instruction}));
    if (!machineId || !title.trim() || !description.trim() || !stepList.length) { setError('Choose a machine and provide a title, summary, and at least one procedure step.'); return; }
    setBusy(true);
    try {
      const created = await api.post<{id:string}>('/procedures', {title,description,machine_id:machineId,prerequisites,safety_warnings:safetyWarnings,steps:stepList,asset_ids:assetIds});
      navigate('/app/guided-workflows', {replace:true, state:{createdProcedureId:created.id}});
    } catch (e) { setError(e instanceof Error ? e.message : 'Procedure could not be saved.'); }
    finally { setBusy(false); }
  };
  return <main className="max-w-3xl mx-auto p-5 md:p-8 space-y-5"><header><Link to="/app/knowledge-assets" className="text-sm text-blue-700 underline">← Machine knowledge</Link><h1 className="text-2xl font-bold mt-3">Create a machine procedure</h1><p className="text-sm text-slate-600 mt-1">Procedures are separate from knowledge assets. Attach existing assets without copying their files.</p></header>
    <section className="bg-white border rounded-2xl p-5 space-y-4">
      <label className="block text-sm font-semibold">Machine<select className="mt-2 block w-full border rounded-lg p-3 bg-white" value={machineId} onChange={e=>setMachineId(e.target.value)}><option value="">Select a registered machine…</option>{machines.map(m=><option key={m.id} value={m.id}>{m.name}{m.code?` · ${m.code}`:''}</option>)}</select></label>
      <input className="w-full border rounded-lg p-3" placeholder="Procedure title" value={title} onChange={e=>setTitle(e.target.value)}/>
      <textarea className="w-full border rounded-lg p-3" placeholder="Summary" rows={3} value={description} onChange={e=>setDescription(e.target.value)}/>
      <textarea className="w-full border rounded-lg p-3" placeholder="Prerequisites (optional)" value={prerequisites} onChange={e=>setPrerequisites(e.target.value)}/>
      <textarea className="w-full border rounded-lg p-3" placeholder="Safety warnings (optional)" value={safetyWarnings} onChange={e=>setSafetyWarnings(e.target.value)}/>
      <label className="block text-sm font-semibold">Steps <span className="font-normal text-slate-500">(one instruction per line)</span><textarea className="mt-2 w-full border rounded-lg p-3" rows={6} value={steps} onChange={e=>setSteps(e.target.value)}/></label>
      {machineId && <fieldset className="space-y-2"><legend className="font-semibold text-sm">Attach existing machine assets</legend>{assets.length ? assets.map(a=><label key={a.id} className="flex items-center gap-2 text-sm border rounded-lg p-3"><input type="checkbox" checked={assetIds.includes(a.id)} onChange={e=>setAssetIds(curr=>e.target.checked?[...curr,a.id]:curr.filter(id=>id!==a.id))}/><span>{a.title||a.original_name}<span className="text-slate-500"> · {a.kind}</span></span></label>) : <p className="text-sm text-slate-500">No assets are available for this machine.</p>}</fieldset>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button type="button" disabled={busy} onClick={save}>{busy?'Saving…':'Save procedure'}</Button>
    </section>
  </main>;
};
