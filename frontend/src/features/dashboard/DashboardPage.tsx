import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api/client';
import { HealthCheckResponse } from '../../types/api';
import { DashboardStats } from '../../types/dashboard';
import { WelcomeBanner } from './components/WelcomeBanner';
import { ContributionMetrics } from './components/ContributionMetrics';
import { ExpertiseJourney } from './components/ExpertiseJourney';
import { RecentActivityList } from './components/RecentActivityList';
import { QuickActionsGrid } from './components/QuickActionsGrid';
import { AdminDiagnosticsModal } from './components/AdminDiagnosticsModal';
import { Shield } from 'lucide-react';

import { EditorialHero } from './components/EditorialHero';
import { EditorialFeatureCards } from './components/EditorialFeatureCards';
import { EditorialKnowledgeStreams } from './components/EditorialKnowledgeStreams';

export const DashboardPage: React.FC = () => {
  const { user, permissions, hasPermission, hasRole } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdminDiagOpen, setIsAdminDiagOpen] = useState(false);

  const isAdmin = hasRole('ADMIN');
  const isExpert = hasRole('EXPERT') || isAdmin;

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Independent data fetching: dashboard stats is the primary payload
      const statsPromise = api.get<DashboardStats>('/dashboard/stats');

      // Health is fetched non-blocking for admins only
      const healthPromise = isAdmin
        ? api.get<HealthCheckResponse>('/health').catch(() => null)
        : Promise.resolve(null);

      const [statsData, healthData] = await Promise.all([statsPromise, healthPromise]);

      setStats(statsData);
      if (healthData) {
        setHealth(healthData);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load operational dashboard statistics.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div className="space-y-7 max-w-7xl mx-auto pb-8">
      {isExpert ? (
        <>
          {/* Stitch Editorial Hero Banner */}
          <EditorialHero
            user={user}
            stats={stats}
            loading={loading}
            hasPermission={hasPermission}
            hasRole={hasRole}
          />

          {/* Stitch 3 Floating Feature Cards */}
          <EditorialFeatureCards
            hasPermission={hasPermission}
            pendingReviewsCount={stats?.pending_reviews_for_user ?? 0}
          />

          {/* Authoritative Contribution Statistics (6 metrics) */}
          <ContributionMetrics
            stats={stats}
            loading={loading}
            hasRole={hasRole}
            hasPermission={hasPermission}
          />

          {/* Stitch 3-Column Knowledge Stream & Media Activity */}
          <EditorialKnowledgeStreams
            stats={stats}
            loading={loading}
            canCreateKnowledge={hasPermission('knowledge.create')}
          />

          {/* Quality & Governance Milestone Journey */}
          <ExpertiseJourney
            stats={stats}
            loading={loading}
            hasRole={hasRole}
          />
        </>
      ) : (
        <>
          {/* Trainee Welcome Banner */}
          <WelcomeBanner
            user={user}
            stats={stats}
            loading={loading}
            hasPermission={hasPermission}
            hasRole={hasRole}
          />

          {/* Trainee Diagnostic & Learning Metrics */}
          <ContributionMetrics
            stats={stats}
            loading={loading}
            hasRole={hasRole}
            hasPermission={hasPermission}
          />

          {/* Trainee Execution & Training Progress */}
          <ExpertiseJourney
            stats={stats}
            loading={loading}
            hasRole={hasRole}
          />

          {/* Trainee Recent Knowledge Stream */}
          <RecentActivityList
            items={stats?.recent_articles}
            loading={loading}
            error={error}
            onRetry={fetchDashboardData}
            canCreateKnowledge={hasPermission('knowledge.create')}
          />

          {/* Trainee Operational Quick Actions */}
          <QuickActionsGrid
            hasPermission={hasPermission}
            pendingReviewsCount={stats?.pending_reviews_for_user ?? 0}
          />
        </>
      )}

      {/* Admin Diagnostics Link (Restricted to System Administrators) */}
      {isAdmin && (
        <div className="pt-4 border-t border-[#E8EEF5] flex items-center justify-between text-xs text-[#7C8DA1]">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-[#1976D2]" />
            <span>Administrator tools:</span>
          </div>
          <button
            type="button"
            onClick={() => setIsAdminDiagOpen(true)}
            className="text-[#1976D2] hover:underline font-medium flex items-center gap-1 focus:outline-none focus:ring-1 focus:ring-[#1976D2] rounded px-1.5 py-0.5"
          >
            Open System Health & Diagnostic Telemetry
          </button>
        </div>
      )}

      {/* Preserved Admin Diagnostics Modal */}
      <AdminDiagnosticsModal
        isOpen={isAdminDiagOpen}
        onClose={() => setIsAdminDiagOpen(false)}
        health={health}
        stats={stats}
        permissions={permissions}
        roleId={user?.role_id}
      />
    </div>
  );
};
