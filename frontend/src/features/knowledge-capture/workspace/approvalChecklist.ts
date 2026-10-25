import type { Step } from '../types';

/** A single advisory checklist row */
export interface ChecklistRow {
  id: string;
  label: string;
  passed: boolean;
  /** If true, this row is locked pending external workflow (review/approval) */
  locked: boolean;
  lockedExplanation?: string;
}

/**
 * Computes the advisory approval checklist client-side.
 *
 * These checks MIRROR the backend's validate_for_submission rules and are
 * advisory only — the backend remains authoritative. No submission is
 * triggered based on these values.
 *
 * Locked rows ("Submitted for review", "Approved by an authorized reviewer")
 * are always shown but always locked until the review workflow is enabled.
 */
export function computeApprovalChecklist({
  title,
  steps,
}: {
  title: string;
  steps: Step[];
}): ChecklistRow[] {
  const hasAtLeastOneStep = steps.length > 0;
  const allStepsComplete = steps.every(
    (s) => s.title.trim().length > 0 && s.instruction.trim().length > 0
  );
  const titleSet = title.trim().length > 0;

  return [
    {
      id: 'has-steps',
      label: 'Procedure has at least one step',
      passed: hasAtLeastOneStep,
      locked: false,
    },
    {
      id: 'steps-complete',
      label: 'Every step has a title and instruction',
      passed: allStepsComplete,
      locked: false,
    },
    {
      id: 'title-set',
      label: 'Title is set',
      passed: titleSet,
      locked: false,
    },
    {
      id: 'submitted',
      label: 'Submitted for review',
      passed: false,
      locked: true,
      lockedExplanation: 'Review and approval unlock when the review workflow is enabled.',
    },
    {
      id: 'approved',
      label: 'Approved by an authorized reviewer',
      passed: false,
      locked: true,
      lockedExplanation: 'Review and approval unlock when the review workflow is enabled.',
    },
  ];
}
