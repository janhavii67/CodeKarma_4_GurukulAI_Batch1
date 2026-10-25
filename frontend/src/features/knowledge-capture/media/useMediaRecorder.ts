import { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import { MediaConfig } from './types';
import { normalizeMimeType } from './mediaUtils';

export type RecorderState =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'uploading'
  | 'error';

interface State {
  status: RecorderState;
  duration: number;
  previewUrl: string | null;
  recordedBlob: Blob | null;
  mimeType: string;
  error: string | null;
  autoStoppedReason: string | null;
}

type Action =
  | { type: 'REQUESTING' }
  | { type: 'START_RECORDING'; mimeType: string }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'UPDATE_DURATION'; duration: number }
  | { type: 'STOPPED'; blob: Blob; previewUrl: string; duration: number; autoStoppedReason?: string }
  | { type: 'START_UPLOADING' }
  | { type: 'UPLOAD_SUCCESS' }
  | { type: 'UPLOAD_ERROR'; error: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'DISCARD' }
  | { type: 'RESET' };

function recorderReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'REQUESTING':
      if (state.status !== 'idle' && state.status !== 'error') return state;
      return { ...state, status: 'requesting', error: null, autoStoppedReason: null };

    case 'START_RECORDING':
      if (state.status !== 'requesting' && state.status !== 'idle') return state;
      return {
        ...state,
        status: 'recording',
        duration: 0,
        mimeType: action.mimeType,
        error: null,
        previewUrl: null,
        recordedBlob: null,
        autoStoppedReason: null,
      };

    case 'PAUSE':
      if (state.status !== 'recording') return state;
      return { ...state, status: 'paused' };

    case 'RESUME':
      if (state.status !== 'paused') return state;
      return { ...state, status: 'recording' };

    case 'UPDATE_DURATION':
      if (state.status !== 'recording' && state.status !== 'paused') return state;
      return { ...state, duration: action.duration };

    case 'STOPPED':
      if (state.status !== 'recording' && state.status !== 'paused') return state;
      return {
        ...state,
        status: 'stopped',
        recordedBlob: action.blob,
        previewUrl: action.previewUrl,
        duration: action.duration,
        autoStoppedReason: action.autoStoppedReason || null,
        error: null,
      };

    case 'START_UPLOADING':
      if (state.status !== 'stopped') return state;
      return { ...state, status: 'uploading', error: null };

    case 'UPLOAD_SUCCESS':
      return {
        status: 'idle',
        duration: 0,
        previewUrl: null,
        recordedBlob: null,
        mimeType: '',
        error: null,
        autoStoppedReason: null,
      };

    case 'UPLOAD_ERROR':
      if (state.status !== 'uploading') return state;
      return { ...state, status: 'stopped', error: action.error };

    case 'SET_ERROR':
      return { ...state, status: 'error', error: action.error };

    case 'DISCARD':
    case 'RESET':
      return {
        status: 'idle',
        duration: 0,
        previewUrl: null,
        recordedBlob: null,
        mimeType: '',
        error: null,
        autoStoppedReason: null,
      };

    default:
      return state;
  }
}

export interface UseMediaRecorderOptions {
  config?: MediaConfig;
}

export function useMediaRecorder({ config }: UseMediaRecorderOptions = {}) {
  const [state, dispatch] = useReducer(recorderReducer, {
    status: 'idle',
    duration: 0,
    previewUrl: null,
    recordedBlob: null,
    mimeType: '',
    error: null,
    autoStoppedReason: null,
  });

  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Capability checks
  const [capability, setCapability] = useState<{
    supported: boolean;
    reason?: string;
    chosenMimeType?: string;
  }>({ supported: true });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const totalBytesRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const isUnmountedRef = useRef<boolean>(false);
  const autoStopTriggeredRef = useRef<boolean>(false);

  // Check capabilities whenever config changes or on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.isSecureContext) {
      setCapability({
        supported: false,
        reason: 'Recording needs a secure (HTTPS) connection or localhost.',
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCapability({
        supported: false,
        reason: 'Your browser does not support audio capture (getUserMedia).',
      });
      return;
    }

    if (typeof window.MediaRecorder === 'undefined') {
      setCapability({
        supported: false,
        reason: 'Your browser does not support audio recording (MediaRecorder).',
      });
      return;
    }

    // Intersect browser supported MIME types with server allowed audio MIME types
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    let chosen: string | null = null;
    const serverAllowed = config?.allowed_mime_types?.audio
      ? config.allowed_mime_types.audio.map(normalizeMimeType)
      : null;

    for (const candidate of candidates) {
      if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(candidate)) {
        const normalized = normalizeMimeType(candidate);
        if (!serverAllowed || serverAllowed.includes(normalized)) {
          chosen = candidate;
          break;
        }
      }
    }

    if (!chosen) {
      setCapability({
        supported: false,
        reason: 'Your browser and the server have no compatible recording audio format.',
      });
      return;
    }

    setCapability({
      supported: true,
      chosenMimeType: chosen,
    });
  }, [config]);

  // Keep previewUrlRef in sync
  useEffect(() => {
    previewUrlRef.current = state.previewUrl;
  }, [state.previewUrl]);

  // Comprehensive resource cleanup
  const cleanup = useCallback(() => {
    // 1. Cancel timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // 2. Cancel audio analyser animation frame
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);

    // 3. Close AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {
        // Ignore already closed
      }
      audioContextRef.current = null;
    }

    // 4. Stop all tracks of the live MediaStream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      streamRef.current = null;
    }

    // 5. Stop MediaRecorder if still recording
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore
        }
      }
      mediaRecorderRef.current = null;
    }

    // 6. Revoke preview URL if one exists
    if (previewUrlRef.current) {
      try {
        URL.revokeObjectURL(previewUrlRef.current);
      } catch {
        // Ignore
      }
      previewUrlRef.current = null;
    }

    chunksRef.current = [];
    totalBytesRef.current = 0;
    startTimeRef.current = null;
    accumulatedTimeRef.current = 0;
    autoStopTriggeredRef.current = false;
  }, []);

  // Teardown on unmount & pagehide
  useEffect(() => {
    isUnmountedRef.current = false;
    const handlePageHide = () => cleanup();
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      isUnmountedRef.current = true;
      window.removeEventListener('pagehide', handlePageHide);
      cleanup();
    };
  }, [cleanup]);

  // Unsaved recording protection: beforeunload guard
  const hasUnsavedRecording =
    state.status === 'recording' ||
    state.status === 'paused' ||
    (state.status === 'stopped' && Boolean(state.recordedBlob));

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedRecording) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedRecording]);

  // Setup level meter
  const setupAudioMeter = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (!analyserRef.current || isUnmountedRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        // Normalize 0-100
        const level = Math.min(100, Math.round((average / 128) * 100));
        setAudioLevel(level);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      animFrameRef.current = requestAnimationFrame(updateMeter);
    } catch {
      // AudioContext unavailable or blocked: silently skip level meter
    }
  };

  // Start recording action
  const start = useCallback(async () => {
    if (state.status === 'requesting' || state.status === 'recording' || state.status === 'paused') {
      return;
    }
    if (!capability.supported || !capability.chosenMimeType) {
      dispatch({ type: 'SET_ERROR', error: capability.reason || 'Recording is not supported in this browser.' });
      return;
    }

    // Clean up any previous recording resources before starting
    cleanup();
    dispatch({ type: 'REQUESTING' });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      if (isUnmountedRef.current) return;
      let msg = 'Failed to access microphone.';
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        msg = 'Microphone access was denied. Please allow microphone permissions in your browser settings and try again.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No microphone device was detected. Please connect a microphone and try again.';
      } else if (err.name === 'NotReadableError') {
        msg = 'Microphone is already in use by another application or a hardware error occurred.';
      } else if (err.name === 'OverconstrainedError') {
        msg = 'Requested microphone constraints could not be satisfied.';
      }
      dispatch({ type: 'SET_ERROR', error: msg });
      return;
    }

    if (isUnmountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    setupAudioMeter(stream);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: capability.chosenMimeType });
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch (err: any) {
        stream.getTracks().forEach((t) => t.stop());
        dispatch({ type: 'SET_ERROR', error: 'Failed to initialize MediaRecorder: ' + err.message });
        return;
      }
    }

    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    totalBytesRef.current = 0;
    accumulatedTimeRef.current = 0;
    autoStopTriggeredRef.current = false;
    const maxUploadBytes = config?.max_upload_bytes ?? 100 * 1024 * 1024;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
        totalBytesRef.current += e.data.size;

        // Size guard: auto-stop when approaching 95% of server maximum
        if (!autoStopTriggeredRef.current && totalBytesRef.current >= maxUploadBytes * 0.95) {
          autoStopTriggeredRef.current = true;
          stopInternal('Recording stopped because it reached the maximum file size.');
        }
      }
    };

    recorder.onstop = () => {
      // Release microphone tracks immediately on stop
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // Ignore
          }
        });
        streamRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch {
          // Ignore
        }
        audioContextRef.current = null;
      }
      setAudioLevel(0);

      const finalMime = recorder.mimeType || capability.chosenMimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: finalMime });
      const finalDuration = accumulatedTimeRef.current;

      if (blob.size === 0 || finalDuration <= 0.05) {
        dispatch({ type: 'SET_ERROR', error: 'Recording was empty. Please try again.' });
        return;
      }

      const previewUrl = URL.createObjectURL(blob);
      dispatch({
        type: 'STOPPED',
        blob,
        previewUrl,
        duration: finalDuration,
        autoStoppedReason: autoStopTriggeredRef.current
          ? 'Recording stopped because it reached the maximum file size.'
          : undefined,
      });
    };

    // Start recorder with 1-second timeslice so chunks accumulate and bytes are tracked
    recorder.start(1000);
    startTimeRef.current = Date.now();
    dispatch({ type: 'START_RECORDING', mimeType: recorder.mimeType || capability.chosenMimeType });

    // Duration timer interval
    timerIntervalRef.current = setInterval(() => {
      if (startTimeRef.current !== null) {
        const curSeconds = (Date.now() - startTimeRef.current) / 1000 + accumulatedTimeRef.current;
        dispatch({ type: 'UPDATE_DURATION', duration: curSeconds });
      }
    }, 200);
  }, [capability, config, cleanup]);

  // Pause
  const pause = useCallback(() => {
    if (state.status !== 'recording' || !mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
    if (startTimeRef.current !== null) {
      accumulatedTimeRef.current += (Date.now() - startTimeRef.current) / 1000;
      startTimeRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    dispatch({ type: 'PAUSE' });
  }, [state.status]);

  // Resume
  const resume = useCallback(() => {
    if (state.status !== 'paused' || !mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
    startTimeRef.current = Date.now();
    timerIntervalRef.current = setInterval(() => {
      if (startTimeRef.current !== null) {
        const curSeconds = (Date.now() - startTimeRef.current) / 1000 + accumulatedTimeRef.current;
        dispatch({ type: 'UPDATE_DURATION', duration: curSeconds });
      }
    }, 200);
    dispatch({ type: 'RESUME' });
  }, [state.status]);

  // Stop internal
  const stopInternal = (_autoStoppedReason?: string) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (startTimeRef.current !== null) {
      accumulatedTimeRef.current += (Date.now() - startTimeRef.current) / 1000;
      startTimeRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
  };

  // User Stop
  const stop = useCallback(() => {
    if (state.status !== 'recording' && state.status !== 'paused') return;
    stopInternal();
  }, [state.status]);

  // Discard preview
  const discard = useCallback(() => {
    cleanup();
    dispatch({ type: 'DISCARD' });
  }, [cleanup]);

  // Mark uploading
  const markUploading = useCallback(() => {
    dispatch({ type: 'START_UPLOADING' });
  }, []);

  // Upload success
  const handleUploadSuccess = useCallback(() => {
    cleanup();
    dispatch({ type: 'UPLOAD_SUCCESS' });
  }, [cleanup]);

  // Upload error (preserves preview in stopped state with retry)
  const handleUploadError = useCallback((errorMsg: string) => {
    dispatch({ type: 'UPLOAD_ERROR', error: errorMsg });
  }, []);

  return {
    state: state.status,
    duration: state.duration,
    recordedBlob: state.recordedBlob,
    previewUrl: state.previewUrl,
    mimeType: state.mimeType,
    error: state.error,
    autoStoppedReason: state.autoStoppedReason,
    audioLevel,
    isSupported: capability.supported,
    unsupportedReason: capability.reason,
    start,
    pause,
    resume,
    stop,
    discard,
    markUploading,
    handleUploadSuccess,
    handleUploadError,
  };
}
