import React, { useState, useRef, useCallback } from 'react';

interface SoundPrediction {
  predicted_class: string;
  confidence: number;
  condition_description: string;
  severity: string;
  probabilities: Record<string, number>;
  inference_time_ms: number;
  model_version: string;
  error?: string | null;
}

interface ModelInfo {
  model_ready: boolean;
  model_version: string;
  accuracy?: number;
  n_classes?: number;
  class_names?: string[];
  n_features?: number;
  n_train?: number;
}

const CLASS_ICONS: Record<string, string> = {
  ventilator_normal: '🫁',
  ventilator_alarm: '🚨',
  infusion_pump_normal: '💉',
  infusion_pump_occlusion: '⚠️',
  ecg_monitor_normal: '💓',
  ecg_monitor_alarm: '🚑',
  defibrillator_charging: '⚡',
  ambient_silence: '🔇',
};

const CLASS_LABELS: Record<string, string> = {
  ventilator_normal: 'Ventilator — Normal',
  ventilator_alarm: 'Ventilator — Alarm',
  infusion_pump_normal: 'Infusion Pump — Normal',
  infusion_pump_occlusion: 'Infusion Pump — Occlusion',
  ecg_monitor_normal: 'ECG Monitor — Normal',
  ecg_monitor_alarm: 'ECG Monitor — Alarm',
  defibrillator_charging: 'Defibrillator — Charging',
  ambient_silence: 'Ambient Silence',
};

function formatClass(cls: string): string {
  return CLASS_LABELS[cls] ?? cls.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function SeverityBadge({ severity }: { severity: string }) {
  const isCritical = severity === 'critical';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 12px',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: isCritical
          ? 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)'
          : 'linear-gradient(135deg, #00c853 0%, #009624 100%)',
        color: '#fff',
        boxShadow: isCritical ? '0 0 12px rgba(255,68,68,0.5)' : '0 0 12px rgba(0,200,83,0.4)',
        animation: isCritical ? 'pulse 1.5s infinite' : 'none',
      }}
    >
      {isCritical ? '🚨 CRITICAL' : '✅ NORMAL'}
    </span>
  );
}

function ConfidenceBar({ label, value, isTop }: { label: string; value: number; isTop: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ fontSize: '0.78rem', color: isTop ? '#a78bfa' : '#9ca3af', fontWeight: isTop ? 700 : 400 }}>
          {CLASS_ICONS[label] ?? '🔊'} {formatClass(label)}
        </span>
        <span style={{ fontSize: '0.78rem', color: isTop ? '#a78bfa' : '#9ca3af', fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: '3px',
            background: isTop
              ? 'linear-gradient(90deg, #7c3aed, #a78bfa)'
              : 'linear-gradient(90deg, #374151, #4b5563)',
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
    </div>
  );
}

export function SoundInferencePage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SoundPrediction | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch model info on mount
  React.useEffect(() => {
    fetch('/api/v1/sound-inference/model-info')
      .then((r) => r.json())
      .then(setModelInfo)
      .catch(() => {});
  }, []);

  const classify = useCallback(async (audioFile: File) => {
    setLoading(true);
    setResult(null);
    setError(null);
    const form = new FormData();
    form.append('file', audioFile);
    try {
      const res = await fetch('/api/v1/sound-inference/classify', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Classification failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) { setFile(f); classify(f); }
    },
    [classify]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); classify(f); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const f = new File([blob], 'recording.webm', { type: 'audio/webm' });
        setFile(f);
        classify(f);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setMediaRecorder(mr);
      setRecording(true);
    } catch {
      setError('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    mediaRecorder?.stop();
    setRecording(false);
  };

  const sortedProbs = result
    ? Object.entries(result.probabilities).sort((a, b) => b[1] - a[1])
    : [];

  const styles: Record<string, React.CSSProperties> = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a0a2e 50%, #0a1628 100%)',
      padding: '32px 24px',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      color: '#e2e8f0',
    },
    header: {
      textAlign: 'center',
      marginBottom: '40px',
    },
    title: {
      fontSize: '2.5rem',
      fontWeight: 800,
      background: 'linear-gradient(135deg, #a78bfa, #60a5fa, #34d399)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      margin: 0,
    },
    subtitle: {
      color: '#9ca3af',
      marginTop: '8px',
      fontSize: '1rem',
    },
    modelBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      background: 'rgba(167,139,250,0.15)',
      border: '1px solid rgba(167,139,250,0.3)',
      borderRadius: '999px',
      padding: '4px 16px',
      fontSize: '0.8rem',
      color: '#a78bfa',
      marginTop: '12px',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
      gap: '24px',
      maxWidth: '1100px',
      margin: '0 auto',
    },
    card: {
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '20px',
      padding: '28px',
      transition: 'border-color 0.3s',
    },
    dropzone: {
      border: dragging ? '2px dashed #a78bfa' : '2px dashed rgba(255,255,255,0.2)',
      borderRadius: '16px',
      padding: '48px 32px',
      textAlign: 'center',
      cursor: 'pointer',
      background: dragging ? 'rgba(167,139,250,0.08)' : 'transparent',
      transition: 'all 0.2s',
    },
    btn: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '12px 24px',
      borderRadius: '12px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.9rem',
      transition: 'all 0.2s',
    },
    primaryBtn: {
      background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
      color: '#fff',
      boxShadow: '0 4px 15px rgba(124,58,237,0.4)',
    },
    dangerBtn: {
      background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
      color: '#fff',
      boxShadow: '0 4px 15px rgba(220,38,38,0.4)',
    },
    resultCard: {
      background: result?.severity === 'critical'
        ? 'rgba(220,38,38,0.08)'
        : 'rgba(0,200,83,0.05)',
      border: result?.severity === 'critical'
        ? '1px solid rgba(220,38,38,0.3)'
        : '1px solid rgba(0,200,83,0.2)',
      borderRadius: '16px',
      padding: '24px',
      marginTop: '24px',
    },
    classLabel: {
      fontSize: '1.6rem',
      fontWeight: 800,
      color: '#f8fafc',
      margin: '8px 0 4px',
    },
    description: {
      color: '#9ca3af',
      fontSize: '0.88rem',
      lineHeight: 1.6,
      marginTop: '12px',
    },
    sectionTitle: {
      fontSize: '0.85rem',
      fontWeight: 700,
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: '16px',
    },
  };

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .record-pulse { animation: pulse 0.8s infinite; }
        .spin { animation: spin 1s linear infinite; display:inline-block; }
        .slide-up { animation: slideUp 0.4s ease-out; }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>🔊 Medical Equipment Sound Intelligence</h1>
        <p style={styles.subtitle}>
          Upload or record audio — AI identifies the equipment condition in milliseconds
        </p>
        {modelInfo?.model_ready && (
          <div style={styles.modelBadge}>
            <span>🧠</span>
            <span>
              Model {modelInfo.model_version} · {modelInfo.n_classes} classes ·{' '}
              {modelInfo.accuracy !== undefined ? `${(modelInfo.accuracy * 100).toFixed(1)}% accuracy` : ''}
              {modelInfo.n_train ? ` · trained on ${modelInfo.n_train} samples` : ''}
            </span>
          </div>
        )}
      </div>

      <div style={styles.grid}>
        {/* Upload Card */}
        <div style={styles.card}>
          <p style={styles.sectionTitle}>📁 Upload Audio</p>

          {/* Dropzone */}
          <div
            style={styles.dropzone}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎵</div>
            <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.95rem' }}>
              Drag & drop audio here, or click to select
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '6px' }}>
              WAV · MP3 · OGG · FLAC · WebM
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              id="audio-file-input"
            />
          </div>

          {file && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(167,139,250,0.1)', borderRadius: '10px', fontSize: '0.85rem', color: '#a78bfa' }}>
              📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}

          {/* Record */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!recording ? (
              <button
                style={{ ...styles.btn, ...styles.primaryBtn }}
                onClick={startRecording}
                id="start-recording-btn"
              >
                🎙 Record Live
              </button>
            ) : (
              <button
                style={{ ...styles.btn, ...styles.dangerBtn }}
                onClick={stopRecording}
                id="stop-recording-btn"
                className="record-pulse"
              >
                ⏹ Stop & Classify
              </button>
            )}
            {recording && (
              <span style={{ alignSelf: 'center', color: '#ef4444', fontWeight: 600, fontSize: '0.85rem' }}>
                ● Recording…
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: '10px', color: '#fca5a5', fontSize: '0.88rem' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', marginTop: '24px', color: '#a78bfa' }}>
              <span className="spin">⚙️</span>{' '}
              <span style={{ fontWeight: 600 }}>Analysing audio…</span>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div style={styles.resultCard} className="slide-up">
              <SeverityBadge severity={result.severity} />
              <div style={styles.classLabel}>
                {CLASS_ICONS[result.predicted_class] ?? '🔊'} {formatClass(result.predicted_class)}
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  Confidence: <strong style={{ color: '#a78bfa' }}>{(result.confidence * 100).toFixed(1)}%</strong>
                </span>
                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  Inference: <strong style={{ color: '#60a5fa' }}>{result.inference_time_ms.toFixed(1)} ms</strong>
                </span>
              </div>
              <p style={styles.description}>{result.condition_description}</p>
            </div>
          )}
        </div>

        {/* Probabilities & Classes */}
        <div style={styles.card}>
          {result ? (
            <>
              <p style={styles.sectionTitle}>📊 Class Probabilities</p>
              {sortedProbs.map(([cls, prob]) => (
                <ConfidenceBar
                  key={cls}
                  label={cls}
                  value={prob}
                  isTop={cls === result.predicted_class}
                />
              ))}
            </>
          ) : (
            <>
              <p style={styles.sectionTitle}>🎯 Supported Equipment Classes</p>
              {Object.entries(CLASS_LABELS).map(([cls, label]) => (
                <div
                  key={cls}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    marginBottom: '8px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>{CLASS_ICONS[cls] ?? '🔊'}</span>
                  <span style={{ fontSize: '0.88rem', color: '#cbd5e1' }}>{label}</span>
                </div>
              ))}
            </>
          )}

          {/* Model stats */}
          {modelInfo && (
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={styles.sectionTitle}>🧠 Model Stats</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  ['Accuracy', modelInfo.accuracy !== undefined ? `${(modelInfo.accuracy * 100).toFixed(1)}%` : '—'],
                  ['Classes', modelInfo.n_classes ?? '—'],
                  ['Features', modelInfo.n_features ?? '—'],
                  ['Train Samples', modelInfo.n_train ?? '—'],
                ].map(([label, val]) => (
                  <div key={String(label)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#a78bfa', marginTop: '4px' }}>{String(val)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
