import React from 'react';
import { Paperclip, AlertCircle, RotateCcw, Info } from 'lucide-react';
import { MediaAsset } from './types';
import { MediaItem } from './MediaItem';
import { Button } from '../../../components/ui/Button';

interface MediaListProps {
  assets: MediaAsset[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  canEdit: boolean;
  versionNo?: number;
  onDelete: (id: string) => Promise<void>;
  onRetryList: () => void;
  deletingId?: string | null;
}

export const MediaList: React.FC<MediaListProps> = ({
  assets,
  isLoading,
  isError,
  canEdit,
  versionNo,
  onDelete,
  onRetryList,
  deletingId,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading media attachments">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl bg-slate-800/30 border border-slate-700/40 p-4 space-y-3 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-700/60" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 bg-slate-700/60 rounded w-1/3" />
                <div className="h-2.5 bg-slate-700/40 rounded w-1/4" />
              </div>
            </div>
            <div className="h-10 bg-slate-700/30 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs text-rose-300 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Could not load media attachments for this version.</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetryList}
          className="h-7 text-xs flex items-center gap-1 border-rose-500/30 text-rose-300"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="space-y-3">
        {versionNo !== undefined && versionNo > 1 && (
          <div className="rounded-xl bg-slate-800/30 border border-slate-700/40 p-3 text-xs text-slate-400 flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500 shrink-0" />
            <span>Media from earlier versions is not copied to new revisions.</span>
          </div>
        )}

        <div className="rounded-xl border border-[#DCE8F5] bg-[#F7FAFE] p-6 text-center space-y-2">
          <div className="w-9 h-9 rounded-xl bg-white border border-[#BCD7F5] flex items-center justify-center mx-auto text-[#1473E6] shadow-xs">
            <Paperclip className="w-4 h-4" />
          </div>
          <p className="text-xs font-semibold text-[#12345A]">
            {canEdit ? 'No media attached yet' : 'No media attached to this version.'}
          </p>
          {canEdit && (
            <p className="text-[11px] text-[#536780]">
              Record voice guidance or upload photos, documents, and videos to enrich this procedure.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {versionNo !== undefined && versionNo > 1 && assets.length === 0 && (
        <div className="rounded-xl bg-slate-800/30 border border-slate-700/40 p-3 text-xs text-slate-400 flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-500 shrink-0" />
          <span>Media from earlier versions is not copied to new revisions.</span>
        </div>
      )}

      <div className="space-y-3" aria-label="Attached media list">
        {assets.map((asset) => (
          <MediaItem
            key={asset.id}
            asset={asset}
            canEdit={canEdit}
            onDelete={onDelete}
            isDeleting={deletingId === asset.id}
          />
        ))}
      </div>
    </div>
  );
};
