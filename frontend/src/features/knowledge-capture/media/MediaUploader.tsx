import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud,
  File as FileIcon,
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { MediaAsset, MediaConfig, QueueItem } from './types';
import {
  formatBytes,
  normalizeMimeType,
  getAllAllowedMimes,
  mapMediaErrorToMessage,
} from './mediaUtils';
import { uploadWithProgress } from './uploadWithProgress';
import { Button } from '../../../components/ui/Button';

/** Maps a tab kind to human-readable labels for wrong-kind rejection messages */
const KIND_TAB_LABELS: Record<string, string> = {
  audio: 'audio',
  video: 'video',
  images: 'image',
  documents: 'document',
};

const KIND_MIME_PREFIXES: Record<string, string[]> = {
  audio: ['audio/'],
  video: ['video/'],
  images: ['image/'],
  documents: ['application/pdf'],
};

interface MediaUploaderProps {
  versionId: string;
  config?: MediaConfig;
  currentAssetCount: number;
  onUploaded?: (media: MediaAsset) => void;
  onUploadSuccess: () => void;
  isVersionFrozen?: boolean;
  /**
   * When set, restricts the uploader to only the files belonging to this
   * tab kind. Wrong-kind files are rejected client-side with a redirect
   * message. This is a convenience check only — the backend validates.
   */
  kindFilter?: string;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  versionId,
  config,
  currentAssetCount,
  onUploaded,
  onUploadSuccess,
  isVersionFrozen,
  kindFilter,
}) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const isUploadingActive = queue.some(
    (item) => item.status === 'uploading' || item.status === 'processing'
  );

  // Unsaved in-flight upload protection: beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isUploadingActive) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUploadingActive]);

  const announce = (msg: string) => {
    setLiveAnnouncement(msg);
  };

  const allowedMimes = config ? getAllAllowedMimes(config) : [];
  const maxBytes = config?.max_upload_bytes ?? 100 * 1024 * 1024;
  const maxAssets = config?.max_media_per_version ?? 10;
  const totalAssetsCount = currentAssetCount + queue.filter((i) => i.status !== 'failed').length;
  const isCapReached = totalAssetsCount >= maxAssets;

  // Process next item in sequential queue
  const processNextInQueue = useCallback(async () => {
    if (isVersionFrozen) return;

    // Find the first item that is 'queued'
    const nextItem = queueRef.current.find((item) => item.status === 'queued');
    if (!nextItem) return;

    // Check if another item is currently uploading
    const currentlyUploading = queueRef.current.some(
      (item) => item.status === 'uploading' || item.status === 'processing'
    );
    if (currentlyUploading) return;

    const abortController = new AbortController();

    // Mark as uploading
    setQueue((prev) =>
      prev.map((item) =>
        item.id === nextItem.id
          ? { ...item, status: 'uploading', progress: 0, isProcessing: false, abortController }
          : item
      )
    );

    try {
      const asset = await uploadWithProgress(versionId, nextItem.file, {
        signal: abortController.signal,
        onProgress: (p) => {
          setQueue((prev) =>
            prev.map((item) =>
              item.id === nextItem.id
                ? {
                    ...item,
                    progress: p.percent,
                    isProcessing: p.isProcessing,
                    status: p.isProcessing ? 'processing' : 'uploading',
                  }
                : item
            )
          );
        },
      });

      // Mark done
      setQueue((prev) =>
        prev.map((item) =>
          item.id === nextItem.id ? { ...item, status: 'done', progress: 100 } : item
        )
      );

      announce(`Upload complete: ${nextItem.file.name}`);
      onUploadSuccess();
      onUploaded?.(asset);

      // Remove completed item from queue after short delay
      setTimeout(() => {
        setQueue((prev) => prev.filter((item) => item.id !== nextItem.id));
      }, 1000);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Canceled: remove from queue
        setQueue((prev) => prev.filter((item) => item.id !== nextItem.id));
        announce(`Upload canceled: ${nextItem.file.name}`);
      } else {
        const errorMsg = mapMediaErrorToMessage(err, config);
        setQueue((prev) =>
          prev.map((item) =>
            item.id === nextItem.id
              ? { ...item, status: 'failed', error: errorMsg, isProcessing: false }
              : item
          )
        );
        announce(`Upload failed: ${nextItem.file.name}. ${errorMsg}`);
      }
    }
  }, [versionId, config, onUploaded, onUploadSuccess, isVersionFrozen]);

  // Trigger queue processing whenever queue changes
  useEffect(() => {
    processNextInQueue();
  }, [queue, processNextInQueue]);

  // Handle incoming files from picker or drag-and-drop
  const handleFiles = (fileList: FileList | File[]) => {
    if (isVersionFrozen) return;

    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newItems: QueueItem[] = [];
    let currentCount = currentAssetCount + queue.filter((i) => i.status !== 'failed').length;

    for (const file of files) {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // 0. Kind filter — client-side convenience check only; backend validates
      if (kindFilter) {
        const mimeToCheck = file.type.toLowerCase();
        const kindPrefixes = KIND_MIME_PREFIXES[kindFilter] ?? [];
        const matchesKind = kindPrefixes.some((prefix) =>
          mimeToCheck.startsWith(prefix) || mimeToCheck === prefix
        );
        if (!matchesKind) {
          // Determine which tab the file should go to
          let redirectTab = 'appropriate';
          for (const [k, prefixes] of Object.entries(KIND_MIME_PREFIXES)) {
            if (prefixes.some((p) => mimeToCheck.startsWith(p) || mimeToCheck === p)) {
              redirectTab = KIND_TAB_LABELS[k] ?? k;
              break;
            }
          }
          const thisTabLabel = KIND_TAB_LABELS[kindFilter] ?? kindFilter;
          newItems.push({
            id,
            file,
            status: 'failed',
            progress: 0,
            isProcessing: false,
            error:
              redirectTab !== 'appropriate'
                ? `This tab accepts ${thisTabLabel} files only. Use the ${redirectTab.charAt(0).toUpperCase() + redirectTab.slice(1)} tab for ${redirectTab} files.`
                : `This tab accepts ${thisTabLabel} files only.`,
          });
          continue;
        }
      }

      // 1. Cap check
      if (currentCount >= maxAssets) {
        newItems.push({
          id,
          file,
          status: 'failed',
          progress: 0,
          isProcessing: false,
          error: `Asset limit of ${maxAssets} reached. Cannot add more files.`,
        });
        continue;
      }

      // 2. Empty file check
      if (file.size === 0) {
        newItems.push({
          id,
          file,
          status: 'failed',
          progress: 0,
          isProcessing: false,
          error: 'File is empty (0 bytes).',
        });
        continue;
      }

      // 3. Oversize check
      if (file.size > maxBytes) {
        newItems.push({
          id,
          file,
          status: 'failed',
          progress: 0,
          isProcessing: false,
          error: `File size (${formatBytes(file.size)}) exceeds maximum limit of ${formatBytes(maxBytes)}.`,
        });
        continue;
      }

      // 4. MIME type check
      const normalizedMime = normalizeMimeType(file.type);
      if (!file.type || !normalizedMime) {
        newItems.push({
          id,
          file,
          status: 'failed',
          progress: 0,
          isProcessing: false,
          error: 'File type could not be determined. Please ensure file has a valid extension.',
        });
        continue;
      }

      if (allowedMimes.length > 0 && !allowedMimes.includes(normalizedMime)) {
        newItems.push({
          id,
          file,
          status: 'failed',
          progress: 0,
          isProcessing: false,
          error: `Unsupported file type (${normalizedMime}).`,
        });
        continue;
      }

      // Valid: queue it
      newItems.push({
        id,
        file,
        status: 'queued',
        progress: 0,
        isProcessing: false,
      });
      currentCount++;
    }

    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
      announce(`Added ${newItems.length} file${newItems.length > 1 ? 's' : ''} to upload queue`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRetry = (item: QueueItem) => {
    setQueue((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, status: 'queued', progress: 0, error: null } : i
      )
    );
    announce(`Retrying upload: ${item.file.name}`);
  };

  const handleCancel = (item: QueueItem) => {
    if (item.abortController) {
      item.abortController.abort();
    } else {
      setQueue((prev) => prev.filter((i) => i.id !== item.id));
    }
  };

  const handleDismiss = (item: QueueItem) => {
    setQueue((prev) => prev.filter((i) => i.id !== item.id));
  };

  return (
    <div className="space-y-4">
      {/* Polite live region for accessibility */}
      <div className="sr-only" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id="media-file-input"
        type="file"
        multiple
        accept={allowedMimes.join(',')}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
        className="sr-only"
        disabled={isCapReached || isVersionFrozen}
      />

      {/* Drop Zone */}
      <div
        role="button"
        tabIndex={isCapReached || isVersionFrozen ? -1 : 0}
        aria-label="Upload files: Drag and drop or press Enter to browse"
        onClick={() => !isCapReached && !isVersionFrozen && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isCapReached && !isVersionFrozen) fileInputRef.current?.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-150 ${
          isCapReached || isVersionFrozen
            ? 'border-[#DCE8F5] bg-[#F7FAFE]/50 cursor-not-allowed opacity-60'
            : isDragOver
            ? 'border-[#1473E6] bg-[#EFF7FF] text-[#1473E6] ring-2 ring-[#1473E6]/20'
            : 'border-[#BCD7F5] bg-[#F7FAFE] hover:border-[#1473E6] hover:bg-[#EFF7FF]'
        }`}
      >
        <div className="flex flex-col items-center justify-center space-y-2.5">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors shadow-xs ${
              isDragOver
                ? 'bg-[#1473E6] text-white'
                : 'bg-white border border-[#BCD7F5] text-[#1473E6] group-hover:bg-[#1473E6] group-hover:text-white'
            }`}
          >
            <UploadCloud className="w-5 h-5" />
          </div>

          <div className="space-y-1">
            <p className="text-xs sm:text-sm font-semibold text-[#12345A]">
              {isDragOver ? (
                <span className="text-[#1473E6] font-bold">Drop files here to upload</span>
              ) : isCapReached ? (
                <span>Asset limit reached ({maxAssets} items)</span>
              ) : (
                <span>
                  Drag and drop files here, or click to <span className="text-[#1473E6] underline underline-offset-2">browse</span>
                </span>
              )}
            </p>
            <p className="text-[11px] text-[#536780]">
              Supports audio, video, images and PDF (max {formatBytes(maxBytes)})
            </p>
          </div>

          {/* Media Format Badges matching reference image */}
          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-semibold">
              <span className="text-xs">🎵</span>
              <span>Audio</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold">
              <span className="text-xs">🎥</span>
              <span>Video</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
              <span className="text-xs">🖼</span>
              <span>Images</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 text-[11px] font-semibold">
              <span className="text-xs">📄</span>
              <span>PDF</span>
            </span>
          </div>
        </div>
      </div>

      {/* Upload Queue Display */}
      {queue.length > 0 && (
        <div className="space-y-2" aria-label="Upload queue">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Upload Queue ({queue.length})
          </p>
          <div className="space-y-2">
            {queue.map((item) => (
              <div
                key={item.id}
                className="rounded-lg bg-slate-800/60 border border-slate-700/60 p-3 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-200 truncate">{item.file.name}</span>
                    <span className="text-slate-500 shrink-0">({formatBytes(item.file.size)})</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === 'queued' && (
                      <span className="text-[11px] text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
                        Queued
                      </span>
                    )}

                    {(item.status === 'uploading' || item.status === 'processing') && (
                      <span className="flex items-center gap-1.5 text-[11px] text-brand-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {item.status === 'processing' ? 'Processing…' : `${item.progress}%`}
                      </span>
                    )}

                    {item.status === 'done' && (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Uploaded
                      </span>
                    )}

                    {item.status === 'failed' && (
                      <span className="flex items-center gap-1 text-[11px] text-rose-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Failed
                      </span>
                    )}

                    {/* Actions */}
                    {(item.status === 'queued' || item.status === 'uploading') && (
                      <button
                        type="button"
                        onClick={() => handleCancel(item)}
                        className="p-1 text-slate-400 hover:text-slate-200"
                        title="Cancel upload"
                        aria-label={`Cancel upload for ${item.file.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {item.status === 'failed' && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(item)}
                          className="h-6 px-2 text-[11px] flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </Button>
                        <button
                          type="button"
                          onClick={() => handleDismiss(item)}
                          className="p-1 text-slate-400 hover:text-slate-200"
                          title="Dismiss"
                          aria-label={`Dismiss ${item.file.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {(item.status === 'uploading' || item.status === 'processing') && (
                  <div
                    className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={item.status === 'processing' ? undefined : item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Upload progress for ${item.file.name}`}
                  >
                    <div
                      className={`h-full transition-all duration-150 ${
                        item.status === 'processing'
                          ? 'w-full bg-brand-400 animate-pulse'
                          : 'bg-brand-400'
                      }`}
                      style={{
                        width: item.status === 'processing' ? '100%' : `${item.progress}%`,
                      }}
                    />
                  </div>
                )}

                {/* Error message */}
                {item.status === 'failed' && item.error && (
                  <p className="text-[11px] text-rose-400">{item.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
