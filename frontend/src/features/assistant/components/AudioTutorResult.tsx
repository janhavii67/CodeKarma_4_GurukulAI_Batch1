import React from 'react';
import { AudioLines, ExternalLink, ShieldAlert } from 'lucide-react';
import type { AudioAnalysisResult } from '../types';

interface AudioTutorResultProps {
  result: AudioAnalysisResult;
}

export const AudioTutorResult: React.FC<AudioTutorResultProps> = ({ result }) => {
  const match = result.status === 'MATCHED' ? result.matched_reference : null;

  return (
    <section aria-label="Machine sound comparison" className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AudioLines className="h-4 w-4 text-blue-700" />
        <h4 className="text-sm font-semibold text-slate-900">Machine sound comparison</h4>
      </div>

      {result.audio_observation && (
        <div className="rounded-lg border border-violet-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">AI audio observations</p>
          <p className="mt-1 text-sm leading-6 text-slate-800">{result.audio_observation}</p>
          <p className="mt-2 text-[11px] text-slate-500">Model-generated description of this recording; it is not verified machine guidance.</p>
        </div>
      )}

      {result.processing_metadata && (
        <p className="text-[11px] text-slate-500">
          Processed {result.processing_metadata.duration_seconds}s · {result.processing_metadata.input_format} · {result.processing_metadata.channels} channel(s) · normalized to {result.processing_metadata.normalized_sample_rate} Hz
        </p>
      )}

      {match ? (
        <>
          <div className="rounded-lg border border-blue-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Possible documented match</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{match.title}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {[match.machine_name, match.model_name, match.component, match.operation].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                Similarity {match.similarity_score.toFixed(2)} / 1
              </span>
            </div>
            {match.operating_conditions && (
              <p className="mt-3 text-xs text-slate-700"><strong>Reference conditions:</strong> {match.operating_conditions}</p>
            )}
            <p className="mt-3 text-sm leading-6 text-slate-800">
              <strong>Approved expert interpretation:</strong> {match.interpretation}
            </p>
          </div>

          {match.knowledge_sources.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-600">Approved knowledge</p>
              <div className="flex flex-wrap gap-2">
                {match.knowledge_sources.map((source) => (
                  <a
                    key={source.knowledge_version_id}
                    href={`/app/knowledge/${encodeURIComponent(source.knowledge_item_id)}?version_id=${encodeURIComponent(source.knowledge_version_id)}`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:border-blue-300 hover:bg-blue-50"
                    title={source.title}
                  >
                    <span className="max-w-[240px] truncate">{source.title}</span>
                    {source.version_no ? <span>v{source.version_no}</span> : null}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <p>{result.message}</p>
          {!result.audio_observation && <p className="mt-1 text-xs">AI audio observations are unavailable for this recording.</p>}
        </div>
      )}

      <p className="flex items-start gap-2 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>{result.limitation} If the machine sounds abnormal or unsafe, follow site procedures and contact a supervisor.</span>
      </p>
    </section>
  );
};
