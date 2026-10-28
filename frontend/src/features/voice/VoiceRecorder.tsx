import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { uploadVoiceNarration, VoiceUploadResponse } from './voiceApi';
import { api } from '../../lib/api/client';
import { createKnowledge } from '../knowledge-capture/knowledgeApi';
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
  const [linkedVersionId, setLinkedVersionId] = useState(versionId || '');

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

      let targetVersionId = linkedVersionId;
      let knowledgeItemId: string | undefined;
      if (!targetVersionId) {
        if (!title.trim()) {
          setError('Add a knowledge title before uploading so this narration can be attached to a draft.');
          return;
        }
        const draft = await createKnowledge({ title: title.trim(), machine_id: machineId || null });
        targetVersionId = draft.version.id;
        knowledgeItemId = draft.id;
        setLinkedVersionId(targetVersionId);
      }

      const res = await uploadVoiceNarration(
        payloadBlob,
        title || (mode === 'record' ? 'Live Expert Shop Floor Narration' : uploadFile?.name),
        machineId || undefined,
        targetVersionId,
        filename
      );

      onUploaded({ ...res, knowledge_item_id: knowledgeItemId });
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
    <div className="bg-white border border-[#DCE6F0] rounded-2xl p-5 shadow-xs space-y-5">
      {/* Tab Switcher */}
      <div className="flex items-center justify-between border-b border-[#E8EEF5] pb-3">
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

        <span className="text-xs font-mono text-[#7C8DA1]">Limit: 5 min max</span>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-[#D94848] font-medium">
          {error}
        </div>
      )}

      {/* Metadata Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[#17324D] mb-1.5">
            Narration Title / Topic
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Diagnostic Centrifuge Calibration & Rotor Setup"
            disabled={isRecording || isUploading}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#17324D] mb-1.5">
            Associated Equipment Asset
          </label>
          <div className="relative">
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              disabled={isRecording || isUploading}
              className="w-full bg-[#F3F8FE] border border-[#DCE6F0] rounded-xl px-3 py-2.5 text-xs text-[#17324D] focus:bg-white focus:outline-none focus:border-[#1976D2]"
            >
              <option value="">Select Equipment (Optional)...</option>
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
        <div className="bg-[#F3F8FE] border border-[#DCE6F0] rounded-2xl p-6 text-center space-y-4">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                isRecording
                  ? 'bg-rose-100 border-2 border-[#D94848] animate-pulse text-[#D94848]'
                  : audioBlob
                  ? 'bg-emerald-100 border-2 border-[#15966A] text-[#15966A]'
                  : 'bg-[#EAF3FF] border-2 border-[#BCD7F5] text-[#1976D2]'
              }`}
            >
              {isRecording ? <Radio className="w-8 h-8 animate-spin" /> : <Mic className="w-8 h-8" />}
            </div>

            <div>
              <span className="text-2xl font-mono font-black text-[#17324D]">
                {formatTimer(recordingSeconds)}
              </span>
              <p className="text-xs text-[#5D7188] mt-0.5">
                {isRecording
                  ? 'Recording live laboratory narration... Speak clearly.'
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
        <div className="bg-[#F3F8FE] border border-[#DCE6F0] rounded-2xl p-6 text-center space-y-3">
          <input
            type="file"
            id="audio-upload-input"
            accept="audio/*,video/*"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <label
            htmlFor="audio-upload-input"
            className="cursor-pointer flex flex-col items-center justify-center space-y-2 border-2 border-dashed border-[#BCD7F5] hover:border-[#1976D2] bg-white rounded-2xl p-8 transition-colors shadow-xs"
          >
            <Upload className="w-8 h-8 text-[#1976D2]" />
            <span className="text-xs font-bold text-[#17324D]">
              {uploadFile ? uploadFile.name : 'Click to select audio / video file'}
            </span>
            <span className="text-[11px] text-[#5D7188]">
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
          Convert Narration to Knowledge &amp; Index Vectors
        </Button>
      </div>
    </div>
  );
};
