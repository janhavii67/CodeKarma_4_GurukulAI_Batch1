import React from 'react';
import type { VersionStatus } from './types';
import { Badge } from '../../components/ui/Badge';

interface StatusBadgeProps {
  status: VersionStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  VersionStatus,
  { label: string; variant: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'; dot?: boolean }
> = {
  draft: { label: 'Draft', variant: 'neutral', dot: true },
  in_review: { label: 'In Review', variant: 'info', dot: true },
  changes_requested: { label: 'Changes Requested', variant: 'warning', dot: true },
  rejected: { label: 'Rejected', variant: 'danger' },
  approved: { label: 'Approved', variant: 'success' },
  published: { label: 'Published', variant: 'brand', dot: true },
  superseded: { label: 'Superseded', variant: 'neutral' },
  withdrawn: { label: 'Withdrawn', variant: 'danger' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' };
  return (
    <Badge variant={cfg.variant} dot={cfg.dot} className={className}>
      {cfg.label}
    </Badge>
  );
};
