import { useState, useEffect } from 'react';
import { getProcessingJob, ProcessingJob } from './voiceApi';

export function useJobPolling(jobId: string | null, onCompleted?: (job: ProcessingJob) => void) {
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    let isMounted = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        setIsLoading(true);
        const data = await getProcessingJob(jobId);
        if (!isMounted) return;

        setJob(data);
        setError(null);

        // Check if finished
        if (data.status === 'completed' || data.status === 'needs_review') {
          setIsLoading(false);
          if (onCompleted) {
            onCompleted(data);
          }
          return;
        }

        if (data.status === 'failed' || data.status === 'cancelled') {
          setIsLoading(false);
          return;
        }

        // Continue polling every 2 seconds
        timer = setTimeout(poll, 2000);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Failed to poll job status');
        setIsLoading(false);
      }
    };

    poll();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return { job, isLoading, error, refetch: () => jobId && getProcessingJob(jobId).then(setJob) };
}
