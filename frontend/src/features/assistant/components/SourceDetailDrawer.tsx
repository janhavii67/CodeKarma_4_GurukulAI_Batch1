import React, { useEffect, useState } from 'react';
import { X, FileText, CheckCircle2, Cpu, Clock, AlertCircle } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { getSource } from '../api';
import type { SourceDetail } from '../types';

interface SourceDetailDrawerProps {
  sourceId: string | null;
  onClose: () => void;
}

export const SourceDetailDrawer: React.FC<SourceDetailDrawerProps> = ({ sourceId, onClose }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId) {
      setSource(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getSource(sourceId)
      .then((data) => {
        if (isMounted) {
          setSource(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err?.message || 'Failed to load published source details.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sourceId]);

  if (!sourceId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 leading-tight">
                Verified Knowledge Source
              </h3>
              <span className="text-xs text-slate-500">Published Shopfloor Procedure</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 space-y-3">
              <LoadingSpinner size="lg" />
              <p className="text-sm">Fetching verified technical chunks...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start space-x-3 text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Unable to access source</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && source && (
            <div className="space-y-6">
              {/* Meta information */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="text-base font-bold text-slate-900">{source.title}</h4>
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="success" size="sm">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Published & Approved
                  </Badge>
                  <Badge variant="brand" size="sm">
                    {source.source_type}
                  </Badge>
                  {source.machine_id && (
                    <Badge variant="neutral" size="sm">
                      <Cpu className="w-3.5 h-3.5 mr-1" />
                      Machine Bound
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-slate-500 pt-1 flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  <span>Indexed: {new Date(source.indexed_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Text Chunks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Verified Chunks ({source.chunks.length})
                  </h5>
                  <span className="text-[11px] text-slate-400">Strict Grounding Reference</span>
                </div>

                {source.chunks.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No active text chunks found in this source.</p>
                ) : (
                  source.chunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className="p-4 rounded-lg border border-slate-200 bg-white shadow-sm space-y-2 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b border-slate-100">
                        <span className="font-semibold text-slate-700">Chunk #{chunk.chunk_index + 1}</span>
                        {chunk.section_label && (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                            {chunk.section_label}
                          </span>
                        )}
                        {chunk.timestamp_start !== null && chunk.timestamp_end !== null && (
                          <span className="font-mono text-slate-500">
                            {chunk.timestamp_start?.toFixed(1)}s - {chunk.timestamp_end?.toFixed(1)}s
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-800 leading-relaxed font-sans">{chunk.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Source ID: <code className="font-mono text-slate-700">{sourceId}</code></span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
