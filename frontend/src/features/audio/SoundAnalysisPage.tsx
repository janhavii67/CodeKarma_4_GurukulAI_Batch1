import React, { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, AudioLines, CheckCircle2, CircleHelp, Mic, Square, Upload, ShieldAlert, Send, BookOpen, Wrench } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api/client';

interface Citation {
  knowledge_item_id: string;
  knowledge_version_id: string;
  title: string;
  version_no?: number;
  source_type?: string;
}

interface AudioReference {
  id: string;
  title: string;
  description?: string;
  interpretation?: string;
  machine_id?: string;
  machine_name?: string;
  model_name?: string;
  component?: string;
  operation?: string;
  operating_conditions?: string;
  duration_seconds: number;
  status: string;
  audio_url?: string;
  source_references: Citation[];
}

interface Candidate {
  reference_id: string;
  title: string;
  machine_name?: string;
  model_name?: string;
  component?: string;
  operation?: string;
  operating_conditions?: string;
  interpretation: string;
  similarity_score: number;
  knowledge_version_id: string;
  knowledge_sources: Citation[];
  related_links: Array<{ type?: string; version_id?: string; item_id?: string; title?: string }>;
}

interface AnalysisResult {
  id: string;
  status: 'MATCHED' | 'NO_RELIABLE_MATCH' | 'AMBIGUOUS_MATCH' | 'FAILED' | string;
  matched_reference?: Candidate;
  similarity_score?: number;
  reason_code: string;
  message: string;
  limitation: string;
  requires_expert_review: boolean;
  candidate_matches: Candidate[];
  review_status?: string;
}

interface PublishedKnowledge {
  id: string;
  title: string;
  version_id: string;
  version_no: number;
  version_status: string;
}

interface AudioReviewSubmission {
  id: string;
  status: string;
  review_status: string;
  reason_code: string;
  message: string;
  review_note?: string;
  audio_url?: string;
}

function wavFromBuffer(buffer: AudioBuffer): Blob {
  const frameCount = buffer.length;
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const samples = new Float32Array(frameCount);
  for (let channel = 0; channel < channels; channel += 1) {
    const values = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i += 1) samples[i] += values[i] / channels;
  }

  const bytes = new ArrayBuffer(44 + frameCount * 2);
  const view = new DataView(bytes);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + frameCount * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, frameCount * 2, true);
  for (let i = 0; i < frameCount; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

function citationUrl(citation: Citation) {
  return `/app/knowledge/${encodeURIComponent(citation.knowledge_item_id)}?version_id=${encodeURIComponent(citation.knowledge_version_id)}`;
}

export const SoundAnalysisPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('audio.manage');
  const [references, setReferences] = useState<AudioReference[]>([]);
  const [sources, setSources] = useState<PublishedKnowledge[]>([]);
  const [draftReferences, setDraftReferences] = useState<AudioReference[]>([]);
  const [reviewQueue, setReviewQueue] = useState<AudioReviewSubmission[]>([]);
  const [referenceDraftId, setReferenceDraftId] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [draft, setDraft] = useState({ title: '', interpretation: '', description: '', machine_id: '', model_name: '', component: '', operation: '', operating_conditions: '', recording_source: '' });
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  const loadReferences = async () => {
    try {
      const data = await api.get<AudioReference[]>('/audio/references');
      setReferences(data || []);
    } catch {
      setReferences([]);
    }
  };

  const loadReferenceDrafts = async () => {
    if (!canManage) return;
    try { setDraftReferences(await api.get<AudioReference[]>('/audio/references/drafts')); }
    catch { setDraftReferences([]); }
  };

  const loadReviewQueue = async () => {
    if (!canManage) return;
    try {
      const queue = await api.get<Array<{ id: string }>>('/audio/review-submissions');
      setReviewQueue(await Promise.all(queue.map((item) => api.get<AudioReviewSubmission>(`/audio/review-submissions/${item.id}`))));
    } catch { setReviewQueue([]); }
  };

  useEffect(() => {
    void loadReferences();
    if (canManage) {
      api.get<{ items: PublishedKnowledge[] }>('/knowledge?status=published&page_size=100')
        .then((data) => setSources((data.items || []).filter((item) => item.version_status === 'published')))
        .catch(() => setSources([]));
      void loadReferenceDrafts();
      void loadReviewQueue();
    }
  }, [canManage]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const startRecording = async () => {
    setError('');
    setNotice('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('This browser does not support microphone recording. Upload a WAV or FLAC file instead.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onerror = () => setError('The browser could not record microphone audio. Try uploading a WAV or FLAC recording.');
      recorder.onstop = async () => {
        try {
          const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const context = new AudioContext();
          const decoded = await context.decodeAudioData(await blob.arrayBuffer());
          const wav = wavFromBuffer(decoded);
          setFile(new File([wav], `machine-recording-${Date.now()}.wav`, { type: 'audio/wav' }));
          setNotice(`Recording ready (${Math.round(decoded.duration)} seconds).`);
          await context.close();
        } catch {
          setError('The browser could not decode this recording. Try another browser or upload a WAV/FLAC file.');
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setRecording(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access failed.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const analyze = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('Validating and comparing the recording with approved references…');
    setResult(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await api.postForm<AnalysisResult>('/audio/analyze', form);
      setResult(response);
      setNotice('Comparison complete. Review the source and similarity details below.');
      await loadReferences();
    } catch (err) {
      setNotice('');
      setError(err instanceof Error ? err.message : 'Audio matching failed. No result was generated.');
    } finally {
      setBusy(false);
    }
  };

  const submitForReview = async () => {
    if (!file || !result) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (reviewNote.trim()) form.append('note', reviewNote.trim());
      await api.postForm(`/audio/analysis-jobs/${result.id}/submit-review`, form);
      setResult({ ...result, review_status: 'pending' });
      setNotice('The recording was sent privately to the expert review queue. It is not an approved reference.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit this recording for review.');
    } finally {
      setBusy(false);
    }
  };

  const loadDraftIntoForm = (reference: AudioReference) => {
    setReferenceDraftId(reference.id);
    setDraft({
      title: reference.title,
      interpretation: reference.interpretation || '',
      description: reference.description || '',
      machine_id: reference.machine_id || '',
      model_name: reference.model_name || '',
      component: reference.component || '',
      operation: reference.operation || '',
      operating_conditions: reference.operating_conditions || '',
      recording_source: '',
    });
    setSelectedSources((reference.source_references || []).map((citation) => citation.knowledge_version_id));
    setDraftFile(null);
    setNotice(`Editing draft: ${reference.title}`);
    setError('');
  };

  const clearReferenceDraft = () => {
    setReferenceDraftId(null);
    setSelectedSources([]);
    setDraftFile(null);
    setDraft({ title: '', interpretation: '', description: '', machine_id: '', model_name: '', component: '', operation: '', operating_conditions: '', recording_source: '' });
  };

  const createReference = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!referenceDraftId && (!draftFile || !selectedSources.length)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!referenceDraftId) {
        if (!draftFile) return;
        const form = new FormData();
        form.append('file', draftFile);
        Object.entries(draft).forEach(([key, value]) => { if (value.trim()) form.append(key, value.trim()); });
        form.append('source_version_ids', selectedSources.join(','));
        const created = await api.postForm<AudioReference>('/audio/references', form);
        setReferenceDraftId(created.id);
        setNotice('Draft created. Review the details, make edits, then send it to the independent review queue.');
        await loadReferenceDrafts();
        return;
      }
      await api.patch(`/audio/references/${referenceDraftId}`, {
        title: draft.title,
        interpretation: draft.interpretation,
        description: draft.description || null,
        machine_id: draft.machine_id || null,
        model_name: draft.model_name || null,
        component: draft.component || null,
        operation: draft.operation || null,
        operating_conditions: draft.operating_conditions || null,
        recording_source: draft.recording_source || null,
      });
      await api.post(`/audio/references/${referenceDraftId}/submit`, {});
      setNotice('Reference draft sent to the existing review queue. It becomes matchable only after an independent expert publishes it.');
      clearReferenceDraft();
      await loadReferences();
      await loadReferenceDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the reference draft.');
    } finally {
      setBusy(false);
    }
  };

  const decideSubmission = async (id: string, decision: 'rejected' | 'changes_requested') => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/audio/review-submissions/${id}/decision`, { decision, comment: reviewComments[id] || undefined });
      await loadReviewQueue();
      setNotice(decision === 'rejected' ? 'Recording declined; it remains separate from the reference library.' : 'More recording context requested from the submitter.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the review submission.');
    } finally { setBusy(false); }
  };

  const statusIcon = result?.status === 'MATCHED'
    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
    : result?.status === 'FAILED'
      ? <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
      : <CircleHelp className="h-5 w-5 shrink-0 text-amber-600" />;

  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><AudioLines className="h-6 w-6" /></div>
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-[#17324D]">Machine Sound Matching</h1><Badge variant="brand" size="sm">Module 07</Badge></div>
          <p className="mt-1 text-sm text-[#5D7188]">Compare a recording with expert approved machine sounds.</p>
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <p><strong>Similarity is not a diagnosis.</strong> A similar sound does not confirm a fault or prove a machine is safe. Follow the approved machine procedure and ask a qualified supervisor when unsure. Scores rank sound profiles; they are not fault probabilities.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <section className="space-y-5">
          <Card title="Record or upload a sound" subtitle="WAV or FLAC · 0.5–120 seconds · up to the configured upload limit">
            <div className="space-y-4">
              <label className="block rounded-xl border-2 border-dashed border-[#C8D7E8] bg-[#F8FBFF] p-5 text-center hover:border-blue-400">
                <Upload className="mx-auto mb-2 h-6 w-6 text-blue-600" />
                <span className="block text-sm font-semibold text-[#17324D]">Choose a WAV or FLAC recording</span>
                <span className="mt-1 block text-xs text-[#6B7F95]">The server checks the decoded sound and duration.</span>
                <input className="mt-3 block w-full text-xs" type="file" accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,.wav,.flac,.mp3" onChange={(event) => { setFile(event.target.files?.[0] || null); setResult(null); setError(''); setNotice(''); }} />
              </label>
              {file && <p className="truncate text-xs text-[#5D7188]">Selected: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
              <div className="flex gap-2">
                {!recording ? <Button variant="secondary" onClick={startRecording} icon={<Mic className="h-4 w-4" />}>Record</Button> : <Button variant="danger" onClick={stopRecording} icon={<Square className="h-4 w-4" />}>Stop recording</Button>}
                <Button onClick={analyze} disabled={!file || busy || recording} isLoading={busy} icon={<Activity className="h-4 w-4" />}>Compare sound</Button>
              </div>
              {recording && <p className="text-sm text-rose-700" role="status">Recording from microphone… Stop when you have a clear sample.</p>}
              {notice && <p className="text-sm text-emerald-700" role="status">{notice}</p>}
              {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
            </div>
          </Card>

          <Card title="Approved reference recordings" subtitle={`${references.length} published reference${references.length === 1 ? '' : 's'}`}>
            {references.length === 0 ? <p className="text-sm text-[#6B7F95]">No approved reference recordings are available yet.</p> : <div className="space-y-4">
              {references.map((reference) => <article key={reference.id} className="space-y-2 border-b border-[#E8EEF5] pb-4 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold text-[#17324D]">{reference.title}</h3><p className="mt-1 text-xs text-[#5D7188]">{[reference.machine_name, reference.component, reference.operation, reference.operating_conditions].filter(Boolean).join(' · ') || `${reference.duration_seconds}s recording`}</p></div><Badge variant="success" size="sm">Approved</Badge></div>
                {reference.interpretation && <p className="text-sm leading-6 text-[#3E536A]">{reference.interpretation}</p>}
                {reference.audio_url && <audio className="w-full" controls preload="none" src={reference.audio_url} />}
                <CitationList citations={reference.source_references || []} />
              </article>)}
            </div>}
          </Card>
        </section>

        <section className="space-y-5">
          {result ? <Card title="Comparison result" subtitle={`Analysis ${result.id.slice(0, 8)} · ${result.reason_code}`} badge={<Badge variant={result.status === 'MATCHED' ? 'success' : result.status === 'FAILED' ? 'danger' : 'warning'} size="sm">{result.status.replace(/_/g, ' ')}</Badge>}>
            <div className="space-y-4">
              <div className="flex gap-3 rounded-xl bg-[#F3F8FE] p-4 text-sm text-[#29455F]">{statusIcon}<p>{result.message}</p></div>
              <p className="text-xs text-[#5D7188]">{result.limitation}</p>
              {result.matched_reference && <article className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-[#17324D]">Similar to: {result.matched_reference.title}</h3><p className="mt-1 text-xs text-[#5D7188]">{[result.matched_reference.machine_name, result.matched_reference.model_name, result.matched_reference.component, result.matched_reference.operation].filter(Boolean).join(' · ')}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#17324D]">Similarity {result.matched_reference.similarity_score.toFixed(3)} / 1</span></div>
                {result.matched_reference.operating_conditions && <p className="mt-3 text-sm text-[#3E536A]"><strong>Recorded conditions:</strong> {result.matched_reference.operating_conditions}</p>}
                <p className="mt-3 text-sm leading-6 text-[#3E536A]"><strong>Expert approved interpretation:</strong> {result.matched_reference.interpretation}</p>
                <CitationList citations={result.matched_reference.knowledge_sources || []} />
              </article>}
              {result.candidate_matches.length > 0 && <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#17324D]">{result.status === 'MATCHED' ? 'Other close references' : 'Closest references (not confirmed matches)'}</h3>
                {result.candidate_matches.map((candidate) => <div key={candidate.reference_id} className="flex items-start justify-between gap-4 rounded-lg border border-[#DCE6F0] p-3 text-sm"><div><p className="font-medium text-[#17324D]">{candidate.title}</p><p className="mt-1 text-xs text-[#5D7188]">{[candidate.machine_name, candidate.component, candidate.operation].filter(Boolean).join(' · ')}</p></div><span className="whitespace-nowrap text-xs font-semibold text-[#29455F]">Similarity {candidate.similarity_score.toFixed(3)}</span></div>)}
              </div>}
              {result.status === 'NO_RELIABLE_MATCH' && result.review_status !== 'pending' && <div className="space-y-2 border-t border-[#E8EEF5] pt-4"><label className="block text-sm font-medium text-[#17324D]" htmlFor="review-note">Note for the expert (optional)</label><textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={2} maxLength={2000} className="w-full rounded-lg border border-[#C8D7E8] p-3 text-sm" placeholder="What operation or condition should the expert know about?" /><Button variant="secondary" onClick={submitForReview} disabled={busy} icon={<Send className="h-4 w-4" />}>Send recording for expert review</Button><p className="text-xs text-[#6B7F95]">The sound is stored privately for review and is never added as an approved reference automatically.</p></div>}
              {result.review_status === 'pending' && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">This recording is waiting in the private expert review queue.</p>}
            </div>
          </Card> : <Card>
            <div className="py-16 text-center"><AudioLines className="mx-auto h-10 w-10 text-[#9AADC1]" /><h2 className="mt-3 text-lg font-semibold text-[#17324D]">Ready to compare</h2><p className="mx-auto mt-2 max-w-sm text-sm text-[#5D7188]">Record or upload a real machine sound. The system compares it with published reference recordings only.</p></div>
          </Card>}

          {canManage && <Card title="Add an expert reference" subtitle="A second authorized reviewer must publish it before matching can use it.">
            {draftReferences.length > 0 && <div className="mb-4 rounded-lg bg-[#F3F8FE] p-3">
              <p className="mb-2 text-xs font-semibold text-[#29455F]">Your saved drafts</p>
              <div className="flex flex-wrap gap-2">{draftReferences.map((reference) => <Button key={reference.id} type="button" size="sm" variant={referenceDraftId === reference.id ? 'primary' : 'secondary'} onClick={() => loadDraftIntoForm(reference)}>{reference.title}</Button>)}</div>
            </div>}
            <form className="space-y-3" onSubmit={createReference}>
              <label className="block text-xs font-medium text-[#29455F]">Reference recording <input key={referenceDraftId || 'new-reference-file'} className="mt-1 block w-full text-xs" type="file" accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,.wav,.flac,.mp3" required={!referenceDraftId} disabled={!!referenceDraftId} onChange={(event) => setDraftFile(event.target.files?.[0] || null)} /></label>
              <Field label="Title" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} required />
              <Field label="Expert approved interpretation" value={draft.interpretation} onChange={(value) => setDraft({ ...draft, interpretation: value })} required multiline />
              <Field label="Description (optional)" value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} multiline />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Machine ID (optional)" value={draft.machine_id} onChange={(value) => setDraft({ ...draft, machine_id: value })} />
                <Field label="Machine model" value={draft.model_name} onChange={(value) => setDraft({ ...draft, model_name: value })} />
                <Field label="Component or tool" value={draft.component} onChange={(value) => setDraft({ ...draft, component: value })} />
                <Field label="Operation" value={draft.operation} onChange={(value) => setDraft({ ...draft, operation: value })} />
                <Field label="Operating conditions" value={draft.operating_conditions} onChange={(value) => setDraft({ ...draft, operating_conditions: value })} />
                <Field label="Recording source" value={draft.recording_source} onChange={(value) => setDraft({ ...draft, recording_source: value })} />
              </div>
              <label className="block text-xs font-medium text-[#29455F]">Approved knowledge sources
                <select multiple value={selectedSources} onChange={(event) => setSelectedSources(Array.from(event.target.selectedOptions, (option) => option.value))} className="mt-1 h-32 w-full rounded-lg border border-[#C8D7E8] p-2 text-sm" required={!referenceDraftId} disabled={!!referenceDraftId}>
                  {sources.map((source) => <option key={source.version_id} value={source.version_id}>{source.title} · v{source.version_no}</option>)}
                </select>
              </label>
              <p className="text-xs text-[#6B7F95]">Select at least one current published knowledge revision. Unknown machine details can be left blank. After creating a draft, edit its details and submit it for independent review.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || (!referenceDraftId && (!draftFile || selectedSources.length === 0))} isLoading={busy} icon={<BookOpen className="h-4 w-4" />}>{referenceDraftId ? 'Save edits and send to review' : 'Create reference draft'}</Button>
                {referenceDraftId && <Button type="button" variant="secondary" onClick={clearReferenceDraft} disabled={busy}>Cancel editing</Button>}
                <a className="inline-flex items-center self-center text-sm text-blue-700 underline" href="/app/reviews">Open shared review queue</a>
              </div>
            </form>
          </Card>}

          {canManage && <Card title="Unmatched recording review" subtitle="Reviewing a sample never publishes it as a machine reference.">
            {reviewQueue.length === 0 ? <p className="text-sm text-[#6B7F95]">There are no audio samples waiting for review.</p> : <div className="space-y-4">
              {reviewQueue.map((submission) => <article key={submission.id} className="space-y-3 border-b border-[#E8EEF5] pb-4 last:border-0 last:pb-0">
                <div><h3 className="text-sm font-semibold text-[#17324D]">Audio submission · {submission.reason_code}</h3><p className="mt-1 text-xs text-[#5D7188]">{submission.message}</p></div>
                {submission.audio_url && <audio className="w-full" controls preload="none" src={submission.audio_url} />}
                {submission.review_note && <p className="rounded bg-[#F3F8FE] p-2 text-xs text-[#29455F]">Submitter note: {submission.review_note}</p>}
                <textarea rows={2} maxLength={2000} value={reviewComments[submission.id] || ''} onChange={(event) => setReviewComments({ ...reviewComments, [submission.id]: event.target.value })} className="w-full rounded-lg border border-[#C8D7E8] p-2 text-xs" placeholder="Review note or what additional context is needed" />
                <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => decideSubmission(submission.id, 'changes_requested')}>Request more context</Button><Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => decideSubmission(submission.id, 'rejected')}>Decline sample</Button></div>
                <p className="text-xs text-[#6B7F95]">To publish a reference, create a separate draft above and link it to a current published knowledge source.</p>
              </article>)}
            </div>}
          </Card>}
        </section>
      </div>
    </main>
  );
};

const CitationList: React.FC<{ citations: Citation[] }> = ({ citations }) => citations.length ? <div className="mt-3 border-t border-[#E2EAF2] pt-3"><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#29455F]"><BookOpen className="h-3.5 w-3.5" /> Approved knowledge sources</p><ul className="space-y-1">{citations.map((citation) => <li key={citation.knowledge_version_id}><a className="text-xs text-blue-700 underline hover:text-blue-900" href={citationUrl(citation)}>{citation.title}{citation.version_no ? ` · v${citation.version_no}` : ''}</a></li>)}</ul></div> : <p className="mt-3 flex items-center gap-1.5 text-xs text-[#6B7F95]"><Wrench className="h-3.5 w-3.5" /> No additional published source was returned.</p>;

const Field: React.FC<{ label: string; value: string; onChange: (value: string) => void; required?: boolean; multiline?: boolean }> = ({ label, value, onChange, required, multiline }) => {
  const common = { value, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), required, className: 'mt-1 w-full rounded-lg border border-[#C8D7E8] p-2.5 text-sm outline-none focus:border-blue-500' };
  return <label className="block text-xs font-medium text-[#29455F]">{label}{multiline ? <textarea {...common} rows={3} /> : <input {...common} />}</label>;
};
