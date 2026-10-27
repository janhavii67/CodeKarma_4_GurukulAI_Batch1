import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { RecentActivityItem } from '../../../types/dashboard';
import {
  FileText,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileEdit,
  XCircle,
  Plus,
  RotateCcw,
} from 'lucide-react';

interface RecentActivityListProps {
  items: RecentActivityItem[] | undefined;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  canCreateKnowledge?: boolean;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 45) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

function getStatusBadgeConfig(status: string) {
  const norm = (status || '').toLowerCase();
  switch (norm) {
    case 'approved':
    case 'published':
      return {
        variant: 'success' as const,
        icon: <CheckCircle2 className="w-3 h-3 text-[#15966A]" />,
        label: 'Approved',
      };
    case 'pending_review':
    case 'in_review':
      return {
        variant: 'warning' as const,
        icon: <Clock className="w-3 h-3 text-[#D98B13]" />,
        label: 'In Review',
      };
    case 'changes_requested':
      return {
        variant: 'warning' as const,
        icon: <AlertTriangle className="w-3 h-3 text-[#D98B13]" />,
        label: 'Changes Requested',
      };
    case 'rejected':
      return {
        variant: 'danger' as const,
        icon: <XCircle className="w-3 h-3 text-[#D94848]" />,
        label: 'Rejected',
      };
    case 'draft':
    default:
      return {
        variant: 'neutral' as const,
        icon: <FileEdit className="w-3 h-3 text-[#5D7188]" />,
        label: 'Draft',
      };
  }
}

export const RecentActivityList: React.FC<RecentActivityListProps> = ({
  items,
  loading,
  error,
  onRetry,
  canCreateKnowledge,
}) => {
  return (
    <Card
      title="Recent Knowledge Stream"
      subtitle="Latest technical procedures, revisions, and peer review submissions"
      header={
        <div className="px-5 py-4 border-b border-[#E8EEF5] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#17324D] tracking-tight">
              Recent Knowledge Stream
            </h2>
            <p className="text-xs text-[#5D7188] mt-0.5">
              Authoritative procedures, revisions, and expert submissions
            </p>
          </div>
          <Link to="/app/knowledge">
            <Button variant="ghost" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
              View Library
            </Button>
          </Link>
        </div>
      }
    >
      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-3" role="status" aria-label="Loading recent knowledge activity">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E8EEF5] flex items-center justify-between animate-pulse"
            >
              <div className="space-y-2 flex-1 max-w-lg">
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
              <div className="w-16 h-8 bg-slate-200 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Error State with Retry */}
      {!loading && error && (
        <div className="p-6 text-center space-y-3" role="alert">
          <p className="text-xs text-[#D94848] font-medium">{error}</p>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Populated List */}
      {!loading && !error && items && items.length > 0 && (
        <ul className="space-y-2.5 divide-y divide-transparent" aria-label="Recent procedures">
          {items.map((item) => {
            const statusConfig = getStatusBadgeConfig(item.status);
            const exactTime = new Date(item.created_at).toLocaleString();

            return (
              <li
                key={item.id}
                className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white hover:border-[#1976D2]/40 hover:shadow-xs transition-all duration-150"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#17324D] truncate max-w-md">
                      {item.title}
                    </span>

                    <Badge variant={statusConfig.variant} size="sm" className="font-semibold gap-1">
                      {statusConfig.icon}
                      {statusConfig.label}
                    </Badge>

                    {item.version_no && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-[#5D7188] border border-[#DCE6F0]">
                        v{item.version_no}
                      </span>
                    )}

                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white text-[#5D7188] border border-[#DCE6F0]">
                      {item.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[#5D7188] flex-wrap">
                    <span className="font-medium text-[#17324D]">{item.author_name}</span>

                    {item.machine_name && (
                      <>
                        <span className="text-[#CBD5E1]">·</span>
                        <span className="text-[#1976D2] font-medium bg-[#EAF3FF] px-1.5 py-0.2 rounded text-[11px]">
                          {item.machine_name}
                        </span>
                      </>
                    )}

                    <span className="text-[#CBD5E1]">·</span>
                    <span
                      title={exactTime}
                      className="cursor-help flex items-center gap-1 text-[#7C8DA1]"
                    >
                      <Clock className="w-3 h-3 text-[#7C8DA1]" />
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 self-end sm:self-center">
                  <Link to={`/app/knowledge/${item.id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<ArrowRight className="w-3.5 h-3.5 text-[#1976D2]" />}
                      className="font-medium text-xs hover:border-[#1976D2]"
                    >
                      Open SOP
                    </Button>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Empty State */}
      {!loading && !error && (!items || items.length === 0) && (
        <EmptyState
          icon={<FileText className="w-6 h-6 text-[#1976D2]" />}
          title="No Knowledge Entries Recorded"
          description="Standard Operating Procedures will appear here once authored or synchronized with the verified database."
          action={
            canCreateKnowledge ? (
              <Link to="/app/knowledge/new">
                <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />}>
                  Capture First SOP
                </Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </Card>
  );
};
