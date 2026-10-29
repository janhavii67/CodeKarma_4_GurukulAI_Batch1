import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  CircleHelp,
  Clock,
  Mic,
  Square,
  Upload,
  ShieldAlert,
  Send,
  BookOpen,
  Wrench,
  ChevronDown,
  BadgeCheck,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sparkles,
  Search,
  Database,
  FileAudio,
  RefreshCw,
  ExternalLink,
  Cpu,
  Stethoscope,
  Radio,
  X,
  Info,
  Headphones,
  Check,
  HelpCircle,
  AlertOctagon,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api/client';

// ─── Data Contracts & Types ───────────────────────────────────────────────────

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
  manufacturer?: string;
  component?: string;
  operation?: string;
  sound_label?: string;
  annotation_notes?: string;
  operating_conditions?: string;
  duration_seconds: number;
  status: string;
  audio_url?: string;
  is_expert_verified?: boolean;
  source_references: Citation[];
  knowledge_version_id?: string;
  recorded_at?: string;
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

interface HistoryItem {
  id: string;
  status: string;
  reason_code: string;
  message: string;
  similarity_score?: number;
  matched_reference_title?: string;
  matched_reference_id?: string;
  machine_id?: string;
  review_status?: string;
  requires_expert_review: boolean;
  created_at: string;
}

interface Machine {
  id: string;
  name: string;
  code?: string;
  model_number?: string;
}

// ─── Constants & Metadata ─────────────────────────────────────────────────────

const SOUND_LABELS: Record<string, { label: string; tag: string; isAnomaly: boolean }> = {
  normal_operation: { label: 'Normal Baseline Operation', tag: 'Normal', isAnomaly: false },
  alarm: { label: 'Active Alarm / Warning Alert', tag: 'Alarm', isAnomaly: true },
  abnormal_vibration: { label: 'Abnormal Structural Vibration', tag: 'Vibration', isAnomaly: true },
  unusual_noise: { label: 'Unusual Mechanical Noise / Arcing', tag: 'Anomaly', isAnomaly: true },
  pump_irregularity: { label: 'Pump Cavitation / Fluid Anomaly', tag: 'Pump Fault', isAnomaly: true },
  fan_noise: { label: 'Cooling Blower / Fan Anomaly', tag: 'Cooling Fan', isAnomaly: true },
  loose_component: { label: 'Loose Fastener / Chattering', tag: 'Mechanical', isAnomaly: true },
  incorrect_setting: { label: 'Parameter Setting Conflict', tag: 'Operating Setting', isAnomaly: true },
  verified_fault: { label: 'Verified Hardware Failure', tag: 'Hardware Failure', isAnomaly: true },
  other: { label: 'Unclassified Acoustic Pattern', tag: 'Observation', isAnomaly: false },
};

const MODALITY_FILTERS = [
  { id: 'all', label: 'All Equipment', icon: Stethoscope },
  { id: 'xray', label: 'X-Ray Systems', icon: Radio, matchStr: 'xray' },
  { id: 'ct', label: 'CT Scanners', icon: Cpu, matchStr: 'ct' },
  { id: 'mri', label: 'MRI Magnets', icon: Activity, matchStr: 'mri' },
  { id: 'ecg', label: 'ECG Monitors', icon: Headphones, matchStr: 'ecg' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function generateSynthesizedSample(kind: 'xray' | 'ct' | 'mri' | 'ecg'): File {
  const sampleRate = 16000;
  const duration = 2.0;
  const frameCount = Math.floor(sampleRate * duration);
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const buffer = audioCtx.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i++) {
    const t = i / sampleRate;
    if (kind === 'xray') {
      data[i] =
        0.35 * Math.sin(2 * Math.PI * 150 * t) +
        0.15 * Math.sin(2 * Math.PI * 300 * t) +
        (Math.random() - 0.5) * 0.04;
    } else if (kind === 'ct') {
      data[i] =
        0.35 * Math.sin(2 * Math.PI * 120 * t) +
        0.12 * Math.sin(2 * Math.PI * 240 * t) +
        (Math.random() - 0.5) * 0.06;
    } else if (kind === 'mri') {
      const isKnock = (i % 4000) < 450;
      data[i] =
        (isKnock ? 0.45 * Math.sin(2 * Math.PI * 600 * t) : 0.05 * Math.sin(2 * Math.PI * 80 * t)) +
        (Math.random() - 0.5) * 0.04;
    } else {
      const isBeep = (i % 16000) < 1800;
      data[i] =
        (isBeep ? 0.40 * Math.sin(2 * Math.PI * 1000 * t) : 0) +
        (Math.random() - 0.5) * 0.02;
    }
  }

  const blob = wavFromBuffer(buffer);
  const names: Record<string, string> = {
    xray: 'sample-xray-generator-warmup.wav',
    ct: 'sample-ct-gantry-low-speed.wav',
    mri: 'sample-mri-gradient-knocking.wav',
    ecg: 'sample-ecg-normal-qrs-beep.wav',
  };
  return new File([blob], names[kind], { type: 'audio/wav' });
}

function citationUrl(citation: Citation) {
  return `/app/knowledge/${encodeURIComponent(citation.knowledge_item_id)}?version_id=${encodeURIComponent(
    citation.knowledge_version_id
  )}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatSeconds(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
}

// ─── High-Contrast Interactive Waveform Component ─────────────────────────────

interface WaveformVisualizerProps {
  file?: File | null;
  audioUrl?: string | null;
  title: string;
  badgeLabel: string;
  theme: 'blue' | 'emerald';
  height?: number;
}

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  file,
  audioUrl,
  title,
  badgeLabel,
  theme,
  height = 64,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (audioUrl) {
      setObjectUrl(audioUrl);
    } else {
      setObjectUrl(null);
    }
  }, [file, audioUrl]);

  useEffect(() => {
    let cancelled = false;
    const decode = async () => {
      try {
        let arrayBuffer: ArrayBuffer | null = null;
        if (file) {
          arrayBuffer = await file.arrayBuffer();
        } else if (audioUrl) {
          const res = await fetch(audioUrl);
          arrayBuffer = await res.arrayBuffer();
        }
        if (!arrayBuffer || cancelled) return;

        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        if (cancelled) {
          await audioCtx.close();
          return;
        }

        const channel = decoded.getChannelData(0);
        const buckets = 64;
        const bucketSize = Math.floor(channel.length / buckets);
        const computed: number[] = [];

        for (let i = 0; i < buckets; i++) {
          let sum = 0;
          const start = i * bucketSize;
          for (let j = 0; j < bucketSize; j++) {
            sum += Math.abs(channel[start + j] || 0);
          }
          const avg = sum / (bucketSize || 1);
          computed.push(Math.min(1, Math.max(0.1, avg * 2.6)));
        }

        setPeaks(computed);
        setDuration(decoded.duration);
        await audioCtx.close();
      } catch {
        // Fallback procedural waveform envelope if decoding fails
        const fallback = Array.from({ length: 64 }, (_, i) =>
          0.18 + 0.62 * Math.sin((i / 64) * Math.PI) * (0.7 + 0.3 * Math.random())
        );
        setPeaks(fallback);
      }
    };

    void decode();
    return () => {
      cancelled = true;
    };
  }, [file, audioUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const h = height;
    canvas.width = width * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, h);

    if (peaks.length === 0) {
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(0, h / 2 - 1, width, 2);
      return;
    }

    const barWidth = 4;
    const gap = Math.max(2, (width - peaks.length * barWidth) / (peaks.length - 1));
    const progressPct = duration > 0 ? currentTime / duration : 0;

    peaks.forEach((peak, index) => {
      const x = index * (barWidth + gap);
      const barHeight = Math.max(6, peak * (h - 10));
      const y = (h - barHeight) / 2;
      const isPlayed = x / width <= progressPct;

      if (isPlayed) {
        ctx.fillStyle = theme === 'emerald' ? '#059669' : '#0284C7';
      } else {
        ctx.fillStyle = '#CBD5E1';
      }

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, barWidth, barHeight, 2);
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
    });

    if (progressPct > 0 && progressPct <= 1) {
      const playheadX = progressPct * width;
      ctx.fillStyle = theme === 'emerald' ? '#047857' : '#0369A1';
      ctx.fillRect(playheadX - 1.5, 0, 3, h);
    }
  }, [peaks, currentTime, duration, height, theme]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  };

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        theme === 'emerald'
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-slate-200 bg-white'
      }`}
    >
      {/* Header bar */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
              theme === 'emerald' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {badgeLabel}
          </span>
          <span className="font-bold text-slate-900 text-sm truncate max-w-[260px]">{title}</span>
        </div>
        <span className="font-mono text-xs font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
          {formatSeconds(currentTime)} / {formatSeconds(duration || 0)}
        </span>
      </div>

      {objectUrl && (
        <audio
          ref={audioRef}
          src={objectUrl}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          preload="metadata"
          className="hidden"
        />
      )}

      {/* Play Controls & Waveform */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!objectUrl}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            theme === 'emerald'
              ? 'bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500'
              : 'bg-teal-600 hover:bg-teal-500 focus:ring-teal-500'
          }`}
          title={isPlaying ? 'Pause' : 'Play audio'}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white ml-0.5" />}
        </button>

        <div className="relative flex-1 cursor-pointer" onClick={handleSeek}>
          <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px` }} className="block" />
        </div>

        <button
          type="button"
          onClick={() => {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              setCurrentTime(0);
            }
          }}
          className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition-colors"
          title="Restart from beginning"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// ─── Main Component: SoundAnalysisPage ────────────────────────────────────────

export const SoundAnalysisPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('audio.manage');

  // Shared Data State
  const [references, setReferences] = useState<AudioReference[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [sources, setSources] = useState<PublishedKnowledge[]>([]);
  const [draftReferences, setDraftReferences] = useState<AudioReference[]>([]);
  const [reviewQueue, setReviewQueue] = useState<AudioReviewSubmission[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Navigation & Drawer Views
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'studio'>('diagnostics');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showLibraryDrawer, setShowLibraryDrawer] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFilterModality, setLibraryFilterModality] = useState('all');

  // Trainee Analysis State
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [selectedModality, setSelectedModality] = useState('all');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const resultRef = useRef<HTMLDivElement | null>(null);

  // Selected Alternative Reference for Side-by-Side Comparison
  const [comparisonCandidate, setComparisonCandidate] = useState<Candidate | null>(null);

  // Expert Studio Form State
  const [referenceDraftId, setReferenceDraftId] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [draft, setDraft] = useState({
    title: '',
    interpretation: '',
    description: '',
    machine_id: '',
    model_name: '',
    manufacturer: '',
    component: '',
    operation: '',
    sound_label: '',
    annotation_notes: '',
    operating_conditions: '',
    recording_source: '',
    recorded_at: '',
  });
  const [draftFile, setDraftFile] = useState<File | null>(null);

  // Recorder Refs
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // ─── Data Loading ────────────────────────────────────────────────────────────

  const loadReferences = async () => {
    try {
      setReferences((await api.get<AudioReference[]>('/audio/references')) || []);
    } catch {
      setReferences([]);
    }
  };

  const loadReferenceDrafts = async () => {
    if (!canManage) return;
    try {
      setDraftReferences((await api.get<AudioReference[]>('/audio/references/drafts')) || []);
    } catch {
      setDraftReferences([]);
    }
  };

  const loadReviewQueue = async () => {
    if (!canManage) return;
    try {
      const queue = await api.get<Array<{ id: string }>>('/audio/review-submissions');
      if (queue && queue.length) {
        const details = await Promise.all(
          queue.map((item) => api.get<AudioReviewSubmission>(`/audio/review-submissions/${item.id}`))
        );
        setReviewQueue(details.filter(Boolean));
      } else {
        setReviewQueue([]);
      }
    } catch {
      setReviewQueue([]);
    }
  };

  const loadHistory = async () => {
    try {
      setHistory((await api.get<HistoryItem[]>('/audio/analysis-jobs?page_size=30')) || []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    void loadReferences();
    void loadHistory();
    api
      .get<{ items: Machine[] }>('/machines?page_size=100')
      .then((data) => setMachines(data?.items || []))
      .catch(() => setMachines([]));

    if (canManage) {
      api
        .get<{ items: PublishedKnowledge[] }>('/knowledge?status=published&page_size=100')
        .then((data) => setSources((data?.items || []).filter((i) => i.version_status === 'published')))
        .catch(() => setSources([]));
      void loadReferenceDrafts();
      void loadReviewQueue();
    }
  }, [canManage]);

  // Clean-up on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  // ─── Recording Routines ───────────────────────────────────────────────────────

  const startRecording = async () => {
    setError('');
    setNotice('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('Microphone recording is not supported in this browser. Please upload a WAV/FLAC file.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size) recordingChunksRef.current.push(e.data);
      };

      recorder.onerror = () => {
        setError('Microphone recording error. Please upload an audio file instead.');
        stopRecording();
      };

      recorder.onstop = async () => {
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        try {
          const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const ctx = new AudioContext();
          const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
          const wav = wavFromBuffer(decoded);
          const newFile = new File([wav], `field-recording-${Date.now()}.wav`, { type: 'audio/wav' });
          setFile(newFile);
          setNotice(`Field recording acquired successfully (${Math.round(decoded.duration)}s). Click "Analyze Machine Sound" below.`);
          await ctx.close();
        } catch {
          setError('Could not decode audio recording. Try uploading a WAV or FLAC file.');
        } finally {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setRecording(false);
          setRecordDuration(0);
        }
      };

      recorder.start();
      setRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  // ─── Analysis Action ─────────────────────────────────────────────────────────

  const runAnalysis = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    setComparisonCandidate(null);
    setNotice('Extracting log-mel acoustic filterbanks & matching against published medical references…');

    const form = new FormData();
    form.append('file', file);
    if (selectedMachine) {
      form.append('machine_id', selectedMachine);
    }

    try {
      const response = await api.postForm<AnalysisResult>('/audio/analyze', form);
      setResult(response);
      setNotice('Acoustic pattern comparison complete. Review diagnostic details below.');
      await loadReferences();
      await loadHistory();
      setTimeout(() => {
        if (typeof resultRef.current?.scrollIntoView === 'function') {
          resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (err) {
      setNotice('');
      setError(err instanceof Error ? err.message : 'Acoustic matching request failed.');
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
      setNotice('Acoustic sample submitted to expert review queue for peer verification.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit recording for expert review.');
    } finally {
      setBusy(false);
    }
  };

  // ─── Expert Studio CRUD ───────────────────────────────────────────────────────

  const loadDraftIntoForm = (reference: AudioReference) => {
    setReferenceDraftId(reference.id);
    setDraft({
      title: reference.title,
      interpretation: reference.interpretation || '',
      description: reference.description || '',
      machine_id: reference.machine_id || '',
      model_name: reference.model_name || '',
      manufacturer: reference.manufacturer || '',
      component: reference.component || '',
      operation: reference.operation || '',
      sound_label: reference.sound_label || '',
      annotation_notes: reference.annotation_notes || '',
      operating_conditions: reference.operating_conditions || '',
      recording_source: '',
      recorded_at: '',
    });
    setSelectedSources((reference.source_references || []).map((c) => c.knowledge_version_id));
    setDraftFile(null);
    setNotice(`Loaded draft for editing: ${reference.title}`);
    setError('');
  };

  const clearReferenceDraft = () => {
    setReferenceDraftId(null);
    setSelectedSources([]);
    setDraftFile(null);
    setDraft({
      title: '',
      interpretation: '',
      description: '',
      machine_id: '',
      model_name: '',
      manufacturer: '',
      component: '',
      operation: '',
      sound_label: '',
      annotation_notes: '',
      operating_conditions: '',
      recording_source: '',
      recorded_at: '',
    });
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
        Object.entries(draft).forEach(([key, value]) => {
          if (value.trim()) form.append(key, value.trim());
        });
        form.append('source_version_ids', selectedSources.join(','));
        const created = await api.postForm<AudioReference>('/audio/references', form);
        setReferenceDraftId(created.id);
        setNotice('Draft created! Verify metadata and submit to peer review queue.');
        await loadReferenceDrafts();
        return;
      }

      await api.patch(`/audio/references/${referenceDraftId}`, {
        title: draft.title,
        interpretation: draft.interpretation,
        description: draft.description || null,
        machine_id: draft.machine_id || null,
        model_name: draft.model_name || null,
        manufacturer: draft.manufacturer || null,
        component: draft.component || null,
        operation: draft.operation || null,
        sound_label: draft.sound_label || null,
        annotation_notes: draft.annotation_notes || null,
        operating_conditions: draft.operating_conditions || null,
        recording_source: draft.recording_source || null,
      });

      await api.post(`/audio/references/${referenceDraftId}/submit`, {});
      setNotice('Reference submitted to peer review queue. It becomes active upon second expert sign-off.');
      clearReferenceDraft();
      await loadReferences();
      await loadReferenceDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reference draft.');
    } finally {
      setBusy(false);
    }
  };

  const decideSubmission = async (id: string, decision: 'rejected' | 'changes_requested') => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/audio/review-submissions/${id}/decision`, {
        decision,
        comment: reviewComments[id] || undefined,
      });
      await loadReviewQueue();
      setNotice(
        decision === 'rejected'
          ? 'Submission archived.'
          : 'Additional operational recording requested from technician.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process submission decision.');
    } finally {
      setBusy(false);
    }
  };

  // ─── Filtered Data ───────────────────────────────────────────────────────────

  const filteredMachines = useMemo(() => {
    if (selectedModality === 'all') return machines;
    const search = selectedModality.toLowerCase();
    return machines.filter((m) => m.name.toLowerCase().includes(search) || (m.code && m.code.toLowerCase().includes(search)));
  }, [machines, selectedModality]);

  const activeMachineObj = useMemo(() => {
    return machines.find((m) => m.id === selectedMachine);
  }, [machines, selectedMachine]);

  const filteredLibraryReferences = useMemo(() => {
    return references.filter((r) => {
      const matchModality =
        libraryFilterModality === 'all' ||
        (r.machine_name && r.machine_name.toLowerCase().includes(libraryFilterModality)) ||
        r.title.toLowerCase().includes(libraryFilterModality);
      const matchSearch =
        !librarySearch.trim() ||
        r.title.toLowerCase().includes(librarySearch.toLowerCase()) ||
        (r.component && r.component.toLowerCase().includes(librarySearch.toLowerCase())) ||
        (r.manufacturer && r.manufacturer.toLowerCase().includes(librarySearch.toLowerCase()));
      return matchModality && matchSearch;
    });
  }, [references, libraryFilterModality, librarySearch]);

  // Primary candidate: use matched_reference, or top candidate in ambiguous/no-match states
  const primaryCandidate = useMemo(() => {
    return result?.matched_reference || result?.candidate_matches?.[0] || null;
  }, [result]);

  // Find Matched Expert Audio Record from library
  const matchedReferenceRecord = useMemo(() => {
    if (!primaryCandidate) return null;
    return references.find(
      (r) =>
        r.knowledge_version_id === primaryCandidate.knowledge_version_id ||
        r.id === primaryCandidate.reference_id
    );
  }, [primaryCandidate, references]);

  // Measured similarity score
  const primaryScore = useMemo(() => {
    if (result?.similarity_score !== undefined && result.similarity_score !== null) {
      return result.similarity_score;
    }
    return primaryCandidate?.similarity_score ?? 0;
  }, [result, primaryCandidate]);

  // Currently Selected Reference for Comparison (default to best match, or user-selected candidate)
  const activeComparisonRef = useMemo(() => {
    if (comparisonCandidate) {
      const found = references.find(
        (r) =>
          r.knowledge_version_id === comparisonCandidate.knowledge_version_id ||
          r.id === comparisonCandidate.reference_id
      );
      return {
        title: comparisonCandidate.title,
        audio_url: found?.audio_url,
        score: comparisonCandidate.similarity_score,
      };
    }
    if (primaryCandidate) {
      return {
        title: primaryCandidate.title,
        audio_url: matchedReferenceRecord?.audio_url,
        score: primaryScore,
      };
    }
    return null;
  }, [comparisonCandidate, primaryCandidate, matchedReferenceRecord, primaryScore, references]);

  // Secondary candidates: filter out the primary candidate to prevent duplicate entries
  const secondaryCandidates = useMemo(() => {
    if (!result?.candidate_matches) return [];
    if (!primaryCandidate) return result.candidate_matches;
    return result.candidate_matches.filter(
      (c) => c.reference_id !== primaryCandidate.reference_id
    );
  }, [result, primaryCandidate]);

  // Cross-equipment detection flag (Requirement 4: flag cross-equipment matches without silent filtering)
  const crossEquipmentWarning = useMemo(() => {
    if (!primaryCandidate) return null;
    const candMachine = primaryCandidate.machine_name || '';
    if (selectedModality !== 'all') {
      const matchMod = MODALITY_FILTERS.find((m) => m.id === selectedModality);
      if (
        matchMod?.matchStr &&
        !candMachine.toLowerCase().includes(matchMod.matchStr) &&
        !primaryCandidate.title.toLowerCase().includes(matchMod.matchStr)
      ) {
        return `Cross-equipment candidate: This recording matched a ${candMachine || 'different equipment'} reference profile. The backend matched purely on acoustic frequency signatures without modality constraints. Technician verification is required before applying this guidance.`;
      }
    }
    if (activeMachineObj && candMachine) {
      if (
        !candMachine.toLowerCase().includes(activeMachineObj.name.toLowerCase()) &&
        !activeMachineObj.name.toLowerCase().includes(candMachine.toLowerCase())
      ) {
        return `Cross-equipment candidate: Selected machine is "${activeMachineObj.name}", but the closest acoustic signature belongs to "${candMachine}". Technician verification is required.`;
      }
    }
    return null;
  }, [primaryCandidate, selectedModality, activeMachineObj]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 text-slate-800">
      {/* ── 1. TOP HEADER & TELEMETRY ─────────────────────────────────────────── */}
      <header className="border-b border-slate-200/90 bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm ring-4 ring-teal-50">
              <AudioLines className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Acoustic Diagnostic Workstation
                </h1>
                <span className="rounded-md bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-800 ring-1 ring-inset ring-teal-200">
                  SUJANA AI · Module 07
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Medical equipment sound matching, baseline comparison & condition inference
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Engine Online · Log-Mel FFT
            </div>

            <button
              onClick={() => setShowLibraryDrawer(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 shadow-2xs hover:border-slate-300 hover:bg-slate-50 transition-colors"
            >
              <Database className="h-3.5 w-3.5 text-teal-600" />
              <span>{references.length} Verified References</span>
            </button>

            <button
              onClick={() => setShowHistoryDrawer(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 shadow-2xs hover:border-slate-300 hover:bg-slate-50 transition-colors"
            >
              <Clock className="h-3.5 w-3.5 text-blue-600" />
              <span>History ({history.length})</span>
            </button>

            {canManage && (
              <div className="ml-1 flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('diagnostics')}
                  className={`rounded-md px-3 py-1 font-bold text-xs transition-all ${
                    activeTab === 'diagnostics'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Diagnostic Console
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('studio')}
                  className={`flex items-center gap-1 rounded-md px-3 py-1 font-bold text-xs transition-all ${
                    activeTab === 'studio'
                      ? 'bg-white text-teal-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="h-3 w-3 text-teal-600" />
                  Expert Studio
                  {draftReferences.length > 0 && (
                    <span className="ml-1 rounded-full bg-teal-100 px-1.5 py-0.2 text-[10px] font-bold text-teal-800">
                      {draftReferences.length}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── 2. CLINICAL DIAGNOSTIC DISCLAIMER ─────────────────────────────────── */}
      <div className="bg-amber-50/70 border-b border-amber-200/80 px-4 py-2.5 text-xs text-amber-950 font-medium">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>Diagnostic Protocol Notice:</strong> Acoustic matching identifies physical sound resemblance against peer-approved reference baselines. Acoustic similarity does not replace certified field service inspection, physical tool measurement, or electrical safety testing. It does <strong>NOT</strong> confirm a hardware fault or declare an operating machine safe. Always perform certified physical inspections and follow lockout/tagout procedures.
            </span>
          </div>
          <a
            href="/app/procedures/library"
            className="shrink-0 text-amber-900 hover:text-amber-950 font-bold underline hidden sm:inline"
          >
            Approved SOP Manuals →
          </a>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Banner Notifications */}
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-medium text-rose-900 shadow-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError('')} className="text-rose-600 hover:text-rose-900">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {notice && !error && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm font-medium text-teal-900 shadow-xs">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice('')} className="text-teal-600 hover:text-teal-900">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* WORKSPACE STAGE: ACQUISITION, CONTEXT & UPLOAD                        */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-6">
            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 1. VISUAL CENTER: MACHINE SOUND ANALYSIS RESULT (TOP OF PAGE)     */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {result && (
              <div
                ref={resultRef}
                className={`rounded-3xl border-2 bg-white p-6 sm:p-9 shadow-md space-y-7 animate-in fade-in-50 duration-300 ${
                  result.status === 'MATCHED'
                    ? 'border-emerald-500 ring-4 ring-emerald-500/10'
                    : result.status === 'AMBIGUOUS_MATCH'
                    ? 'border-amber-500 ring-4 ring-amber-500/10'
                    : 'border-slate-400 ring-4 ring-slate-400/10'
                }`}
              >
                {/* Header Banner & Status Badge */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">
                      MACHINE SOUND ANALYSIS RESULT
                    </span>
                    <span className="text-slate-300">•</span>
                    <span
                      className={`rounded-full px-3.5 py-1 text-xs font-bold border ${
                        result.status === 'MATCHED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : result.status === 'AMBIGUOUS_MATCH'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}
                    >
                      {result.status === 'MATCHED'
                        ? 'Match found'
                        : result.status === 'AMBIGUOUS_MATCH'
                        ? 'Ambiguous match'
                        : 'No match'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Job #{result.id.slice(0, 8)} · {result.reason_code}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const dropzone = document.getElementById('audio-ingestion-card');
                        if (dropzone && typeof dropzone.scrollIntoView === 'function') {
                          dropzone.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Upload Different Audio ↓
                    </button>
                  </div>
                </div>

                {/* ── THE PROMINENT CONDITION NAME (LARGEST TEXT ON PAGE) ───────── */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-md text-xs font-bold ${
                        result.status === 'MATCHED'
                          ? 'bg-emerald-100 text-emerald-900'
                          : result.status === 'AMBIGUOUS_MATCH'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {result.status === 'MATCHED' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-700" />
                          <span>Match Found: {primaryCandidate?.title || 'Verified Baseline Match'}</span>
                        </>
                      ) : result.status === 'AMBIGUOUS_MATCH' ? (
                        <>
                          <CircleHelp className="h-3.5 w-3.5 text-amber-700" />
                          <span>Ambiguous Match: Multiple Close Reference Profiles</span>
                        </>
                      ) : (
                        <>
                          <AlertOctagon className="h-3.5 w-3.5 text-slate-700" />
                          <span>No Reliable Reference Match Identified</span>
                        </>
                      )}
                    </span>
                    {matchedReferenceRecord?.is_expert_verified && (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                        <BadgeCheck className="h-4 w-4" /> Expert Verified Reference
                      </span>
                    )}
                  </div>

                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
                    {result.status === 'MATCHED'
                      ? (primaryCandidate?.title || 'Verified Baseline Condition')
                      : result.status === 'AMBIGUOUS_MATCH'
                      ? `Ambiguous: ${primaryCandidate?.title || 'Multiple Close Profiles'}`
                      : 'No reliable matching sound found'}
                  </h1>
                </div>

                {/* ── HIGHLIGHTED MAIN SUMMARY: WHAT THE SOUND INDICATES ───────── */}
                <div
                  className={`rounded-2xl border-2 p-5 sm:p-6 space-y-4 shadow-sm transition-all ${
                    result.status === 'MATCHED'
                      ? 'border-emerald-500 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/60 ring-1 ring-emerald-500/20'
                      : result.status === 'AMBIGUOUS_MATCH'
                      ? 'border-amber-500 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 ring-1 ring-amber-500/20'
                      : 'border-slate-300 bg-gradient-to-br from-slate-50 via-white to-slate-100 ring-1 ring-slate-300/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 border-slate-200/80">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-1.5 rounded-lg ${
                          result.status === 'MATCHED'
                            ? 'bg-emerald-600 text-white'
                            : result.status === 'AMBIGUOUS_MATCH'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-700 text-white'
                        }`}
                      >
                        <Activity className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                          Main Summary
                        </span>
                        <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
                          What This Sound Indicates
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-white border border-slate-200 text-slate-900 shadow-2xs">
                        <span className="text-slate-400 font-semibold">Similarity:</span>
                        <span className="text-emerald-700 font-extrabold">{(primaryScore * 100).toFixed(1)}% Match</span>
                        <span className="text-slate-400 font-mono text-[11px]">({primaryScore.toFixed(4)} / 1.0000)</span>
                      </span>
                    </div>
                  </div>

                  {/* Core Diagnostic Finding - LARGE, BOLD & HIGHLIGHTED */}
                  <div className="space-y-1.5">
                    <p className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                      {primaryCandidate?.interpretation
                        ? primaryCandidate.interpretation
                        : matchedReferenceRecord?.description
                        ? matchedReferenceRecord.description
                        : result.message}
                    </p>
                    {primaryCandidate && (
                      <p className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                        <span>
                          Equipment:{' '}
                          <strong className="text-slate-800">
                            {primaryCandidate.machine_name} {primaryCandidate.model_name ? `(${primaryCandidate.model_name})` : ''}
                          </strong>
                        </span>
                        {primaryCandidate.component && (
                          <span>
                            Subsystem: <strong className="text-slate-800">{primaryCandidate.component}</strong>
                          </span>
                        )}
                        {primaryCandidate.operation && (
                          <span>
                            Operating Mode: <strong className="text-slate-800">{primaryCandidate.operation}</strong>
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Immediate Action / SOP - HIGH VISIBILITY CALLOUT */}
                  <div
                    className={`rounded-xl border p-4 space-y-2 ${
                      result.status === 'MATCHED'
                        ? 'border-emerald-300 bg-emerald-100/70 text-emerald-950'
                        : result.status === 'AMBIGUOUS_MATCH'
                        ? 'border-amber-300 bg-amber-100/70 text-amber-950'
                        : 'border-slate-300 bg-slate-100/80 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                        <Wrench className="h-4 w-4" />
                        Immediate Action & Next Step:
                      </span>
                      {primaryCandidate?.knowledge_sources && primaryCandidate.knowledge_sources.length > 0 && (
                        <a
                          href={citationUrl(primaryCandidate.knowledge_sources[0])}
                          className="inline-flex items-center gap-1 text-xs font-bold underline hover:opacity-80"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          Open SOP Guide →
                        </a>
                      )}
                    </div>
                    <p className="text-sm font-semibold leading-relaxed">
                      {matchedReferenceRecord?.annotation_notes
                        ? matchedReferenceRecord.annotation_notes
                        : primaryCandidate?.knowledge_sources && primaryCandidate.knowledge_sources.length > 0
                        ? 'Consult the approved SOP linked below. Verify mounting, operating temperatures, and execute visual inspection before component teardown.'
                        : 'No approved troubleshooting instruction is currently available for this acoustic signature. Dispatch recording for certified engineering review.'}
                    </p>
                  </div>
                </div>

                {/* Visual Uncertainty Warning Banner for Ambiguous Matches */}
                {result.status === 'AMBIGUOUS_MATCH' && (
                  <div className="rounded-xl border-2 border-amber-400 bg-amber-50/90 p-4 text-xs font-semibold text-amber-950 flex items-start gap-3 shadow-xs">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="text-sm font-bold block text-amber-900">
                        ⚠️ Visual Uncertainty Warning — Match is Ambiguous
                      </strong>
                      <p className="leading-relaxed">
                        Multiple reference recordings scored within the ±4.0% ambiguity margin (top candidate scored {(primaryScore * 100).toFixed(1)}%). <strong>Never label an ambiguous match as a confirmed fault.</strong> Physical symptoms and operational conditions must be reviewed with an expert specialist.
                      </p>
                    </div>
                  </div>
                )}

                {/* Plain Language Metric Caveat */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600 leading-relaxed space-y-1">
                  <p>
                    <strong>Score Definition:</strong> Similarity score measures cosine overlap across 48 frequency filterbanks. Similarity is <strong>NOT</strong> a calibrated probability of machine failure, an operating lifetime projection, or proof of machine condition.
                  </p>
                  {primaryScore < 0.82 && (
                    <p className="text-slate-600 font-medium">
                      <strong>Below Screening Threshold:</strong> No reference met the current screening threshold (82.0%). Closest reference profiles are displayed for comparative inspection only.
                    </p>
                  )}
                </div>

                {/* Cross-Equipment Warning */}
                {crossEquipmentWarning && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <strong>Cross-Equipment Acoustic Match:</strong> {crossEquipmentWarning}
                    </div>
                  </div>
                )}

                {/* ── 5. AUDIO COMPARISON: SIDE-BY-SIDE ────────────────────────── */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <Headphones className="h-4 w-4 text-teal-600" />
                      Side-by-Side Audio Comparison (Trainee Input vs Reference Baseline)
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      Listen and compare frequency patterns
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <WaveformVisualizer
                      file={file}
                      title={file?.name || 'Your Field Recording'}
                      badgeLabel="Your Recording"
                      theme="blue"
                      height={56}
                    />

                    {activeComparisonRef?.audio_url ? (
                      <WaveformVisualizer
                        audioUrl={activeComparisonRef.audio_url}
                        title={activeComparisonRef.title}
                        badgeLabel={comparisonCandidate ? 'Comparison Alternative' : 'Reference Baseline'}
                        theme="emerald"
                        height={56}
                      />
                    ) : (
                      <div className="flex h-full min-h-[100px] items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-xs text-slate-400">
                        Reference baseline audio signature ({activeComparisonRef?.title || 'Stored on server'})
                      </div>
                    )}
                  </div>
                </div>

                {/* ── 4. WHAT THIS MEANS (STRUCTURED DIAGNOSTIC BREAKDOWN) ──────── */}
                {primaryCandidate && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                      <FileText className="h-4 w-4 text-teal-600" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        Technician Diagnostic Breakdown: What This Recording Means
                      </h4>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {/* 1. Observed Sound */}
                      <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                          1. Observed Sound Characteristics
                        </span>
                        <p className="text-xs text-slate-800 leading-relaxed">
                          {matchedReferenceRecord?.sound_label
                            ? SOUND_LABELS[matchedReferenceRecord.sound_label]?.label
                            : 'Observed mechanical acoustic signature'}{' '}
                          ({file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'Field recording'})
                          {primaryCandidate.operating_conditions
                            ? ` under operating conditions: "${primaryCandidate.operating_conditions}".`
                            : '.'}
                        </p>
                      </div>

                      {/* 2. Closest Known Condition */}
                      <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                          2. Closest Known Reference Profile
                        </span>
                        <p className="text-xs font-bold text-slate-900">
                          {primaryCandidate.title}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          Subsystem:{' '}
                          <span className="font-semibold text-slate-800">
                            {primaryCandidate.component || 'Standard operating subsystem'}
                          </span>
                          {' · '}
                          Similarity: <span className="font-mono font-bold text-teal-800">{(primaryScore * 100).toFixed(1)}%</span>
                        </p>
                      </div>

                      {/* 3. Possible Issue */}
                      <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                          3. Available Acoustic Evidence / Interpretation
                        </span>
                        <p className="text-xs text-slate-800 leading-relaxed">
                          {primaryCandidate.interpretation || result.message}
                        </p>
                      </div>

                      {/* 4. Recommended Next Step */}
                      <div className="rounded-lg bg-teal-50/60 p-3.5 border border-teal-200/80 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-teal-900 block flex items-center gap-1">
                          <Wrench className="h-3 w-3 text-teal-700" />
                          4. Approved Next Step & Field SOP
                        </span>
                        <p className="text-xs text-teal-950 font-medium leading-relaxed">
                          {matchedReferenceRecord?.annotation_notes ? (
                            <span>{matchedReferenceRecord.annotation_notes}</span>
                          ) : (
                            <span>
                              Consult approved service documentation for {primaryCandidate.machine_name || 'this equipment'}. Verify mounting, operating temperatures, and execute SOP visual inspection before disassembling components.
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* 5. Diagnostic Limitations */}
                    <div className="rounded-lg bg-amber-50/80 p-3.5 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                      <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <strong>5. Diagnostic Limitations:</strong> {result.limitation || 'Similarity is not a diagnosis, fault probability, or machine-safety determination.'} Acoustic recording alone cannot measure internal clearance, lubrication viscosity, thermal degradation, or electrical winding insulation breakdown. Physical inspection and certified tools are strictly required.
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 6. RANKED SECONDARY CANDIDATE MATCHES ────────────────────────── */}
                {secondaryCandidates.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Alternative Reference Candidates ({secondaryCandidates.length})
                        </h4>
                        <p className="text-xs text-slate-500">
                          Ranked by acoustic similarity metric. Click "Compare Audio" to load any candidate into the comparison player.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {secondaryCandidates.map((cand, idx) => (
                        <div
                          key={cand.reference_id}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 hover:bg-white hover:border-slate-300 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                                  Rank #{idx + 2}
                                </span>
                                <h5 className="text-xs font-bold text-slate-900 truncate max-w-[200px]">
                                  {cand.title}
                                </h5>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {[cand.machine_name, cand.component, cand.operation].filter(Boolean).join(' · ')}
                              </p>
                            </div>

                            <span className="font-mono text-xs font-extrabold text-slate-700 shrink-0">
                              {(cand.similarity_score * 100).toFixed(1)}%
                            </span>
                          </div>

                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-slate-500"
                              style={{ width: `${Math.round(cand.similarity_score * 100)}%` }}
                            />
                          </div>

                          <div className="pt-1 flex items-center justify-between text-xs">
                            <span className="text-[11px] text-slate-500 truncate max-w-[180px]">
                              {cand.interpretation.slice(0, 55)}…
                            </span>

                            <button
                              type="button"
                              onClick={() => {
                                setComparisonCandidate(cand);
                                setNotice(`Loaded candidate for side-by-side comparison: ${cand.title}`);
                              }}
                              className="text-xs font-bold text-teal-700 hover:text-teal-900 underline flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Volume2 className="h-3.5 w-3.5" />
                              Compare Audio
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approved Technical SOP Citations */}
                {primaryCandidate?.knowledge_sources && primaryCandidate.knowledge_sources.length > 0 && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-xs font-bold text-slate-800 block mb-2">
                      Approved Technical SOPs & Service Procedures:
                    </span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {primaryCandidate.knowledge_sources.map((cit) => (
                        <a
                          key={cit.knowledge_version_id}
                          href={citationUrl(cit)}
                          className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-xs transition-colors hover:border-teal-500 hover:bg-teal-50/20"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 font-bold text-slate-800 group-hover:text-teal-800 truncate">
                              <BookOpen className="h-4 w-4 text-teal-600 shrink-0" />
                              <span className="truncate">{cit.title}</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              Revision v{cit.version_no ?? 1} · Peer-Approved Knowledge Baseline
                            </p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-teal-600 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 7. EXPERT ESCALATION FLOW ──────────────────────────────────── */}
                {(result.status === 'NO_RELIABLE_MATCH' ||
                  result.status === 'AMBIGUOUS_MATCH' ||
                  result.requires_expert_review) &&
                  result.review_status !== 'pending' && (
                    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-6 space-y-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
                        <ShieldAlert className="h-5 w-5 text-amber-600" />
                        Request Independent Expert Engineering Evaluation
                      </div>

                      <p className="text-xs text-amber-900 leading-relaxed">
                        {result.status === 'AMBIGUOUS_MATCH'
                          ? 'Multiple reference profiles match closely within 4% similarity. Request senior engineering evaluation to review physical symptoms and clarify machine condition.'
                          : 'No published reference reached the 82% screening cutoff. Dispatch this recording securely to senior specialists for manual spectral analysis.'}
                      </p>

                      <textarea
                        rows={3}
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="Enter technician observations: machine serial number, operating hours, load conditions, ambient noise factors, or suspected mechanical symptoms…"
                        className="w-full rounded-xl border border-amber-300 bg-white p-3 text-xs text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      />

                      <button
                        type="button"
                        onClick={submitForReview}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-500 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <Send className="h-4 w-4" />
                        Submit Sample To Peer Review Queue
                      </button>
                    </div>
                  )}

                {result.review_status === 'pending' && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs font-medium text-blue-900 flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />
                    <span>
                      Recording successfully submitted to the peer review queue. Senior engineers will review the spectral signature.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 2. TARGET EQUIPMENT CATEGORY & MODEL SELECTOR                     */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-xs font-bold">1</span>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Target Equipment Category & Model
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select equipment to narrow comparison against matching physical machinery
                  </p>
                </div>

                {/* Modality Filter Pills */}
                <div className="flex flex-wrap gap-2">
                  {MODALITY_FILTERS.map((mod) => {
                    const Icon = mod.icon;
                    const isActive = selectedModality === mod.id;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => {
                          setSelectedModality(mod.id);
                          if (mod.id !== 'all') {
                            const found = machines.find((m) =>
                              m.name.toLowerCase().includes(mod.id)
                            );
                            if (found) setSelectedMachine(found.id);
                          } else {
                            setSelectedMachine('');
                          }
                        }}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                          isActive
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {mod.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Exact Machine Instance Select */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[280px]">
                  <div className="relative">
                    <select
                      value={selectedMachine}
                      onChange={(e) => setSelectedMachine(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-slate-300 bg-slate-50/50 py-2.5 pl-3 pr-8 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                    >
                      <option value="">Any Machine (Broad-spectrum match across all 117 references)</option>
                      {filteredMachines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.model_number ? `· Model: ${m.model_number}` : ''} {m.code ? `(${m.code})` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                  </div>
                </div>

                <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-700 font-medium">
                  {activeMachineObj ? (
                    <span>
                      Target: <strong className="text-slate-900">{activeMachineObj.name}</strong> ({activeMachineObj.model_number || activeMachineObj.code || 'Active'})
                    </span>
                  ) : (
                    <span>Searching across all 117 verified references</span>
                  )}
                </div>
              </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* 3. SIGNAL INGESTION & PRIMARY ANALYSIS ACTION CARD               */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <div id="audio-ingestion-card" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-xs font-bold">2</span>
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                    Check Your Machine Sound (Upload or Live Record)
                  </h2>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 font-mono font-semibold">
                    PCM 16-bit · 16 kHz
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-500">Duration: 0.5s – 120s · Max 50 MB</span>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="grid gap-5 md:grid-cols-12">
                <div className="md:col-span-8">
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const dropped = e.dataTransfer.files?.[0];
                      if (dropped) {
                        setFile(dropped);
                        setResult(null);
                        setError('');
                        setNotice(`Loaded: ${dropped.name}`);
                      }
                    }}
                    className={`group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-7 text-center cursor-pointer transition-all ${
                      isDragOver
                        ? 'border-teal-500 bg-teal-50/50 ring-4 ring-teal-500/10'
                        : file
                        ? 'border-teal-400 bg-teal-50/20'
                        : 'border-slate-300 bg-slate-50/60 hover:border-teal-500 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="file"
                      accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,.wav,.flac,.mp3"
                      className="hidden"
                      onChange={(e) => {
                        const picked = e.target.files?.[0];
                        if (picked) {
                          setFile(picked);
                          setResult(null);
                          setError('');
                          setNotice(`Selected: ${picked.name}`);
                        }
                      }}
                    />

                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-teal-600 shadow-sm ring-1 ring-slate-200 group-hover:scale-105 transition-transform">
                      <Upload className="h-6 w-6" />
                    </div>

                    <p className="mt-3 text-sm font-bold text-slate-800">
                      {file ? 'Click or drop to replace file' : 'Drag & Drop Equipment Sound Recording'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Supported formats: WAV, FLAC, MP3 · Sample rate auto-normalized to 16 kHz
                    </p>
                  </label>
                </div>

                {/* Microphone Record & File Card */}
                <div className="md:col-span-4 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                      Live Microphone Capture
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">
                      Position your microphone 10–30 cm from the operating machinery or cooling intake.
                    </p>
                  </div>

                  {!recording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-3 text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-100 hover:border-slate-400 transition-all cursor-pointer"
                    >
                      <Mic className="h-4 w-4 text-rose-600" />
                      Start Microphone Recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-xs font-bold text-white shadow-md hover:bg-rose-500 transition-all animate-pulse cursor-pointer"
                    >
                      <Square className="h-3.5 w-3.5 fill-white" />
                      Stop Recording ({recordDuration}s)
                    </button>
                  )}
                </div>
              </div>

              {/* Reference Sound Calibration & Testing (1-Click Test Generation) */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                    Reference Sound Calibration & Testing
                  </span>
                  <span className="text-[11px] text-slate-400">1-Click Test Sample</span>
                </div>
                <p className="text-xs text-slate-500 mb-2.5">
                  Select a calibrated reference sample to test acoustic pattern matching:
                </p>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { id: 'xray', label: '🩻 X-Ray Tube Hum', desc: '150 Hz Warmup Baseline' },
                    { id: 'ct', label: '🔬 CT Gantry Whine', desc: '120 Hz Rotation Harmonic' },
                    { id: 'mri', label: '🧲 MRI Gradient Knock', desc: '600 Hz T2 EPI Sequence' },
                    { id: 'ecg', label: '💓 ECG Heart Monitor', desc: '1000 Hz QRS Normal Beep' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const sample = generateSynthesizedSample(item.id as 'xray' | 'ct' | 'mri' | 'ecg');
                        setFile(sample);
                        setResult(null);
                        setError('');
                        setNotice(`Calibrated test sample loaded: ${item.label}. Click "Analyze Machine Sound" below.`);
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-left hover:border-teal-500 hover:bg-teal-50/30 transition-all cursor-pointer"
                    >
                      <span className="block text-xs font-bold text-slate-800">{item.label}</span>
                      <span className="block text-[11px] text-slate-500 font-mono mt-0.5">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected File Details & Waveform Player */}
              {file && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                        <FileAudio className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-sm block truncate max-w-sm sm:max-w-md">
                          {file.name}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          Size: {(file.size / 1024).toFixed(1)} KB · Normalized to 16 kHz PCM
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setResult(null);
                        setNotice('');
                      }}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer"
                    >
                      Remove File
                    </button>
                  </div>

                  {/* High-Contrast Interactive Waveform Player */}
                  <WaveformVisualizer
                    file={file}
                    title={file.name}
                    badgeLabel="Your Recording"
                    theme="blue"
                    height={52}
                  />

                  {/* ── THE PROMINENT PRIMARY ACTION BUTTON ────────────────────────── */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={runAnalysis}
                    aria-label="Analyze Machine Sound"
                    className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-teal-600 py-4 text-base font-bold text-white shadow-md shadow-teal-700/20 hover:bg-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/20 disabled:opacity-60 transition-all cursor-pointer"
                  >
                    {busy ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Computing 48-Band Spectral Filterbanks…</span>
                      </>
                    ) : (
                      <>
                        <Activity className="h-5 w-5" />
                        <span>Analyze Machine Sound</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: EXPERT STUDIO (ROLE-AWARE AUTHORING & PEER QUEUE)            */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'studio' && canManage && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-12">
              {/* Draft Authoring Form (7 cols) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-7 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {referenceDraftId ? 'Edit Acoustic Reference Draft' : 'Author New Reference Profile'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Requires two-party peer approval before becoming an active diagnostic match target
                    </p>
                  </div>

                  {referenceDraftId && (
                    <button
                      type="button"
                      onClick={clearReferenceDraft}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      New Draft
                    </button>
                  )}
                </div>

                {/* Saved Drafts Quick Switcher */}
                {draftReferences.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="block text-xs font-bold text-slate-700 mb-2">
                      Your In-Progress Reference Drafts ({draftReferences.length}):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {draftReferences.map((ref) => (
                        <button
                          key={ref.id}
                          type="button"
                          onClick={() => loadDraftIntoForm(ref)}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                            referenceDraftId === ref.id
                              ? 'bg-teal-600 text-white shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {ref.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={createReference} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Reference Audio File (WAV / FLAC) *
                    </label>
                    <input
                      type="file"
                      accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,.wav,.flac,.mp3"
                      required={!referenceDraftId}
                      disabled={!!referenceDraftId}
                      onChange={(e) => setDraftFile(e.target.files?.[0] || null)}
                      className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-teal-700 hover:file:bg-teal-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Reference Profile Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. X-Ray Tube Bearing Wear Rattle 80kV"
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Expert-Approved Interpretation & Guidance *
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Detailed physical interpretation of acoustic signature, frequency peaks, recommended service procedure…"
                      value={draft.interpretation}
                      onChange={(e) => setDraft({ ...draft, interpretation: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 outline-none focus:border-teal-500"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Equipment Category
                      </label>
                      <select
                        value={draft.machine_id}
                        onChange={(e) => setDraft({ ...draft, machine_id: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 outline-none focus:border-teal-500"
                      >
                        <option value="">Select Machine…</option>
                        {machines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Sound Taxonomy Label
                      </label>
                      <select
                        value={draft.sound_label}
                        onChange={(e) => setDraft({ ...draft, sound_label: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 outline-none focus:border-teal-500"
                      >
                        <option value="">Select Category…</option>
                        {Object.entries(SOUND_LABELS).map(([key, val]) => (
                          <option key={key} value={key}>
                            {val.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Manufacturer
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Siemens Healthineers"
                        value={draft.manufacturer}
                        onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Model / Series
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. MAGNETOM Vida 3T"
                        value={draft.model_name}
                        onChange={(e) => setDraft({ ...draft, model_name: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Subsystem / Component
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Gradient Coil Former"
                        value={draft.component}
                        onChange={(e) => setDraft({ ...draft, component: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Operating Conditions
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Steady-State High Load 80kV"
                        value={draft.operating_conditions}
                        onChange={(e) => setDraft({ ...draft, operating_conditions: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Annotation & Spectral Observation Notes
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Distinct harmonic peaks at 240 Hz and 480 Hz. Observed after bearing wear in excess of 10,000 scan cycles."
                      value={draft.annotation_notes}
                      onChange={(e) => setDraft({ ...draft, annotation_notes: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Linked Peer-Published Knowledge Documents *
                    </label>
                    <select
                      multiple
                      value={selectedSources}
                      disabled={!!referenceDraftId}
                      onChange={(e) =>
                        setSelectedSources(Array.from(e.target.selectedOptions, (o) => o.value))
                      }
                      className="h-28 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800"
                    >
                      {sources.map((src) => (
                        <option key={src.version_id} value={src.version_id}>
                          {src.title} (v{src.version_no})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Select at least one verified published knowledge document to anchor this reference.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-500 disabled:opacity-50 transition-all"
                    >
                      <BookOpen className="h-4 w-4" />
                      {referenceDraftId ? 'Update & Submit to Peer Review' : 'Create Reference Draft'}
                    </button>

                    <a
                      href="/app/reviews"
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Open Peer Review Approvals →
                    </a>
                  </div>
                </form>
              </div>

              {/* Review Queue (5 cols) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-5 space-y-4">
                <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Trainee Unmatched Recording Queue
                    </h3>
                    <p className="text-xs text-slate-500">
                      {reviewQueue.length} field submission{reviewQueue.length === 1 ? '' : 's'} waiting
                    </p>
                  </div>
                  <span className="rounded-md bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                    Pending Review
                  </span>
                </div>

                {reviewQueue.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    Review queue is clear. No unreviewed acoustic submissions.
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                    {reviewQueue.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-semibold text-slate-900 text-xs block">
                              Submission #{item.id.slice(0, 8)}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Reason: {item.reason_code}
                            </span>
                          </div>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            {item.review_status}
                          </span>
                        </div>

                        {item.audio_url && (
                          <WaveformVisualizer
                            audioUrl={item.audio_url}
                            title="Trainee Field Sample"
                            badgeLabel="Trainee Recording"
                            theme="blue"
                            height={44}
                          />
                        )}

                        {item.review_note && (
                          <div className="rounded bg-white p-2.5 text-xs border border-slate-200 text-slate-700">
                            <strong>Technician Note:</strong> {item.review_note}
                          </div>
                        )}

                        <textarea
                          rows={2}
                          value={reviewComments[item.id] || ''}
                          onChange={(e) =>
                            setReviewComments({
                              ...reviewComments,
                              [item.id]: e.target.value,
                            })
                          }
                          placeholder="Feedback or contextual question for the submitter…"
                          className="w-full rounded-lg border border-slate-200 p-2 text-xs bg-white text-slate-800"
                        />

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => decideSubmission(item.id, 'changes_requested')}
                            className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Request Context
                          </button>
                          <button
                            type="button"
                            onClick={() => decideSubmission(item.id, 'rejected')}
                            className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── SLIDE-OVER DRAWER: ANALYSIS HISTORY ─────────────────────────────────── */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Acoustic Diagnostic History</h3>
              </div>
              <button
                onClick={() => setShowHistoryDrawer(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              {history.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  No matching jobs recorded in this session.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    onClick={async () => {
                      try {
                        const job = await api.get<AnalysisResult>(`/audio/analysis-jobs/${item.id}`);
                        setResult(job);
                        setShowHistoryDrawer(false);
                        setNotice(`Restored analysis job: ${item.id.slice(0, 8)}`);
                      } catch {
                        setError('Could not retrieve historical job record.');
                      }
                    }}
                    className="p-3.5 rounded-xl border border-slate-200/90 hover:border-teal-400 hover:bg-teal-50/20 cursor-pointer transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                          item.status === 'MATCHED'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {item.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-slate-400 text-[11px]">{formatDate(item.created_at)}</span>
                    </div>

                    <p className="text-xs font-bold text-slate-900 truncate">
                      {item.matched_reference_title || 'Unmatched Signal'}
                    </p>

                    {item.similarity_score != null && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span>Spectral Correlation:</span>
                        <span className="font-bold text-teal-700">
                          {(item.similarity_score * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SLIDE-OVER DRAWER: CERTIFIED REFERENCE LIBRARY ──────────────────────── */}
      {showLibraryDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-teal-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Published Reference Audio Library ({references.length})
                </h3>
              </div>
              <button
                onClick={() => setShowLibraryDrawer(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by machine, component, or acoustic profile…"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none focus:border-teal-500"
                />
              </div>

              <select
                value={libraryFilterModality}
                onChange={(e) => setLibraryFilterModality(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
              >
                <option value="all">All Modalities</option>
                <option value="x-ray">X-Ray (27)</option>
                <option value="ct">CT Scan (25)</option>
                <option value="mri">MRI (25)</option>
                <option value="ecg">ECG (25)</option>
              </select>
            </div>

            {/* Reference List */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {filteredLibraryReferences.map((ref) => (
                <div
                  key={ref.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">{ref.title}</span>
                        {ref.is_expert_verified && (
                          <BadgeCheck className="h-4 w-4 text-emerald-600" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[ref.manufacturer, ref.machine_name, ref.model_name, ref.component].filter(Boolean).join(' · ')}
                      </p>
                    </div>

                    {ref.sound_label && (
                      <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                        {SOUND_LABELS[ref.sound_label]?.label || ref.sound_label}
                      </span>
                    )}
                  </div>

                  {ref.audio_url && (
                    <WaveformVisualizer
                      audioUrl={ref.audio_url}
                      title={ref.title}
                      badgeLabel="Calibration Baseline"
                      theme="emerald"
                      height={44}
                    />
                  )}

                  {ref.interpretation && (
                    <p className="text-xs text-slate-700 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-100">
                      {ref.interpretation}
                    </p>
                  )}

                  {ref.source_references && ref.source_references.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ref.source_references.map((c) => (
                        <a
                          key={c.knowledge_version_id}
                          href={citationUrl(c)}
                          className="text-[11px] text-teal-700 underline font-medium hover:text-teal-900 flex items-center gap-1"
                        >
                          <BookOpen className="h-3 w-3" />
                          {c.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
