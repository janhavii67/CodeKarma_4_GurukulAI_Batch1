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
import {
  Video,
  Mic,
  FileText,
  Image as ImageIcon,
  Layers,
  Search,
  PlusCircle,
  ArrowRight,
  Cpu,
  CheckCircle2,
  Tag,
  MessageSquare,
} from 'lucide-react';

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

  return <main className="w-full p-4 sm:p-6 lg:p-8 space-y-8">
    {/* ─── HERO BANNER (Reference Image 1) ─── */}
    <div className="rounded-2xl bg-[#08264A] text-white p-6 sm:p-8 relative overflow-hidden shadow-lg border border-[#123B68]">
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-72 h-72 rounded-full bg-[#1677F8]/20 blur-3xl pointer-events-none" />
      
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1677F8]/20 border border-[#43B9F4]/30 text-xs font-semibold text-[#43B9F4] uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#35C5E8]" />
            MACHINE KNOWLEDGE
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Capture and browse <span className="text-[#35C5E8]">knowledge</span>
          </h1>
          <p className="text-sm text-[#D9E5F2] leading-relaxed">
            Knowledge assets are stored independently from procedures.
          </p>
        </div>

        <Link
          className="inline-flex items-center gap-2 rounded-xl bg-[#1677F8] hover:bg-[#125EA3] text-white text-sm font-semibold px-5 py-2.5 shadow-sm transition-colors shrink-0 self-start md:self-auto"
          to="/app/procedures/new"
        >
          <PlusCircle size={17} />
          <span>Create Procedure</span>
        </Link>
      </div>
    </div>

    {/* ─── KNOWLEDGE CAPTURE FORM (Reference Image 1) ─── */}
    <section className="bg-white border border-[#D9E5F2] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      {/* Capture Mode Tabs */}
      <div className="flex flex-wrap items-center gap-2.5 p-1.5 rounded-2xl bg-[#F4F8FE] border border-[#D9E5F2] w-fit">
        {(['video','audio','notes','image','document'] as Kind[]).map(k => {
          const isSelected = kind === k;
          const label = k === 'image' ? 'Photos' : k === 'document' ? 'Documents' : k;
          const icon = k === 'video' ? <Video size={16} /> : k === 'audio' ? <Mic size={16} /> : k === 'image' ? <ImageIcon size={16} /> : <FileText size={16} />;
          
          return (
            <button
              key={k}
              type="button"
              onClick={() => changeKind(k)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                isSelected
                  ? 'bg-[#1677F8] text-white shadow-sm'
                  : 'text-[#647A96] hover:text-[#102844] hover:bg-white/60'
              }`}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      {/* Machine Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-[#102844]">
          Which machine or equipment is this knowledge related to?
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#647A96] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              aria-label="Search registered machines"
              value={machineSearch}
              onChange={e => setMachineSearch(e.target.value)}
              placeholder="Search registered machines…"
              className="w-full bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#102844] outline-none focus:border-[#1677F8] focus:bg-white transition-colors"
            />
          </div>
          <div className="relative">
            <Cpu className="w-4 h-4 text-[#647A96] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              aria-label="Machine"
              value={machineId}
              disabled={machineQuery.isLoading || machineQuery.isError}
              onChange={e => changeMachine(e.target.value)}
              className="w-full bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#102844] outline-none focus:border-[#1677F8] focus:bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Select a registered machine…</option>
              {diaryMachines
                .filter(machine => !machineSearch.trim() || `${machine.name} ${machine.code || ''} ${machine.category_name || machine.category || ''}`.toLowerCase().includes(machineSearch.toLowerCase()))
                .map(machine => (
                  <option key={machine.id} value={machine.id}>
                    {machineOptionLabel(machine)}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Knowledge Form Fields */}
      <div className="space-y-3.5">
        <div className="relative">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Knowledge title"
            className="w-full bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl px-4 py-2.5 text-xs text-[#102844] outline-none focus:border-[#1677F8] focus:bg-white transition-colors placeholder:text-[#647A96]/60"
          />
        </div>

        <div className="relative">
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description or observation"
            className="w-full bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl px-4 py-2.5 text-xs text-[#102844] outline-none focus:border-[#1677F8] focus:bg-white transition-colors placeholder:text-[#647A96]/60"
          />
        </div>

        <div className="relative">
          <input
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="Optional tags, comma separated"
            className="w-full bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl px-4 py-2.5 text-xs text-[#102844] outline-none focus:border-[#1677F8] focus:bg-white transition-colors placeholder:text-[#647A96]/60"
          />
        </div>

        {kind === 'notes' ? (
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Write a machine observation or practical tip…"
            rows={5}
            className="w-full bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl p-3.5 text-xs text-[#102844] outline-none focus:border-[#1677F8] focus:bg-white transition-colors placeholder:text-[#647A96]/60"
          />
        ) : kind === 'audio' ? (
          <div className="space-y-3 p-4 rounded-xl border border-[#D9E5F2] bg-[#F4F8FE]">
            <div className="flex flex-wrap items-center gap-2.5">
              {!recording && !recorded && (
                <Button type="button" disabled={busy} onClick={startRecording} icon={<Mic size={14} />}>
                  Start recording
                </Button>
              )}
              {recording && (
                <>
                  <Button type="button" onClick={paused ? resumeRecording : pauseRecording}>
                    {paused ? 'Resume' : 'Pause'}
                  </Button>
                  <Button type="button" onClick={stopRecording}>
                    Stop recording
                  </Button>
                  <Button type="button" variant="secondary" onClick={cancelRecording}>
                    Cancel recording
                  </Button>
                  <span role="status" className="self-center text-xs font-mono tabular-nums text-rose-600 font-bold animate-pulse">
                    {Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')} {paused ? 'Paused' : 'Recording'}
                  </span>
                </>
              )}
              {recorded && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    cancelRecording();
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                >
                  Discard and record again
                </Button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={accepts.audio}
                disabled={recording || busy}
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="text-xs text-[#647A96]"
              />
            </div>
            {recorded && recordedPreview && <audio aria-label="Recorded audio preview" controls src={recordedPreview} className="w-full mt-2" />}
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-[#D9E5F2] bg-[#F4F8FE]">
            <input
              ref={inputRef}
              type="file"
              accept={accepts[kind]}
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-[#647A96]"
            />
            {file && (
              <div className="text-xs text-[#102844] mt-2 font-medium">
                Selected: {file.name}
                {kind === 'image' && filePreview && <img className="mt-2 max-h-56 rounded-xl border border-[#D9E5F2]" src={filePreview} alt="Upload preview" />}
                {kind === 'video' && filePreview && <video controls className="mt-2 max-h-56 rounded-xl border border-[#D9E5F2]" src={filePreview} />}
              </div>
            )}
          </div>
        )}
      </div>

      {busy && kind !== 'notes' && (
        <div className="space-y-1.5" role="status">
          <div className="flex justify-between text-xs text-[#647A96]">
            <span>Uploading to machine knowledge…</span>
            <span className="font-bold text-[#102844]">{uploadProgress}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#E0EBF7] overflow-hidden">
            <div className="h-full bg-[#1677F8] transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{error}</p>}
      {status && <p role="status" className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">{status}</p>}

      <div>
        <Button
          type="button"
          disabled={busy || machineQuery.isLoading || machineQuery.isError || !machineId || (kind === 'audio' && recording)}
          onClick={save}
          className="bg-[#1677F8] hover:bg-[#125EA3] text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm"
          icon={<ArrowRight size={15} />}
        >
          {busy ? 'Saving…' : recording ? 'Stop recording before saving' : 'Save to machine knowledge'}
        </Button>
      </div>
    </section>

    {/* ─── KNOWLEDGE ASSETS SECTION (Reference Image 1) ─── */}
    <section className="space-y-4">
      <div className="rounded-2xl border border-[#D9E5F2] bg-[#F4F8FE] p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white border border-[#D9E5F2] flex items-center justify-center text-[#1677F8] shadow-xs">
          <Layers size={20} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-[#102844]">
            Knowledge assets {machineId && `· ${machines.find(m => m.id === machineId)?.name || ''}`}
          </h2>
          {!machineId && (
            <p className="text-xs text-[#647A96]">Select a machine to browse its knowledge.</p>
          )}
        </div>
      </div>

      {machineId && (
        <div className="bg-white border border-[#D9E5F2] rounded-2xl p-4 shadow-sm space-y-3">
          <input
            className="w-full bg-[#F4F8FE] border border-[#D9E5F2] rounded-xl px-3.5 py-2 text-xs text-[#102844] outline-none focus:border-[#1677F8]"
            placeholder="Search this machine’s knowledge"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['all', 'All'],
              ['video', 'Videos'],
              ['audio', 'Audio Recordings'],
              ['transcript', 'Transcripts'],
              ['image', 'Images'],
              ['notes', 'Notes'],
              ['document', 'Documents'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  filter === key ? 'bg-[#08264A] text-white' : 'bg-[#F4F8FE] text-[#647A96] hover:text-[#102844]'
                }`}
              >
                {label}
              </button>
            ))}
            <select
              aria-label="Verification status"
              className="border border-[#D9E5F2] rounded-xl px-3 py-1.5 text-xs bg-[#F4F8FE] text-[#102844]"
              value={verificationFilter}
              onChange={e => setVerificationFilter(e.target.value)}
            >
              <option value="all">All verification states</option>
              <option value="pending_review">Pending review</option>
            </select>
          </div>
        </div>
      )}

      {!machineId ? (
        machineQuery.isLoading ? (
          <p role="status" className="text-xs text-[#647A96] p-4 text-center">Loading registered equipment…</p>
        ) : diaryMachines.length === 0 ? (
          <p className="text-xs text-[#647A96] p-4">
            No active equipment is registered.{' '}
            <Link className="font-semibold text-[#1677F8] underline" to="/app/machines">
              Register equipment
            </Link>{' '}
            before capturing machine knowledge.
          </p>
        ) : null
      ) : loadingAssets ? (
        <p role="status" className="text-xs text-[#647A96] p-4 text-center">Loading machine knowledge…</p>
      ) : filteredAssets.length === 0 ? (
        <p className="text-xs text-[#647A96] p-4 bg-white border border-[#D9E5F2] rounded-2xl text-center">
          No {filter === 'all' ? 'knowledge assets' : filter === 'video' ? 'videos' : filter === 'audio' ? 'audio recordings' : filter === 'transcript' ? 'transcripts' : filter === 'image' ? 'images' : filter === 'notes' ? 'notes' : 'documents'} have been added to this machine yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredAssets.map(a => (
            <article key={a.id} className="bg-white border border-[#D9E5F2] rounded-2xl p-5 shadow-sm space-y-2.5">
              <button type="button" className="font-bold text-sm text-[#102844] hover:text-[#1677F8] text-left transition-colors" onClick={() => setSelectedAsset(a)}>
                {a.title || a.original_name}
              </button>
              <div className="text-[11px] text-[#647A96] flex items-center gap-2">
                <span className="uppercase font-semibold tracking-wider px-2 py-0.5 rounded bg-[#F4F8FE] text-[#1677F8] border border-[#D9E5F2]">
                  {a.kind}
                </span>
                <span>{new Date(a.created_at).toLocaleDateString()}</span>
                <span>•</span>
                <span>{a.author_name || 'Unknown author'}</span>
                <span>•</span>
                <span className="text-emerald-600 font-medium">{a.verification_status || 'Pending review'}</span>
              </div>
              {a.description && <p className="text-xs text-[#647A96] line-clamp-2">{a.description}</p>}
              <div className="flex items-center gap-3 pt-2 border-t border-[#D9E5F2]">
                <button type="button" className="text-xs font-semibold text-[#1677F8] hover:underline" onClick={() => setSelectedAsset(a)}>
                  Details / Preview
                </button>
                {a.kind !== 'transcript' && (
                  <>
                    <button type="button" className="text-xs font-semibold text-[#647A96] hover:text-[#102844] hover:underline" onClick={() => editAsset(a)}>
                      Edit
                    </button>
                    <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeAsset(a)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
              {a.transcript_id && (
                <button type="button" className="text-xs text-indigo-700 underline block mt-1" onClick={() => loadTranscript(a)}>
                  Transcript · {a.transcript_status || 'Processing'}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
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
