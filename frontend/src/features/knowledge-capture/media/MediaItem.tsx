import React, { useState } from 'react';
import {
  FileText,
  Volume2,
  Video as VideoIcon,
  Image as ImageIcon,
  ExternalLink,
  Trash2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { MediaAsset } from './types';
import { formatBytes } from './mediaUtils';
import { getApiUrl } from '../../../lib/api/client';
import { Button } from '../../../components/ui/Button';

interface MediaItemProps {
  asset: MediaAsset;
  canEdit: boolean;
  onDelete: (id: string) => Promise<void>;
  isDeleting?: boolean;
}

export const MediaItem: React.FC<MediaItemProps> = ({
  asset,
  canEdit,
  onDelete,
  isDeleting,
}) => {
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Derive media stream URL safely strictly from ID
  const rawUrl = asset.url || `/media/${asset.id}`;
  const mediaUrl = getApiUrl(rawUrl) + (retryKey > 0 ? `?retry=${retryKey}` : '');

  const formattedDate = new Date(asset.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const getKindIcon = () => {
    switch (asset.kind) {
      case 'audio':
        return <Volume2 className="w-4 h-4 text-emerald-400" />;
      case 'video':
        return <VideoIcon className="w-4 h-4 text-sky-400" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-amber-400" />;
      case 'document':
      default:
        return <FileText className="w-4 h-4 text-indigo-400" />;
    }
  };

  const handleRetryLoad = () => {
    setLoadError(false);
    setRetryKey((k) => k + 1);
  };

  const handleConfirmDelete = async () => {
    setShowConfirmDelete(false);
    await onDelete(asset.id);
  };

  return (
    <div className="rounded-xl bg-white border border-[#DCE8F5] p-4 space-y-3 shadow-xs">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#EFF7FF] border border-[#BCD7F5] flex items-center justify-center shrink-0">
            {getKindIcon()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#12345A] truncate" title={asset.original_name}>
              {asset.original_name}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-[#536780]">
              <span className="capitalize">{asset.kind}</span>
              <span>•</span>
              <span>{formatBytes(asset.size_bytes)}</span>
              <span>•</span>
              <span>{formattedDate}</span>
            </div>
          </div>
        </div>

        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirmDelete(true)}
            disabled={isDeleting}
            className="h-7 px-2 text-slate-400 hover:text-rose-400 hover:border-rose-500/40"
            aria-label={`Delete ${asset.original_name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Media Player / Presentation */}
      <div className="pt-1">
        {loadError ? (
          <div className="rounded-lg bg-slate-800/60 border border-slate-700/60 p-3 text-xs text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>This file could not be loaded.</span>
            </div>
            <button
              type="button"
              onClick={handleRetryLoad}
              className="text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        ) : (
          <>
            {asset.kind === 'audio' && (
              <audio
                key={retryKey}
                controls
                preload="metadata"
                src={mediaUrl}
                onError={() => setLoadError(true)}
                className="w-full h-10 rounded-lg outline-none"
                aria-label={`Audio player for ${asset.original_name}`}
              />
            )}

            {asset.kind === 'video' && (
              <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex justify-center">
                <video
                  key={retryKey}
                  controls
                  preload="metadata"
                  src={mediaUrl}
                  onError={() => setLoadError(true)}
                  className="max-h-72 w-full object-contain"
                  aria-label={`Video player for ${asset.original_name}`}
                />
              </div>
            )}

            {asset.kind === 'image' && (
              <div className="relative rounded-lg overflow-hidden bg-slate-900/50 border border-slate-800/80 p-2 flex justify-center">
                <img
                  key={retryKey}
                  loading="lazy"
                  src={mediaUrl}
                  alt={asset.original_name}
                  onError={() => setLoadError(true)}
                  className="max-h-64 max-w-full rounded object-contain"
                />
              </div>
            )}

            {asset.kind === 'document' && (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-200 transition-colors"
              >
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Open PDF Document</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 ml-1" />
              </a>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showConfirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-dialog-${asset.id}`}
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4 shadow-2xl">
            <h3 id={`delete-dialog-${asset.id}`} className="text-sm font-semibold text-slate-100">
              Delete attachment?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Delete <span className="font-semibold text-slate-200">{asset.original_name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
