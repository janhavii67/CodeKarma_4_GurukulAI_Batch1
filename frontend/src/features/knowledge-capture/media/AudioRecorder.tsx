import React, { useState } from 'react';
import {
  Mic,
  Square,
  Pause,
  Play,
  Trash2,
  Upload,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useMediaRecorder } from './useMediaRecorder';
import { MediaAsset, MediaConfig, UploadProgress } from './types';
import {
  formatDuration,
  formatBytes,
  generateRecordingFilename,
  recorderMimeToExtension,
  mapMediaErrorToMessage,
} from './mediaUtils';
import { Button } from '../../../components/ui/Button';

interface AudioRecorderProps {
  versionId: string;
  config?: MediaConfig;
  onUploaded?: (media: MediaAsset) => void;
  onUploadFile: (file: File, onProgress: (progress: UploadProgress) => void) => Promise<MediaAsset>;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  config,
  onUploaded,
  onUploadFile,
}) => {
  const {
    state,
    duration,
    recordedBlob,
    previewUrl,
    mimeType,
    error,
    autoStoppedReason,
    audioLevel,
    isSupported,
    unsupportedReason,
    start,
    pause,
    resume,
    stop,
    discard,
    markUploading,
    handleUploadSuccess,
    handleUploadError,
  } = useMediaRecorder({ config });

  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Announce key state changes
  const announce = (msg: string) => {
    setLiveAnnouncement(msg);
  };

  if (!isSupported) {
    return (
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-4 text-xs text-slate-400 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-slate-300">Audio recording unavailable</p>
          <p className="mt-0.5">{unsupportedReason}</p>
          <p className="mt-1 text-slate-500">You can still upload audio files using the file uploader below.</p>
        </div>
      </div>
    );
  }

  const handleStart = async () => {
    announce('Requesting microphone access');
    await start();
    announce('Recording started');
  };

  const handlePause = () => {
    pause();
    announce('Recording paused');
  };

  const handleResume = () => {
    resume();
    announce('Recording resumed');
  };

  const handleStop = () => {
    stop();
    announce('Recording stopped, preview ready');
  };

  const handleConfirmDiscard = () => {
    discard();
    setConfirmDiscardOpen(false);
    announce('Recording discarded');
  };

  const handleUseRecording = async () => {
    if (!recordedBlob) return;

    if (recordedBlob.size === 0) {
      handleUploadError('Empty recording — no audio was captured. Please record again.');
      return;
    }

    // Client-side size validation
    const maxBytes = config?.max_upload_bytes ?? 100 * 1024 * 1024;
    if (recordedBlob.size > maxBytes) {
      handleUploadError(
        `Recording file size (${formatBytes(recordedBlob.size)}) exceeds maximum limit of ${formatBytes(maxBytes)}.`
      );
      return;
    }

    const ext = recorderMimeToExtension(mimeType || recordedBlob.type);
    const filename = generateRecordingFilename(ext);
    const file = new File([recordedBlob], filename, { type: mimeType || recordedBlob.type });

    markUploading();
    announce('Uploading audio recording');
    setUploadProgress(0);

    try {
      const asset = await onUploadFile(file, (progress) => setUploadProgress(progress.percent));
      handleUploadSuccess();
      announce('Recording uploaded successfully');
      onUploaded?.(asset);
    } catch (err) {
      const msg = mapMediaErrorToMessage(err, config);
      handleUploadError(msg);
      announce(`Upload failed: ${msg}`);
    }
  };

  return (
    <div className="rounded-xl bg-[#EFF7FF] border border-[#BCD7F5] p-4 space-y-3 shadow-xs">
      {/* Polite live region for screen readers */}
      <div className="sr-only" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white border border-[#BCD7F5] flex items-center justify-center text-[#1473E6]">
            <Mic className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs sm:text-sm font-bold text-[#12345A]">
            Record Voice Note <span className="text-[#536780] font-normal text-xs">(Browser Audio Recorder)</span>
          </span>
        </div>
        <span className="text-xs text-[#536780] font-mono">
          {formatDuration(duration)}
        </span>
      </div>

      {/* Auto-stop or error notice */}
      {autoStoppedReason && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
          <span>{autoStoppedReason}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <div className="flex-1">
            <p className="font-semibold">Recorder Notice</p>
            <p className="mt-0.5 text-rose-700">{error}</p>
          </div>
          <button
            type="button"
            onClick={discard}
            className="text-rose-500 hover:text-rose-700 p-1"
            title="Dismiss error"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Idle state matching reference image */}
      {state === 'idle' && (
        <div className="flex flex-col items-center justify-center text-center py-2 space-y-2.5">
          <div className="w-12 h-12 rounded-full bg-[#1473E6] text-white flex items-center justify-center shadow-sm shadow-[#1473E6]/30">
            <Mic className="w-6 h-6" />
          </div>
          <p className="text-xs text-[#536780] max-w-xs">
            Record voice notes, observations or expert tips.
          </p>
          <button
            id="start-recording-btn"
            type="button"
            onClick={handleStart}
            className="w-full sm:w-auto px-5 py-2 rounded-lg bg-[#1473E6] hover:bg-[#1060C4] text-white font-semibold text-xs shadow-xs transition-colors"
          >
            Start Recording
          </button>
        </div>
      )}

      {/* Requesting mic permission */}
      {state === 'requesting' && (
        <div className="flex items-center justify-center gap-3 py-3 text-xs text-[#12345A]">
          <Loader2 className="w-4 h-4 animate-spin text-[#1473E6]" />
          <span>Requesting microphone access… please grant permission when prompted.</span>
        </div>
      )}

      {/* Live recording & paused state */}
      {(state === 'recording' || state === 'paused') && (
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-3 h-3 rounded-full flex items-center justify-center ${
                  state === 'recording' ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'
                }`}
                aria-hidden="true"
              />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#12345A]">
                {state === 'recording' ? 'Recording live…' : 'Paused'}
              </span>
            </div>

            {/* Level meter */}
            {state === 'recording' && (
              <div
                className="w-24 h-2 bg-[#DCE8F5] rounded-full overflow-hidden"
                aria-hidden="true"
                title="Input volume level"
              >
                <div
                  className="h-full bg-rose-500 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {state === 'recording' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePause}
                className="flex items-center gap-1.5"
                aria-label="Pause recording"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResume}
                className="flex items-center gap-1.5 text-brand-300 border-brand-500/30"
                aria-label="Resume recording"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume</span>
              </Button>
            )}

            <Button
              id="stop-recording-btn"
              type="button"
              variant="primary"
              size="sm"
              onClick={handleStop}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white"
              aria-label="Stop recording and review"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </Button>
          </div>
        </div>
      )}

      {/* Stopped preview state */}
      {state === 'stopped' && previewUrl && (() => {
        const isEmpty = recordedBlob && recordedBlob.size === 0;

        if (isEmpty) {
          return (
            <div className="space-y-2 pt-1">
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Empty recording</p>
                  <p className="mt-0.5 text-amber-200/70">
                    No audio was captured. Please record again.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleConfirmDiscard}
                className="flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Record again
              </Button>
            </div>
          );
        }

        return (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium text-slate-300">Preview Recording</span>
              <span>Duration: {formatDuration(duration)}</span>
            </div>

            <audio
              controls
              src={previewUrl}
              className="w-full h-10 rounded-lg outline-none"
              aria-label="Recorded audio preview"
            />

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDiscardOpen(true)}
                className="flex items-center gap-1.5 text-slate-400 hover:text-rose-400 hover:border-rose-500/40"
                aria-label="Discard recording"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Discard</span>
              </Button>

              <Button
                id="use-recording-btn"
                type="button"
                variant="primary"
                size="sm"
                onClick={handleUseRecording}
                className="flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Use this recording</span>
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Uploading state */}
      {state === 'uploading' && (
        <div className="space-y-2 py-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
              Uploading recording…
            </span>
            <span className="font-mono">{uploadProgress}%</span>
          </div>
          <div
            className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden"
            role="progressbar"
            aria-valuenow={uploadProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="bg-brand-400 h-full transition-all duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Discard confirmation modal */}
      {confirmDiscardOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-dialog-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4 shadow-2xl">
            <h3 id="discard-dialog-title" className="text-sm font-semibold text-slate-100">
              Discard this recording?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your audio preview will be discarded permanently. This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDiscardOpen(false)}
              >
                Keep recording
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDiscard}
              >
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
