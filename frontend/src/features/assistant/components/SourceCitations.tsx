import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import type { SourceRef } from '../types';

interface SourceCitationsProps {
  sources: SourceRef[];
  onSelectSource?: (sourceId: string) => void;
}

export const SourceCitations: React.FC<SourceCitationsProps> = ({ sources, onSelectSource }) => {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center space-x-1.5 mb-2">
        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Sources ({sources.length})
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {sources.map((src, idx) => {
          const targetId = src.source_id || src.chunk_id || `src-${idx}`;
          return (
            <button
              key={`${targetId}-${idx}`}
              type="button"
              onClick={() => onSelectSource?.(src.source_id || src.chunk_id || '')}
              className="group inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 transition-all text-left shadow-2xs"
              title={src.title}
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 group-hover:bg-blue-200 text-blue-700 text-[10px] font-bold shrink-0 transition-colors">
                {idx + 1}
              </span>
              <span className="font-semibold truncate max-w-[220px]">
                {src.title.replace(/^Knowledge base document:\s*/i, '')}
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-600 shrink-0 ml-0.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
