import { Activity, Cpu, Gauge, Monitor, Settings2, Snowflake, Wrench, Zap, type LucideIcon } from 'lucide-react';
import type { MissionDifficulty } from './types';

export const DIFFICULTY: Record<MissionDifficulty, { label: string; className: string; bars: number }> = {
  BEGINNER: { label: 'Beginner', className: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10', bars: 1 },
  INTERMEDIATE: { label: 'Intermediate', className: 'text-sky-300 border-sky-400/30 bg-sky-400/10', bars: 2 },
  ADVANCED: { label: 'Advanced', className: 'text-amber-300 border-amber-400/30 bg-amber-400/10', bars: 3 },
  EXPERT: { label: 'Expert', className: 'text-rose-300 border-rose-400/30 bg-rose-400/10', bars: 4 },
};

export const ZONE_META: Record<string, { label: string; icon: LucideIcon }> = {
  power: { label: 'Power system', icon: Zap },
  cooling: { label: 'Cooling system', icon: Snowflake },
  sensors: { label: 'Sensors', icon: Gauge },
  control: { label: 'Control panel', icon: Monitor },
  mechanical: { label: 'Mechanical', icon: Wrench },
  output: { label: 'Imaging / output', icon: Activity },
  software: { label: 'Software', icon: Cpu },
  general: { label: 'General', icon: Settings2 },
};

export const zoneLabel = (zone?: string | null) => (zone ? ZONE_META[zone]?.label || zone : 'General');

export const formatClock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export const pretty = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Charcoal mission-control surfaces shared by every simulator screen. */
export const surface = {
  page: 'bg-[#0f1114] text-slate-100',
  panel: 'rounded-2xl border border-white/[0.07] bg-[#171a1f]',
  inset: 'rounded-xl border border-white/[0.06] bg-[#121418]',
  label: 'text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-500',
  amberButton: 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-[#1a1206] shadow-[0_10px_30px_-12px_rgba(245,158,11,0.7)] transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50',
  ghostButton: 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40',
};
