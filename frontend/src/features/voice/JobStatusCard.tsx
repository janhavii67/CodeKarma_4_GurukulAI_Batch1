import React from 'react';
import { ProcessingJob, retryProcessingJob } from './voiceApi';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { AlertCircle, CheckCircle2, Clock, Loader2, RotateCcw, Sparkles, Database } from 'lucide-react';

interface JobStatusCardProps {
  job: ProcessingJob;
  onRetried?: (newJob: ProcessingJob) => void;
}

export const JobStatusCard: React.FC<JobStatusCardProps> = ({ job, onRetried }) => {
  const [isRetrying, setIsRetrying] = React.useState(false);

  const handleRetry = async () => {
    try {
      setIsRetrying(true);
      const updated = await retryProcessingJob(job.id);
      if (onRetried) onRetried(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRetrying(false);
    }
  };

  const getStatusBadge = () => {
    switch (job.status) {
      case 'queued':
        return <Badge variant="warning">Queued</Badge>;
      case 'processing':
        return <Badge variant="info">Processing Pipeline</Badge>;
      case 'needs_review':
        return <Badge variant="brand">Needs Expert Review</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="neutral">{job.status}</Badge>;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            {job.status === 'processing' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : job.status === 'failed' ? (
              <AlertCircle className="w-5 h-5 text-rose-400" />
            ) : (
              <Sparkles className="w-5 h-5 text-brand-400" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              Voice Processing & Vector Indexing Pipeline
            </h4>
            <p className="text-xs text-slate-400 font-mono">Job ID: {job.id}</p>
          </div>
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-mono text-slate-400">
          <span>Pipeline Progress</span>
          <span>{job.progress || 0}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              job.status === 'failed'
                ? 'bg-rose-500'
                : job.status === 'needs_review'
                ? 'bg-brand-500'
                : 'bg-cyan-500'
            }`}
            style={{ width: `${Math.max(5, job.progress || 0)}%` }}
          />
        </div>
      </div>

      {/* Pipeline Milestones */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-300">
          <CheckCircle2 className={`w-3.5 h-3.5 ${(job.progress || 0) >= 30 ? 'text-emerald-400' : 'text-slate-600'}`} />
          <span>16kHz WAV Audio</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-300">
          <CheckCircle2 className={`w-3.5 h-3.5 ${(job.progress || 0) >= 60 ? 'text-emerald-400' : 'text-slate-600'}`} />
          <span>Whisper Segments</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-300">
          <Database className={`w-3.5 h-3.5 ${(job.progress || 0) >= 75 ? 'text-brand-400' : 'text-slate-600'}`} />
          <span>Vector RAG Indexing</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-300">
          <CheckCircle2 className={`w-3.5 h-3.5 ${(job.progress || 0) >= 90 ? 'text-emerald-400' : 'text-slate-600'}`} />
          <span>Safety Structuring</span>
        </div>
      </div>

      {/* Error State */}
      {job.status === 'failed' && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{job.error_safe || 'Transcription failed. Please check audio quality.'}</span>
          </div>
          {job.attempts < 3 && (
            <Button size="sm" variant="outline" onClick={handleRetry} isLoading={isRetrying}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Retry ({job.attempts}/3)
            </Button>
          )}
        </div>
      )}

      {/* Needs Review Guidance */}
      {job.status === 'needs_review' && (
        <div className="bg-brand-500/10 border border-brand-500/20 rounded-lg p-3 text-xs text-brand-300 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-400 shrink-0" />
          <span>
            Audio transcribed & vector-indexed. Human expert review is required before publishing or submission.
          </span>
        </div>
      )}
    </div>
  );
};
