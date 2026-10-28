export interface RecentActivityItem {
  id: string;
  title: string;
  category: string;
  status: string;
  author_name: string;
  created_at: string;
  machine_name?: string | null;
  version_no?: number;
}

export interface DashboardStats {
  total_machines: number;
  approved_articles: number;
  procedures_count: number;
  pending_reviews: number;
  audio_references: number;
  active_simulations: number;
  recent_articles: RecentActivityItem[];
  user_sops_created: number;
  user_sops_approved: number;
  user_sops_pending: number;
  user_sops_draft: number;
  user_revisions_count: number;
  user_machines_contributed: number;
  user_captured_duration_seconds: number;
  pending_reviews_for_user: number;
  user_reviews_completed: number;
  user_procedures_completed: number;
  latest_draft_id?: string | null;
  latest_draft_title?: string | null;
}
