import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api/client';
import { mediaApi } from '../knowledge-capture/media/mediaApi';
import { fetchMachines } from '../knowledge-capture/knowledgeApi';
import { MachineListResponse } from '../knowledge-capture/types';
import { uploadWithProgress } from '../knowledge-capture/media/uploadWithProgress';
import { MediaAsset } from '../knowledge-capture/media/types';
import { getApiUrl } from '../../lib/api/client';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

type Kind = 'video' | 'image' | 'audio' | 'document' | 'notes';
const accepts: Record<Exclude<Kind, 'notes'>, string> = {
  video: '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime',
  image: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  audio: '.webm,.mp3,.wav,.m4a,.ogg,audio/*',
  document: '.pdf,application/pdf',
};

export const MachineKnowledgePage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const initial = (params.get('kind') || 'video').toLowerCase();
  const [kind, setKind] = useState<Kind>(['video','image','audio','document','notes'].includes(initial) ? initial as Kind : 'video');
  const [machines, setMachines] = useState<MachineListResponse['items']>([]);
  const [machineId, setMachineId] = useState('');
  const [machineSearch, setMachineSearch] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const [recordedPreview, setRecordedPreview] = useState('');
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [filter, setFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<MediaAsset | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [transcriptStatus, setTranscriptStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef<number>(0);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') { setFilePreview(''); return; }
    const url = URL.createObjectURL(file); setFilePreview(url); return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!recorded || typeof URL.createObjectURL !== 'function') { setRecordedPreview(''); return; }
    const url = URL.createObjectURL(recorded); setRecordedPreview(url); return () => URL.revokeObjectURL(url);
  }, [recorded]);
  useEffect(() => { if (!recording || paused) return; const timer = window.setInterval(() => setRecordDuration(Math.floor((Date.now()-startedAt.current)/1000)), 250); return () => window.clearInterval(timer); }, [recording, paused]);

  useEffect(() => { fetchMachines({ page_size: 100 }).then(r => setMachines(r.items)).catch(() => setError('Could not load registered machines.')); }, []);
  useEffect(() => {
    if (!machineId) { setAssets([]); return; }
    const type = filter === 'all' ? '' : `?kind=${encodeURIComponent(filter)}`;
    setLoadingAssets(true);
    api.get<MediaAsset[]>(`/machine-knowledge/${machineId}/media${type}`).then(setAssets).catch(() => setError('Could not load this machine’s knowledge.')).finally(()=>setLoadingAssets(false));
  }, [machineId, filter]);
  const changeKind = (next: Kind) => { setKind(next); setParams({ kind: next }); setFile(null); setStatus(''); setError(''); };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); const chunks: BlobPart[] = [];
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => { setRecorded(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); stream.getTracks().forEach(t => t.stop()); };
      mr.start(); startedAt.current = Date.now(); setRecordDuration(0); setRecorder(mr); setRecording(true); setPaused(false); setError('');
    } catch { setError('Microphone access was denied or is unavailable in this browser.'); }
  };
  const stopRecording = () => { recorder?.stop(); setRecording(false); setPaused(false); };

  const save = async () => {
    setError(''); setStatus('');
    if (!machineId) { setError('Choose the machine this knowledge belongs to.'); return; }
    if (kind === 'notes') {
      if (!title.trim() || !note.trim()) { setError('Add a title and note content.'); return; }
      setBusy(true);
      try {
        const form = new FormData(); form.append('title', title); form.append('content', note); form.append('description', description); form.append('tags', tags);
        const saved = await api.post<MediaAsset>(`/machine-knowledge/${machineId}/notes`, form);
        setAssets(prev => [saved, ...prev]);
        setStatus('Note saved to machine knowledge.'); setTitle(''); setNote('');
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not save note.'); }
      finally { setBusy(false); }
      return;
    }
    const recMime = recorded?.type.split(';')[0] || 'audio/webm';
    const recExt = recMime === 'audio/mp4' ? 'm4a' : recMime === 'audio/wav' ? 'wav' : recMime === 'audio/ogg' ? 'ogg' : recMime === 'audio/mpeg' ? 'mp3' : 'webm';
    const source = kind === 'audio' && recorded ? new File([recorded], `recording-${Date.now()}.${recExt}`, { type: recorded.type || 'audio/webm' }) : file;
    if (!source) { setError(kind === 'audio' ? 'Record audio or choose an audio file.' : 'Choose a file to upload.'); return; }
    const expected = kind === 'video' ? 'video/' : kind === 'image' ? 'image/' : kind === 'audio' ? 'audio/' : 'application/pdf';
    if (!source.type.startsWith(expected) || (kind === 'document' && source.type !== 'application/pdf')) { setError(`Choose a supported ${kind} file.`); return; }
    setBusy(true);
    try {
      setUploadProgress(0);
      const asset = await uploadWithProgress('', source, { endpoint: `/machine-knowledge/${machineId}/media`, kind: kind === 'image' ? 'image' : kind, title: title || source.name, description, tags, onProgress: progress => setUploadProgress(progress.percent) });
      setAssets(prev => [asset, ...prev]); setFile(null); setRecorded(null); setTitle(''); setDescription(''); setTags(''); setStatus('Knowledge saved to the selected machine.');
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed. Please retry.'); }
    finally { setBusy(false); }
  };

  const filteredAssets = assets.filter(a => (verificationFilter === 'all' || (a.verification_status || 'pending_review') === verificationFilter) && (!search || [a.title,a.description,a.tags,a.original_name,a.content].some(v => v?.toLowerCase().includes(search.toLowerCase()))));
  const removeAsset = (asset: MediaAsset) => { setError(''); setDeletingAsset(asset); };
  const confirmRemoveAsset = async () => {
    if (!deletingAsset) return;
    setBusy(true);
    setError('');
    try {
      await mediaApi.delete(deletingAsset.id);
      setAssets(prev => prev.filter(a => a.id !== deletingAsset.id));
      setSelectedAsset(current => current?.id === deletingAsset.id ? null : current);
      setDeletingAsset(null);
      setStatus('Asset deleted.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete asset.');
    } finally {
      setBusy(false);
    }
  };
  const editAsset = (asset: MediaAsset) => {
    setError('');
    setEditTitle(asset.title || asset.original_name);
    setEditDescription(asset.description || '');
    setEditTags(asset.tags || '');
    setEditingAsset(asset);
  };
  const saveMetadata = async () => {
    if (!editingAsset || !editTitle.trim()) { setError('Asset title is required.'); return; }
    setMetadataSaving(true);
    setError('');
    try {
      const updated = await api.patch<MediaAsset>(`/media/${editingAsset.id}`, {
        title: editTitle.trim(), description: editDescription, tags: editTags,
      });
      setAssets(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
      setSelectedAsset(current => current?.id === updated.id ? { ...current, ...updated } : current);
      setEditingAsset(null);
      setStatus('Asset details updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update asset.');
    } finally {
      setMetadataSaving(false);
    }
  };
  const loadTranscript = async (asset: MediaAsset) => {
    if (!asset.transcript_id) return;
    setTranscriptStatus(asset.transcript_status || 'Processing');
    try { const t = await api.get<any>(`/voice/transcripts/${asset.transcript_id}`); setTranscriptStatus(t.status); setSelectedAsset({...asset, content: t.full_text, transcript_status: t.status}); }
    catch { setTranscriptStatus(asset.transcript_status || 'Transcript not available yet.'); }
  };

  return <main className="max-w-5xl mx-auto p-5 md:p-8 space-y-6">
    <header className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-blue-600 font-bold">Machine Knowledge</p><h1 className="text-2xl font-bold text-slate-900 mt-1">Capture and browse knowledge</h1><p className="text-sm text-slate-600 mt-2">Knowledge assets are stored independently from procedures.</p></div><Link className="rounded-lg bg-slate-900 text-white text-sm px-4 py-2" to="/app/procedures/new">Create Procedure</Link></header>
    <section className="bg-white border rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap gap-2">{(['video','audio','notes','image','document'] as Kind[]).map(k => <button key={k} onClick={() => changeKind(k)} className={`px-4 py-2 rounded-full text-sm capitalize ${kind===k?'bg-blue-600 text-white':'bg-slate-100 text-slate-700'}`}>{k==='image'?'Photos':k==='document'?'Documents':k}</button>)}</div>
      <label className="block text-sm font-semibold">Which machine or equipment is this knowledge related to?
        <input aria-label="Search registered machines" value={machineSearch} onChange={e=>setMachineSearch(e.target.value)} placeholder="Search registered machines…" className="block w-full mt-2 border rounded-lg p-3" />
        <select aria-label="Machine" value={machineId} onChange={e => setMachineId(e.target.value)} className="block w-full mt-2 border rounded-lg p-3 bg-white"><option value="">Select a registered machine…</option>{machines.filter(m=>`${m.name} ${m.code||''} ${m.category||''}`.toLowerCase().includes(machineSearch.toLowerCase())).map(m => <option key={m.id} value={m.id}>{m.name}{m.code ? ` · ${m.code}` : ''}</option>)}</select>
      </label>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Knowledge title" className="w-full border rounded-lg p-3" />
      <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional description or observation" className="w-full border rounded-lg p-3" />
      <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="Optional tags, comma separated" className="w-full border rounded-lg p-3" />
      {kind==='notes' ? <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Write a machine observation or practical tip…" rows={5} className="w-full border rounded-lg p-3"/> : kind==='audio' ? <div className="space-y-3"><div className="flex gap-2">{!recording && !recorded && <Button type="button" onClick={startRecording}>Start recording</Button>}{recording && <><Button type="button" onClick={()=>{if(recorder?.state==='recording'){recorder.pause();setPaused(true)}else if(recorder?.state==='paused'){recorder.resume();setPaused(false)}}}>{paused?'Resume':'Pause'}</Button><Button type="button" onClick={stopRecording}>Stop recording</Button><span className="self-center text-sm tabular-nums">{Math.floor(recordDuration/60)}:{String(recordDuration%60).padStart(2,'0')} {paused?'Paused':'Recording'}</span></>}{recorded && <Button type="button" onClick={()=>{setRecorded(null);setFile(null);setRecordDuration(0)}}>Discard and record again</Button>}<input ref={inputRef} type="file" accept={accepts.audio} onChange={e=>setFile(e.target.files?.[0]||null)} /></div>{recorded && recordedPreview && <audio aria-label="Recorded audio preview" controls src={recordedPreview} className="w-full"/>}</div> : <><input ref={inputRef} type="file" accept={accepts[kind]} onChange={e=>setFile(e.target.files?.[0]||null)} className="block w-full"/>{file && <div className="text-sm">{file.name}{kind==='image' && filePreview && <img className="mt-2 max-h-56 rounded-lg" src={filePreview} alt="Upload preview"/>}{kind==='video' && filePreview && <video controls className="mt-2 max-h-56" src={filePreview}/>}</div>}</>}
      {busy && kind!=='notes' && <div className="space-y-1" role="status"><div className="flex justify-between text-xs text-slate-600"><span>Uploading to machine knowledge…</span><span>{uploadProgress}%</span></div><div className="h-2 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{width:`${uploadProgress}%`}}/></div></div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{status && <p role="status" className="text-sm text-emerald-700">{status}</p>}
      <Button type="button" disabled={busy} onClick={save}>{busy?'Saving…':'Save to machine knowledge'}</Button>
    </section>
    <section className="space-y-3"><h2 className="text-lg font-bold">Knowledge assets {machineId && `· ${machines.find(m=>m.id===machineId)?.name || ''}`}</h2>{machineId && <><input className="w-full border rounded-lg p-3" placeholder="Search this machine’s knowledge" value={search} onChange={e=>setSearch(e.target.value)}/><div className="flex flex-wrap gap-2">{[['all','All'],['video','Videos'],['audio','Audio Recordings'],['transcript','Transcripts'],['image','Images'],['notes','Notes'],['document','Documents']].map(([key,label])=><button key={key} onClick={()=>setFilter(key)} className={`px-3 py-1.5 rounded-full text-xs ${filter===key?'bg-slate-900 text-white':'bg-slate-100'}`}>{label}</button>)}<select aria-label="Verification status" className="border rounded-full px-3 py-1.5 text-xs" value={verificationFilter} onChange={e=>setVerificationFilter(e.target.value)}><option value="all">All verification states</option><option value="pending_review">Pending review</option></select></div></>}{!machineId ? <p className="text-sm text-slate-500">Select a machine to browse its knowledge.</p> : loadingAssets ? <p role="status" className="text-sm text-slate-500">Loading machine knowledge…</p> : filteredAssets.length===0 ? <p className="text-sm text-slate-500">No {filter==='all'?'knowledge assets':filter==='video'?'videos':filter==='audio'?'audio recordings':filter==='transcript'?'transcripts':filter==='image'?'images':filter==='notes'?'notes':'documents'} have been added to this machine yet.</p> : <div className="grid gap-3 sm:grid-cols-2">{filteredAssets.map(a=><article key={a.id} className="bg-white border rounded-xl p-4"><button className="font-semibold text-left" onClick={()=>setSelectedAsset(a)}>{a.title || a.original_name}</button><div className="text-xs text-slate-500 mt-1">{a.kind} · {new Date(a.created_at).toLocaleDateString()} · {a.author_name || 'Unknown author'} · {a.verification_status || 'Pending review'}</div>{a.description && <p className="text-sm mt-2">{a.description}</p>}<div className="flex gap-3 mt-3"><button className="text-sm text-blue-700 underline" onClick={()=>setSelectedAsset(a)}>Details / Preview</button>{a.kind!=='transcript' && <><button className="text-sm text-blue-700 underline" onClick={()=>editAsset(a)}>Edit</button><button className="text-sm text-red-700 underline" onClick={()=>removeAsset(a)}>Delete</button></>}</div>{a.transcript_id && <button className="text-xs text-indigo-700 underline mt-2" onClick={()=>loadTranscript(a)}>Transcript · {a.transcript_status || 'Processing'}</button>}</article>)}</div>}</section>
    {selectedAsset && <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true"><div className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-3"><div className="flex justify-between gap-3"><h2 className="font-bold text-lg">{selectedAsset.title || selectedAsset.original_name}</h2><button onClick={()=>setSelectedAsset(null)} aria-label="Close details">×</button></div><p className="text-xs text-slate-500">{selectedAsset.kind} · {new Date(selectedAsset.created_at).toLocaleString()} · {machines.find(m=>m.id===selectedAsset.machine_id)?.name || machines.find(m=>m.id===machineId)?.name}</p>{selectedAsset.description && <p>{selectedAsset.description}</p>}{selectedAsset.kind==='notes'||selectedAsset.kind==='transcript' ? <><textarea className="w-full min-h-48 border rounded-lg p-3" readOnly={selectedAsset.kind==='transcript'} value={selectedAsset.content || ''} onChange={e=>setSelectedAsset({...selectedAsset,content:e.target.value})}/>{selectedAsset.kind==='notes' && <Button type="button" onClick={async()=>{try{const updated=await api.patch<MediaAsset>(`/media/${selectedAsset.id}`,{content:selectedAsset.content});setAssets(prev=>prev.map(a=>a.id===updated.id?{...a,...updated,content:selectedAsset.content}:a));setStatus('Note saved.');}catch(e){setError(e instanceof Error?e.message:'Could not save note.');}}}>Save note</Button>}{selectedAsset.kind==='transcript' && <Button type="button" onClick={async()=>{try{await api.patch(`/voice/transcripts/${selectedAsset.transcript_id}`,{full_text:selectedAsset.content});setStatus('Transcript updated.');}catch(e){setError(e instanceof Error?e.message:'Could not update transcript.');}}}>Save transcript edit</Button>}</> : selectedAsset.kind==='video' ? <video controls className="w-full max-h-96" src={getApiUrl(`/media/${selectedAsset.id}`)}/> : selectedAsset.kind==='audio' ? <audio controls className="w-full" src={getApiUrl(`/media/${selectedAsset.id}`)}/> : selectedAsset.kind==='image' ? <img alt={selectedAsset.title || 'Knowledge image'} src={getApiUrl(`/media/${selectedAsset.id}`)} className="max-h-96 mx-auto"/> : <a href={getApiUrl(`/media/${selectedAsset.id}`)} target="_blank" rel="noreferrer" className="text-blue-700 underline">Open document</a>}{selectedAsset.kind==='audio' && <p className="text-xs text-slate-500">Transcription: {transcriptStatus || selectedAsset.transcript_status || 'Unavailable unless speech service is configured.'}</p>}</div></div>}
    {editingAsset && <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-asset-title"><form className="bg-white rounded-2xl max-w-xl w-full p-5 space-y-4" onSubmit={event => { event.preventDefault(); void saveMetadata(); }}><div><h2 id="edit-asset-title" className="text-lg font-bold">Edit knowledge asset</h2><p className="text-sm text-slate-600">Update the asset metadata without changing its machine association or review status.</p></div><label className="block text-sm font-medium">Title<input aria-label="Asset title" value={editTitle} onChange={event => setEditTitle(event.target.value)} className="block w-full mt-1 border rounded-lg p-2.5" required /></label><label className="block text-sm font-medium">Description<textarea aria-label="Asset description" value={editDescription} onChange={event => setEditDescription(event.target.value)} className="block w-full mt-1 border rounded-lg p-2.5" rows={3}/></label><label className="block text-sm font-medium">Tags<input aria-label="Asset tags" value={editTags} onChange={event => setEditTags(event.target.value)} className="block w-full mt-1 border rounded-lg p-2.5" /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditingAsset(null)}>Cancel</Button><Button type="submit" disabled={metadataSaving}>{metadataSaving ? 'Saving…' : 'Save changes'}</Button></div></form></div>}
    {deletingAsset && <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-asset-title"><div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4"><div><h2 id="delete-asset-title" className="text-lg font-bold">Delete knowledge asset?</h2><p className="text-sm text-slate-600 mt-2">This will delete “{deletingAsset.title || deletingAsset.original_name}” from its machine library and remove its stored file. Referenced assets cannot be deleted.</p></div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setDeletingAsset(null); setError(''); }}>Cancel</Button><Button type="button" disabled={busy} onClick={() => void confirmRemoveAsset()}>{busy ? 'Deleting…' : 'Delete asset'}</Button></div></div></div>}
  </main>;
};
