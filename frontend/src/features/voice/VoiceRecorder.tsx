import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { uploadVoiceNarration, VoiceUploadResponse } from './voiceApi';
import { api } from '../../lib/api/client';
import { Mic, Square, Upload, Radio, Play, Pause, RotateCcw, Cpu } from 'lucide-react';

interface VoiceRecorderProps {
  versionId?: string;
  onUploaded: (res: VoiceUploadResponse) => void;
}

interface MachineOption {
  id: string;
  name: string;
  model_number: string;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ versionId, onUploaded }) => {
  const [mode, setMode] = useState<'record' | 'upload'>('record');
  const [title, setTitle] = useState('');
  const [machineId, setMachineId] = useState('');
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Load machines list
    api.get<any>('/machines')
      .then((data) => {
        if (Array.isArray(data)) {
          setMachines(data);
        } else if (data && Array.isArray(data.items)) {
          setMachines(data.items);
        } else {
          setMachines([]);
        }
      })
      .catch((err) => {
        console.error('Failed to load machines:', err);
        setMachines([]);
      });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else {
          mimeType = '';
        }
      }
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalType = mediaRecorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 300) {
            stopRecording();
            return 300;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setError('Microphone access denied or audio device not found. Please check browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingSeconds(0);
    setIsRecording(false);
    setIsPlayingPreview(false);
  };

  const togglePreview = () => {
    if (!audioPreviewRef.current) return;
    if (isPlayingPreview) {
      audioPreviewRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioPreviewRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsUploading(true);
      setError(null);

      let payloadBlob: Blob | File | null = null;
      let filename = 'narration.webm';

      if (mode === 'record') {
        if (!audioBlob) {
          setError('Please record audio before submitting.');
          setIsUploading(false);
          return;
        }
        payloadBlob = audioBlob;
      } else {
        if (!uploadFile) {
          setError('Please select an audio file to upload.');
          setIsUploading(false);
          return;
        }
        payloadBlob = uploadFile;
        filename = uploadFile.name;
      }

      const res = await uploadVoiceNarration(
        payloadBlob,
        title || (mode === 'record' ? 'Live Expert Shop Floor Narration' : uploadFile?.name),
        machineId || undefined,
        versionId || undefined,
        filename
      );

      onUploaded(res);
      resetRecording();
      setUploadFile(null);
      setTitle('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to upload audio narration');
    } finally {
      setIsUploading(false);
    }
  };

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
      {/* Tab Switcher */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={mode === 'record' ? 'primary' : 'ghost'}
            onClick={() => setMode('record')}
            disabled={isRecording}
          >
            <Mic className="w-4 h-4 mr-1.5" />
            Live Microphone Record
          </Button>
          <Button
            size="sm"
            variant={mode === 'upload' ? 'primary' : 'ghost'}
            onClick={() => setMode('upload')}
            disabled={isRecording}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Upload Narration File
          </Button>
        </div>

        <span className="text-xs font-mono text-slate-400">Limit: 5 min max</span>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Metadata Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Narration Title / Topic
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. CNC Spindle Warm-up & Chuck Setup"
            disabled={isRecording || isUploading}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Associated Machine Asset
          </label>
          <div className="relative">
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              disabled={isRecording || isUploading}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
            >
              <option value="">Select Machine (Optional)...</option>
              {(Array.isArray(machines) ? machines : []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.model_number})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Recording Mode UI */}
      {mode === 'record' && (
        <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-6 text-center space-y-4">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                isRecording
                  ? 'bg-rose-500/20 border-2 border-rose-500 animate-pulse text-rose-400'
                  : audioBlob
                  ? 'bg-emerald-500/15 border-2 border-emerald-500 text-emerald-400'
                  : 'bg-brand-500/15 border border-brand-500/30 text-brand-400'
              }`}
            >
              {isRecording ? <Radio className="w-8 h-8 animate-spin" /> : <Mic className="w-8 h-8" />}
            </div>

            <div>
              <span className="text-2xl font-mono font-bold text-slate-100">
                {formatTimer(recordingSeconds)}
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRecording
                  ? 'Recording live shop-floor narration... Speak clearly.'
                  : audioBlob
                  ? 'Recording ready for conversion and vector indexing'
                  : 'Click below to begin voice recording'}
              </p>
            </div>
          </div>

          {/* Recorder Controls */}
          <div className="flex items-center justify-center gap-3">
            {!isRecording && !audioBlob && (
              <Button size="md" variant="primary" onClick={startRecording}>
                <Mic className="w-4 h-4 mr-2" />
                Start Recording
              </Button>
            )}

            {isRecording && (
              <Button size="md" variant="danger" onClick={stopRecording}>
                <Square className="w-4 h-4 mr-2" />
                Stop Recording
              </Button>
            )}

            {audioBlob && !isRecording && (
              <>
                <Button size="sm" variant="outline" onClick={togglePreview}>
                  {isPlayingPreview ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                  {isPlayingPreview ? 'Pause' : 'Listen Preview'}
                </Button>

                <Button size="sm" variant="ghost" onClick={resetRecording}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Re-record
                </Button>
              </>
            )}
          </div>

          {audioUrl && (
            <audio
              ref={audioPreviewRef}
              src={audioUrl}
              onEnded={() => setIsPlayingPreview(false)}
              className="hidden"
            />
          )}
        </div>
      )}

      {/* Upload Mode UI */}
      {mode === 'upload' && (
        <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-6 text-center space-y-3">
          <input
            type="file"
            id="audio-upload-input"
            accept="audio/*,video/*"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <label
            htmlFor="audio-upload-input"
            className="cursor-pointer flex flex-col items-center justify-center space-y-2 border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-8 transition-colors"
          >
            <Upload className="w-8 h-8 text-brand-400" />
            <span className="text-xs font-semibold text-slate-200">
              {uploadFile ? uploadFile.name : 'Click to select audio / video file'}
            </span>
            <span className="text-[11px] text-slate-400">
              Supported: WAV, MP3, WebM, MP4, M4A (Max 100MB, up to 5 min duration)
            </span>
          </label>
        </div>
      )}

      {/* Convert & Submit Button */}
      <div className="flex justify-end pt-2">
        <Button
          size="md"
          variant="primary"
          onClick={handleSubmit}
          isLoading={isUploading}
          disabled={isRecording || (!audioBlob && !uploadFile)}
        >
          <Cpu className="w-4 h-4 mr-2" />
          Convert Narration to Knowledge & Index Vectors
        </Button>
      </div>
    </div>
  );
};
