import { MediaConfig } from './types';
import { ApiClientError } from '../../../lib/api/client';

/** Format byte size to human readable string (e.g. "1.5 MB") */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Format duration in seconds to mm:ss */
export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** Normalize MIME type by lowercasing, stripping parameters (;codecs=...), and mapping known aliases */
export function normalizeMimeType(mime: string): string {
  if (!mime) return '';
  const base = mime.toLowerCase().split(';')[0].trim();
  const aliasMap: Record<string, string> = {
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/mp3': 'audio/mpeg',
    'audio/x-m4a': 'audio/mp4',
    'image/pjpeg': 'image/jpeg',
    'image/x-png': 'image/png',
  };
  return aliasMap[base] || base;
}

/** Flatten and normalize all allowed MIME types from backend config */
export function getAllAllowedMimes(config: MediaConfig): string[] {
  if (!config?.allowed_mime_types) return [];
  const allMimes: string[] = [];
  for (const list of Object.values(config.allowed_mime_types)) {
    if (Array.isArray(list)) {
      for (const m of list) {
        allMimes.push(normalizeMimeType(m));
      }
    }
  }
  return Array.from(new Set(allMimes));
}

/** Generate client-side timestamped recording filename: recording-YYYYMMDD-HHmmss.<ext> */
export function generateRecordingFilename(ext: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const cleanExt = ext.replace(/^\./, '');
  return `recording-${yyyy}${mm}${dd}-${hh}${min}${ss}.${cleanExt}`;
}

/** Map actual recorder MIME type to target file extension */
export function recorderMimeToExtension(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes('webm')) return 'webm';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('mp4')) return 'm4a';
  return 'webm';
}

/** Maps API errors to human-friendly messages */
export function mapMediaErrorToMessage(error: unknown, config?: MediaConfig): string {
  if (error instanceof ApiClientError || (error instanceof Error && ('code' in error || 'status' in error))) {
    const e = error as any;
    const allVals = [e.code, e.status, e.message, e.details].map((v) => String(v ?? '').toLowerCase());

    if (allVals.some((v) => v === 'media_limit_reached' || v.includes('media_limit'))) {
      return `Media limit reached. Maximum ${config?.max_media_per_version ?? 10} assets per version.`;
    }
    if (allVals.some((v) => v === '413' || v === 'payload_too_large' || v.includes('too_large') || v.includes('too large'))) {
      return `File exceeds the maximum upload size limit of ${
        config ? formatBytes(config.max_upload_bytes) : 'the server'
      }.`;
    }
    if (allVals.some((v) => v === '415' || v === 'unsupported_media_type' || v.includes('unsupported'))) {
      return 'Unsupported file type or file content does not match its declared type.';
    }
    if (allVals.some((v) => v === '422' || v === 'validation_error' || v.includes('validation'))) {
      return 'Invalid or empty file payload.';
    }
    if (allVals.some((v) => v === 'frozen_version' || v.includes('frozen'))) {
      return 'This version is frozen and can no longer be edited.';
    }
    if (allVals.some((v) => v === '401' || v === 'unauthorized')) {
      return 'Session expired. Please sign in again.';
    }
    if (allVals.some((v) => v === '403' || v === 'forbidden')) {
      return 'You do not have permission to modify media for this version.';
    }
    if (allVals.some((v) => v === '404' || v === 'not_found')) {
      return 'The requested resource is not available.';
    }
    if (allVals.some((v) => v === '409')) {
      return 'This version is frozen and can no longer be edited.';
    }
    if (allVals.some((v) => v === '500' || v === 'server_error' || v.startsWith('5'))) {
      return 'Server error occurred while processing media. Please try again.';
    }
    return (error as Error).message || 'An error occurred while uploading media.';
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'Upload was canceled.';
    }
    return error.message;
  }

  return 'A network or unexpected error occurred. Please try again.';
}
