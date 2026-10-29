import type { ProcedureReference, ProcedureStep } from './types';

/** Content types a step can actually carry, derived only from its saved data. */
export type StepContentKind = 'image' | 'video' | 'audio' | 'document' | 'checklist' | 'safety';

export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function stepAssetIds(step: ProcedureStep): string[] {
  return stringList(step.details?.asset_ids);
}

/** Procedure authoring saves `notes`; knowledge-derived steps carry `note`. */
export function stepNote(step: ProcedureStep): string | null {
  return text(step.details?.notes) ?? text(step.details?.note);
}

export function stepChecklist(step: ProcedureStep): string[] {
  return stringList(step.details?.quality_checkpoints);
}

export function stepTools(step: ProcedureStep): string[] {
  return Array.from(new Set([...stringList(step.details?.tools), ...stringList(step.details?.materials)]));
}

export function stepStopCondition(step: ProcedureStep): string | null {
  return text(step.details?.stop_condition);
}

export function stepNeedsReview(step: ProcedureStep): boolean {
  return step.details?.needs_review === true;
}

export function requiresVerification(step: ProcedureStep): boolean {
  return Boolean(step.is_critical || step.expected_observation || step.safety_warning);
}

const MEDIA_ORDER = ['image', 'video', 'audio', 'document'] as const;

export function stepContentKinds(step: ProcedureStep, stepReferences: ProcedureReference[]): StepContentKind[] {
  const kinds: StepContentKind[] = [];
  if (step.safety_warning || stepStopCondition(step)) kinds.push('safety');
  MEDIA_ORDER.forEach((kind) => {
    if (stepReferences.some((asset) => asset.kind === kind)) kinds.push(kind);
  });
  if (stepChecklist(step).length) kinds.push('checklist');
  return kinds;
}

export const CONTENT_KIND_LABELS: Record<StepContentKind, string> = {
  image: 'images',
  video: 'video',
  audio: 'audio',
  document: 'documents',
  checklist: 'checklist',
  safety: 'safety notes',
};
