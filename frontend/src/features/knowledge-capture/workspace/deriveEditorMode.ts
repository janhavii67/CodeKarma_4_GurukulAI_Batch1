import type { VersionStatus } from '../types';

/** Possible modes for the knowledge editor workspace */
export type EditorMode = 'editable' | 'frozen' | 'trainee';

/** Reason the version is frozen (only set when mode === 'frozen') */
export type FrozenReason =
  | 'in_review'
  | 'published'
  | 'approved'
  | 'superseded'
  | 'rejected'
  | 'withdrawn'
  | 'not_author'
  | 'no_permission';

export interface EditorModeResult {
  mode: EditorMode;
  frozenReason?: FrozenReason;
  /** Human-readable explanation for frozen state */
  frozenMessage?: string;
}

const EDITABLE_STATUSES: VersionStatus[] = ['draft', 'changes_requested'];

const FROZEN_REASONS: Partial<Record<VersionStatus, { reason: FrozenReason; message: string }>> = {
  in_review: {
    reason: 'in_review',
    message: 'This version is under review and cannot be edited.',
  },
  published: {
    reason: 'published',
    message: 'This version is published and cannot be edited. Create a new revision to make changes.',
  },
  approved: {
    reason: 'approved',
    message: 'This version is approved and cannot be edited.',
  },
  superseded: {
    reason: 'superseded',
    message: 'This version is superseded and cannot be edited.',
  },
  rejected: {
    reason: 'rejected',
    message: 'This version was rejected and cannot be edited.',
  },
  withdrawn: {
    reason: 'withdrawn',
    message: 'This version has been withdrawn and cannot be edited.',
  },
};

/**
 * Pure function: determines the editor mode from user context and version data.
 *
 * Rules (in priority order):
 * 1. Trainee role (no knowledge.create) → 'trainee'
 * 2. Status not editable → 'frozen' with status-based reason
 * 3. User is not the version's author → 'frozen' with 'not_author'
 * 4. User lacks knowledge.create → 'frozen' with 'no_permission'
 * 5. Otherwise → 'editable'
 *
 * The backend enforces these same rules (403 / 409). This function mirrors
 * them for usability only. Never rely on this for security.
 */
export function deriveEditorMode({
  versionStatus,
  versionCreatedBy,
  userId,
  hasKnowledgeCreate,
  isTrainee,
}: {
  versionStatus: VersionStatus | undefined;
  versionCreatedBy: string | undefined;
  userId: string | undefined;
  hasKnowledgeCreate: boolean;
  /** True when user's role is TRAINEE (no create permission) */
  isTrainee: boolean;
}): EditorModeResult {
  // No version loaded yet — default to read-only frozen
  if (!versionStatus) {
    return { mode: 'frozen', frozenReason: 'no_permission', frozenMessage: 'Version not loaded.' };
  }

  // 1. Trainee
  if (isTrainee || !hasKnowledgeCreate) {
    return { mode: 'trainee' };
  }

  // 2. Status frozen
  const frozenInfo = FROZEN_REASONS[versionStatus];
  if (!EDITABLE_STATUSES.includes(versionStatus)) {
    if (frozenInfo) {
      return {
        mode: 'frozen',
        frozenReason: frozenInfo.reason,
        frozenMessage: frozenInfo.message,
      };
    }
    return {
      mode: 'frozen',
      frozenReason: 'published',
      frozenMessage: `This version (${versionStatus}) cannot be edited.`,
    };
  }

  // 3. Not the author
  if (userId && versionCreatedBy && userId !== versionCreatedBy) {
    return {
      mode: 'frozen',
      frozenReason: 'not_author',
      frozenMessage: 'This draft was created by another expert. You can view it but not edit it.',
    };
  }

  // 4. Lacks permission (belt-and-suspenders)
  if (!hasKnowledgeCreate) {
    return {
      mode: 'frozen',
      frozenReason: 'no_permission',
      frozenMessage: 'You do not have permission to edit knowledge items.',
    };
  }

  // 5. Editable
  return { mode: 'editable' };
}
