import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api/client';
import { mediaApi } from '../knowledge-capture/media/mediaApi';
import { useMachines } from '../knowledge-capture/hooks';
import { machineOptionLabel, selectableMachines } from '../machines/registeredMachines';
import { uploadWithProgress } from '../knowledge-capture/media/uploadWithProgress';
import { MediaAsset } from '../knowledge-capture/media/types';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { MediaShowcase } from '../workflows/MediaShowcase';

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
  const machineQuery = useMachines();
  const machines = machineQuery.data?.items ?? [];
  const [machineId, setMachineId] = useState(params.get('machine') || '');
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
  const [failedPreviewIds, setFailedPreviewIds] = useState<Set<string>>(() => new Set());
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<MediaAsset | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [transcriptStatus, setTranscriptStatus] = useState('');
  const diaryMachines = selectableMachines(machines);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef<number>(0);
  const elapsedBeforeSegment = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const discardedRecorder = useRef<MediaRecorder | null>(null);
  const activeRecorder = useRef<MediaRecorder | null>(null);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') { setFilePreview(''); return; }
    const url = URL.createObjectURL(file); setFilePreview(url); return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!recorded || typeof URL.createObjectURL !== 'function') { setRecordedPreview(''); return; }
    const url = URL.createObjectURL(recorded); setRecordedPreview(url); return () => URL.revokeObjectURL(url);
  }, [recorded]);
  useEffect(() => {
    if (!recording || paused) return;
    const timer = window.setInterval(() => {
      setRecordDuration(Math.floor((elapsedBeforeSegment.current + Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording, paused]);
  useEffect(() => () => {
    const current = activeRecorder.current;
    if (current && current.state !== 'inactive') {
      try { current.stop(); } catch { /* Ignore recorder teardown races. */ }
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (machineQuery.isError) setError('Could not load registered machines. Refresh the page and try again.');
  }, [machineQuery.isError]);
  useEffect(() => {
    if (!machineId) { setAssets([]); return; }
    const type = filter === 'all' ? '' : `?kind=${encodeURIComponent(filter)}`;
    setLoadingAssets(true);
    api.get<MediaAsset[]>(`/machine-knowledge/${machineId}/media${type}`).then(setAssets).catch(() => setError('Could not load this machine’s knowledge.')).finally(()=>setLoadingAssets(false));
  }, [machineId, filter]);
  useEffect(() => {
    if (!machineId || !assets.some(a => a.kind === 'audio' && ['queued', 'processing'].includes(a.transcript_status || ''))) return;
    const timer = window.setInterval(() => {
      const type = filter === 'all' ? '' : `?kind=${encodeURIComponent(filter)}`;
      api.get<MediaAsset[]>(`/machine-knowledge/${machineId}/media${type}`).then(updated => {
        setAssets(updated);
        setSelectedAsset(current => current ? updated.find(asset => asset.id === current.id) ? { ...current, ...updated.find(asset => asset.id === current.id) } : current : current);
      }).catch(() => setError('Could not refresh transcription status.'));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [machineId, filter, assets]);
  const changeKind = (next: Kind) => { setKind(next); setParams(current => { const updated = new URLSearchParams(current); updated.set('kind', next); return updated; }); setFile(null); setStatus(''); setError(''); };
  const changeMachine = (next: string) => {
    setMachineId(next);
    setParams(current => {
      const updated = new URLSearchParams(current);
      if (next) updated.set('machine', next); else updated.delete('machine');
      return updated;
    });
  };

  useEffect(() => {
    if (machineQuery.isSuccess && machineId && !diaryMachines.some(machine => machine.id === machineId)) {
      changeMachine('');
    }
  }, [machineQuery.isSuccess, machineId, diaryMachines]);

  const startRecording = async () => {
    if (busy || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported by this browser. Choose an audio file instead.');
      return;
    }
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream); const chunks: BlobPart[] = [];
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onerror = () => {
        setError('An error occurred while recording. Discard this recording and try again.');
        setRecording(false);
        stream?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        activeRecorder.current = null;
      };
      mr.onstop = () => {
        stream?.getTracks().forEach(t => t.stop());
        if (discardedRecorder.current === mr) { discardedRecorder.current = null; streamRef.current = null; activeRecorder.current = null; return; }
        streamRef.current = null;
        activeRecorder.current = null;
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        if (!blob.size) {
          setRecorded(null);
          setError('No audio was captured. Check your microphone and try again.');
          return;
        }
        setRecorded(blob);
        setError('');
      };
      mr.start();
      activeRecorder.current = mr;
      elapsedBeforeSegment.current = 0;
      startedAt.current = Date.now();
      setRecordDuration(0); setFile(null); setRecorder(mr); setRecording(true); setPaused(false); setError('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (cause) {
      stream?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      activeRecorder.current = null;
      const errorName = cause instanceof Error ? cause.name : '';
      if (errorName === 'NotAllowedError' || errorName === 'SecurityError') setError('Microphone permission was denied. Allow microphone access in the browser settings and try again.');
      else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') setError('No microphone was found. Connect a microphone or choose an audio file.');
      else setError('Could not start microphone recording. Check microphone access and try again.');
    }
  };
  const stopRecording = () => {
    if (!recorder || recorder.state === 'inactive') return;
    if (recorder.state === 'recording') elapsedBeforeSegment.current += Date.now() - startedAt.current;
    try { recorder.stop(); setRecording(false); setPaused(false); }
    catch { setError('Could not stop the microphone recording. Please discard it and try again.'); }
  };
  const pauseRecording = () => {
    if (!recorder || recorder.state !== 'recording') return;
    try {
      recorder.pause();
      elapsedBeforeSegment.current += Date.now() - startedAt.current;
      setRecordDuration(Math.floor(elapsedBeforeSegment.current / 1000));
      setPaused(true);
    } catch { setError('Could not pause the recording. You can stop or discard it.'); }
  };
  const resumeRecording = () => {
    if (!recorder || recorder.state !== 'paused') return;
    try { recorder.resume(); startedAt.current = Date.now(); setPaused(false); }
    catch { setError('Could not resume the recording. You can stop or discard it.'); }
  };
  const cancelRecording = () => {
    if (recorder && recorder.state !== 'inactive') {
      discardedRecorder.current = recorder;
      try { recorder.stop(); } catch { /* Tracks are stopped below even if the recorder already stopped. */ }
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    activeRecorder.current = null;
    setRecording(false); setPaused(false); setRecorded(null); setRecordDuration(0); setError('');
  };

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
    try {
      const t = await api.get<any>(`/voice/transcripts/${asset.transcript_id}`);
      setTranscriptStatus(t.status);
      setSelectedAsset({ ...asset, id: t.id, media_id: t.media_id, transcript_id: t.id, kind: 'transcript', title: `Transcript · ${asset.title || asset.original_name}`, content: t.full_text, created_at: t.created_at || asset.created_at, transcript_status: t.status });
    }
    catch { setTranscriptStatus(asset.transcript_status || 'Transcript not available yet.'); }
  };
  const requestTranscription = async (asset: MediaAsset) => {
    setError(''); setTranscriptStatus('queued');
    try {
      const job = await api.post<{ id: string; status: string }>(`/voice/assets/${asset.id}/transcribe`, {});
      const updated = { ...asset, transcript_status: job.status, transcript_job_id: job.id, transcript_error: null };
      setAssets(current => current.map(item => item.id === asset.id ? updated : item));
      setSelectedAsset(updated);
    } catch (cause) {
      setTranscriptStatus(asset.transcript_status || 'not_configured');
      setError(cause instanceof Error ? cause.message : 'Could not start transcription.');
    }
  };

  return <main className="max-w-5xl mx-auto p-5 md:p-8 space-y-6">
    <header className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-blue-600 font-bold">Machine Knowledge</p><h1 className="text-2xl font-bold text-slate-900 mt-1">Capture and browse knowledge</h1><p className="text-sm text-slate-600 mt-2">Knowledge assets are stored independently from procedures.</p></div><Link className="rounded-lg bg-slate-900 text-white text-sm px-4 py-2" to="/app/procedures/new">Create Procedure</Link></header>
    <section className="bg-white border rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap gap-2">{(['video','audio','notes','image','document'] as Kind[]).map(k => <button key={k} onClick={() => changeKind(k)} className={`px-4 py-2 rounded-full text-sm capitalize ${kind===k?'bg-blue-600 text-white':'bg-slate-100 text-slate-700'}`}>{k==='image'?'Photos':k==='document'?'Documents':k}</button>)}</div>
      <label className="block text-sm font-semibold">Which machine or equipment is this knowledge related to?
        <input aria-label="Search registered machines" value={machineSearch} onChange={e=>setMachineSearch(e.target.value)} placeholder="Search registered machines…" className="block w-full mt-2 border rounded-lg p-3" />
        <select aria-label="Machine" value={machineId} disabled={machineQuery.isLoading || machineQuery.isError} onChange={e => changeMachine(e.target.value)} className="block w-full mt-2 border rounded-lg p-3 bg-white disabled:cursor-not-allowed disabled:opacity-60"><option value="">Select a registered machine…</option>{diaryMachines.filter(machine => !machineSearch.trim() || `${machine.name} ${machine.code || ''} ${machine.category_name || machine.category || ''}`.toLowerCase().includes(machineSearch.toLowerCase())).map(machine => <option key={machine.id} value={machine.id}>{machineOptionLabel(machine)}</option>)}</select>
      </label>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Knowledge title" className="w-full border rounded-lg p-3" />
      <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional description or observation" className="w-full border rounded-lg p-3" />
      <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="Optional tags, comma separated" className="w-full border rounded-lg p-3" />
      {kind==='notes' ? <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Write a machine observation or practical tip…" rows={5} className="w-full border rounded-lg p-3"/> : kind==='audio' ? <div className="space-y-3"><div className="flex flex-wrap gap-2">{!recording && !recorded && <Button type="button" disabled={busy} onClick={startRecording}>Start recording</Button>}{recording && <><Button type="button" onClick={paused ? resumeRecording : pauseRecording}>{paused?'Resume':'Pause'}</Button><Button type="button" onClick={stopRecording}>Stop recording</Button><Button type="button" variant="secondary" onClick={cancelRecording}>Cancel recording</Button><span role="status" className="self-center text-sm tabular-nums">{Math.floor(recordDuration/60)}:{String(recordDuration%60).padStart(2,'0')} {paused?'Paused':'Recording'}</span></>}{recorded && <Button type="button" onClick={()=>{cancelRecording();setFile(null);if(inputRef.current)inputRef.current.value='';}}>Discard and record again</Button>}<input ref={inputRef} type="file" accept={accepts.audio} disabled={recording||busy} onChange={e=>setFile(e.target.files?.[0]||null)} /></div>{recorded && recordedPreview && <audio aria-label="Recorded audio preview" controls src={recordedPreview} className="w-full"/>}</div> : <><input ref={inputRef} type="file" accept={accepts[kind]} onChange={e=>setFile(e.target.files?.[0]||null)} className="block w-full"/>{file && <div className="text-sm">{file.name}{kind==='image' && filePreview && <img className="mt-2 max-h-56 rounded-lg" src={filePreview} alt="Upload preview"/>}{kind==='video' && filePreview && <video controls className="mt-2 max-h-56" src={filePreview}/>}</div>}</>}
      {busy && kind!=='notes' && <div className="space-y-1" role="status"><div className="flex justify-between text-xs text-slate-600"><span>Uploading to machine knowledge…</span><span>{uploadProgress}%</span></div><div className="h-2 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{width:`${uploadProgress}%`}}/></div></div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{status && <p role="status" className="text-sm text-emerald-700">{status}</p>}
      <Button type="button" disabled={busy || machineQuery.isLoading || machineQuery.isError || !machineId || (kind === 'audio' && recording)} onClick={save}>{busy?'Saving…':recording?'Stop recording before saving':'Save to machine knowledge'}</Button>
    </section>
    <section className="space-y-3"><h2 className="text-lg font-bold">Knowledge assets {machineId && `· ${machines.find(m=>m.id===machineId)?.name || ''}`}</h2>{machineId && <><input className="w-full border rounded-lg p-3" placeholder="Search this machine’s knowledge" value={search} onChange={e=>setSearch(e.target.value)}/><div className="flex flex-wrap gap-2">{[['all','All'],['video','Videos'],['audio','Audio Recordings'],['transcript','Transcripts'],['image','Images'],['notes','Notes'],['document','Documents']].map(([key,label])=><button key={key} onClick={()=>setFilter(key)} className={`px-3 py-1.5 rounded-full text-xs ${filter===key?'bg-slate-900 text-white':'bg-slate-100'}`}>{label}</button>)}<select aria-label="Verification status" className="border rounded-full px-3 py-1.5 text-xs" value={verificationFilter} onChange={e=>setVerificationFilter(e.target.value)}><option value="all">All verification states</option><option value="pending_review">Pending review</option></select></div></>}{!machineId ? machineQuery.isLoading ? <p role="status" className="text-sm text-slate-500">Loading registered equipment…</p> : diaryMachines.length===0 ? <p className="text-sm text-slate-600">No active equipment is registered. <Link className="font-semibold text-blue-700 underline" to="/app/machines">Register equipment</Link> before capturing machine knowledge.</p> : <p className="text-sm text-slate-500">Select a machine to browse its knowledge.</p> : loadingAssets ? <p role="status" className="text-sm text-slate-500">Loading machine knowledge…</p> : filteredAssets.length===0 ? <p className="text-sm text-slate-500">No {filter==='all'?'knowledge assets':filter==='video'?'videos':filter==='audio'?'audio recordings':filter==='transcript'?'transcripts':filter==='image'?'images':filter==='notes'?'notes':'documents'} have been added to this machine yet.</p> : <div className="grid gap-3 sm:grid-cols-2">{filteredAssets.map(a=><article key={a.id} className="bg-white border rounded-xl p-4"><button className="font-semibold text-left" onClick={()=>setSelectedAsset(a)}>{a.title || a.original_name}</button><div className="text-xs text-slate-500 mt-1">{a.kind} · {new Date(a.created_at).toLocaleDateString()} · {a.author_name || 'Unknown author'} · {a.verification_status || 'Pending review'}</div>{a.description && <p className="text-sm mt-2">{a.description}</p>}<div className="flex gap-3 mt-3"><button className="text-sm text-blue-700 underline" onClick={()=>setSelectedAsset(a)}>Details / Preview</button>{a.kind!=='transcript' && <><button className="text-sm text-blue-700 underline" onClick={()=>editAsset(a)}>Edit</button><button className="text-sm text-red-700 underline" onClick={()=>removeAsset(a)}>Delete</button></>}</div>{a.transcript_id && <button className="text-xs text-indigo-700 underline mt-2" onClick={()=>loadTranscript(a)}>Transcript · {a.transcript_status || 'Processing'}</button>}</article>)}</div>}</section>
    {selectedAsset && <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-3">
        <div className="flex justify-between gap-3"><h2 className="font-bold text-lg">{selectedAsset.title || selectedAsset.original_name}</h2><button onClick={() => setSelectedAsset(null)} aria-label="Close details">×</button></div>
        <p className="text-xs text-slate-500">{selectedAsset.kind} · {new Date(selectedAsset.created_at).toLocaleString()} · {machines.find(m => m.id === selectedAsset.machine_id)?.name || machines.find(m => m.id === machineId)?.name}</p>
        {selectedAsset.description && <p>{selectedAsset.description}</p>}
        {selectedAsset.kind === 'notes' || selectedAsset.kind === 'transcript' ? <>
          <textarea aria-label={selectedAsset.kind === 'transcript' ? 'Transcript text' : 'Note content'} className="w-full min-h-48 border rounded-lg p-3" value={selectedAsset.content || ''} onChange={e => setSelectedAsset({ ...selectedAsset, content: e.target.value })}/>
          {selectedAsset.kind === 'notes' && <Button type="button" onClick={async () => { try { const updated = await api.patch<MediaAsset>(`/media/${selectedAsset.id}`, { content: selectedAsset.content }); setAssets(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated, content: selectedAsset.content } : a)); setSelectedAsset(current => current ? { ...current, ...updated, content: selectedAsset.content } : current); setStatus('Note saved.'); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save note.'); } }}>Save note</Button>}
          {selectedAsset.kind === 'transcript' && <>
            {selectedAsset.media_id && <Button type="button" variant="secondary" onClick={async () => {
              const linked = assets.find(a => a.id === selectedAsset.media_id && a.kind === 'audio');
              if (linked) { setSelectedAsset(linked); return; }
              try {
                const recordings = await api.get<MediaAsset[]>(`/machine-knowledge/${selectedAsset.machine_id || machineId}/media?kind=audio`);
                setAssets(recordings);
                const original = recordings.find(a => a.id === selectedAsset.media_id);
                if (original) setSelectedAsset(original); else setError('The original recording is no longer available in this machine library.');
              } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the original recording.'); }
            }}>Open original recording</Button>}
            <Button type="button" onClick={async () => { try { const updated = await api.patch<any>(`/voice/transcripts/${selectedAsset.transcript_id}`, { full_text: selectedAsset.content }); setSelectedAsset(current => current ? { ...current, content: updated.full_text, transcript_status: updated.status } : current); setStatus('Transcript updated.'); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update transcript.'); } }}>Save transcript edit</Button>
          </>}
        </> : <MediaShowcase
          assets={[{ id: selectedAsset.id, title: selectedAsset.title || selectedAsset.original_name, kind: selectedAsset.kind, machine_id: selectedAsset.machine_id ?? null, url: `/media/${selectedAsset.id}`, mime: selectedAsset.mime, filename: selectedAsset.original_name, size_bytes: selectedAsset.size_bytes }]}
          failedIds={failedPreviewIds}
          onMediaError={(id) => setFailedPreviewIds(current => new Set(current).add(id))}
          onRetry={(id) => setFailedPreviewIds(current => { const next = new Set(current); next.delete(id); return next; })}
          reducedMotion={false}
          showStatus={false}
        />}
        {selectedAsset.kind === 'audio' && <div className="space-y-2"><p className="text-xs text-slate-600">Transcription: {transcriptStatus || selectedAsset.transcript_status || 'not_configured'}</p>{selectedAsset.transcript_error && <p role="alert" className="text-sm text-red-700">{selectedAsset.transcript_error}</p>}{selectedAsset.transcript_id && <Button type="button" variant="secondary" onClick={() => void loadTranscript(selectedAsset)}>Open transcript</Button>}{(!selectedAsset.transcript_id && ['not_configured', 'failed'].includes(selectedAsset.transcript_status || 'not_configured')) && <Button type="button" disabled={busy} onClick={() => void requestTranscription(selectedAsset)}>{selectedAsset.transcript_status === 'failed' ? 'Retry transcription' : 'Transcribe audio'}</Button>}</div>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {status && <p role="status" className="text-sm text-emerald-700">{status}</p>}
      </div>
    </div>}
    {editingAsset && <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-asset-title"><form className="bg-white rounded-2xl max-w-xl w-full p-5 space-y-4" onSubmit={event => { event.preventDefault(); void saveMetadata(); }}><div><h2 id="edit-asset-title" className="text-lg font-bold">Edit knowledge asset</h2><p className="text-sm text-slate-600">Update the asset metadata without changing its machine association or review status.</p></div><label className="block text-sm font-medium">Title<input aria-label="Asset title" value={editTitle} onChange={event => setEditTitle(event.target.value)} className="block w-full mt-1 border rounded-lg p-2.5" required /></label><label className="block text-sm font-medium">Description<textarea aria-label="Asset description" value={editDescription} onChange={event => setEditDescription(event.target.value)} className="block w-full mt-1 border rounded-lg p-2.5" rows={3}/></label><label className="block text-sm font-medium">Tags<input aria-label="Asset tags" value={editTags} onChange={event => setEditTags(event.target.value)} className="block w-full mt-1 border rounded-lg p-2.5" /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditingAsset(null)}>Cancel</Button><Button type="submit" disabled={metadataSaving}>{metadataSaving ? 'Saving…' : 'Save changes'}</Button></div></form></div>}
    {deletingAsset && <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-asset-title"><div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4"><div><h2 id="delete-asset-title" className="text-lg font-bold">Delete knowledge asset?</h2><p className="text-sm text-slate-600 mt-2">This will delete “{deletingAsset.title || deletingAsset.original_name}” from its machine library and remove its stored file. Referenced assets cannot be deleted.</p></div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setDeletingAsset(null); setError(''); }}>Cancel</Button><Button type="button" disabled={busy} onClick={() => void confirmRemoveAsset()}>{busy ? 'Deleting…' : 'Delete asset'}</Button></div></div></div>}
  </main>;
};
