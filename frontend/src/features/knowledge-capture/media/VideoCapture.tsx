import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Circle, RotateCcw, Square, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { MediaAsset, MediaConfig, UploadProgress } from './types';
import { formatBytes, generateRecordingFilename, mapMediaErrorToMessage, recorderMimeToExtension } from './mediaUtils';

interface VideoCaptureProps {
  config: MediaConfig;
  onUpload: (file: File, onProgress: (progress: UploadProgress) => void) => Promise<MediaAsset>;
  onUploaded?: (asset: MediaAsset) => void;
}

export const VideoCapture: React.FC<VideoCaptureProps> = ({ config, onUpload, onUploaded }) => {
  const liveRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (liveRef.current && stream) liveRef.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    if (previewRef.current && previewUrl) previewRef.current.src = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const startCamera = async () => {
    setError(''); setMessage('');
    if (!window.isSecureContext) { setError('Camera capture requires HTTPS or localhost.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser does not support camera recording. You can upload a video file instead.'); return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = nextStream; setStream(nextStream);
    } catch (reason) {
      const name = (reason as { name?: string })?.name;
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Camera or microphone access was denied. Allow access in browser settings and retry.'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError'
        ? 'No camera or microphone was found. Connect a device or upload a video file.'
        : `Could not open the camera: ${reason instanceof Error ? reason.message : 'unknown device error'}`);
    }
  };

  const startRecording = () => {
    if (!stream) return;
    const serverTypes = config.allowed_mime_types.video ?? [];
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = candidates.find((type) => (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type)) &&
      (!serverTypes.length || serverTypes.some((serverType) => type.startsWith(serverType))));
    if (!mimeType) { setError('This browser cannot record a video format accepted by the server. Use video upload instead.'); return; }
    chunksRef.current = [];
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => setError('Recording stopped because the browser reported a media error.');
      recorder.onstop = () => {
        const result = new Blob(chunksRef.current, { type: mimeType });
        setBlob(result); setPreviewUrl(URL.createObjectURL(result));
        stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; setStream(null);
      };
      recorderRef.current = recorder; recorder.start(250); setSeconds(0); setRecording(true); setError('');
    } catch (reason) { setError(`Could not start recording: ${reason instanceof Error ? reason.message : 'unsupported device'}`); }
  };

  const stopRecording = () => {
    setRecording(false);
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
  };

  const reset = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setStream(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); setBlob(null); setRecording(false); setSeconds(0); setError(''); setMessage('');
  };

  const save = async () => {
    if (!blob) return;
    const max = config.max_upload_bytes || 100 * 1024 * 1024;
    if (!blob.size || blob.size > max) { setError(blob.size ? `Video exceeds the ${formatBytes(max)} upload limit.` : 'The recording is empty. Record again.'); return; }
    setBusy(true); setError(''); setMessage('Uploading video…');
    try {
      const file = new File([blob], generateRecordingFilename(recorderMimeToExtension(blob.type)), { type: blob.type });
      const asset = await onUpload(file, (progress) => setUploadProgress(progress.percent)); onUploaded?.(asset); reset(); setMessage('Video saved to this knowledge draft.');
    } catch (reason) { setError(mapMediaErrorToMessage(reason, config)); setMessage(''); }
    finally { setBusy(false); }
  };

  return <section className="rounded-xl border border-[#BCD7F5] bg-[#F4F8FD] p-4 space-y-3" aria-label="Video capture">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-[#12345A]">Video capture</h3><p className="text-xs text-[#536780] mt-0.5">Record a real clip or upload existing footage. The file is attached to this draft.</p></div><span className="font-mono text-xs text-[#536780]">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span></div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
    {message && <p role="status" className="text-xs font-medium text-[#16865C]">{busy ? `${message} ${uploadProgress}%` : message}</p>}
    {stream && !blob && <video ref={liveRef} autoPlay muted playsInline className="w-full max-h-72 rounded-lg bg-slate-950" aria-label="Live camera preview" />}
    {previewUrl && <video ref={previewRef} controls playsInline className="w-full max-h-72 rounded-lg bg-slate-950" aria-label="Recorded video preview" />}
    <div className="flex flex-wrap gap-2">
      {!stream && !blob && <Button size="sm" variant="outline" onClick={startCamera}><Camera className="w-4 h-4 mr-1.5" />Open Camera</Button>}
      {stream && !recording && <Button size="sm" variant="primary" onClick={startRecording}><Circle className="w-4 h-4 mr-1.5" />Start Recording</Button>}
      {recording && <Button size="sm" variant="danger" onClick={stopRecording}><Square className="w-4 h-4 mr-1.5" />Stop Recording</Button>}
      {blob && <><Button size="sm" variant="primary" onClick={save} disabled={busy}><Upload className="w-4 h-4 mr-1.5" />{busy ? 'Uploading…' : 'Save Video'}</Button><Button size="sm" variant="outline" onClick={reset} disabled={busy}><RotateCcw className="w-4 h-4 mr-1.5" />Retry</Button></>}
    </div>
  </section>;
};
