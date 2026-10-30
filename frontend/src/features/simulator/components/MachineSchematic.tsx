import React from 'react';
import { motion } from 'framer-motion';
import { getApiUrl } from '../../../lib/api/client';
import type { MediaRef } from '../../decision-trees/types';
import { ZONE_META } from '../ui';

const POSITIONS: Record<string, { x: number; y: number }> = {
  power: { x: 14, y: 20 }, software: { x: 50, y: 10 }, cooling: { x: 86, y: 20 },
  sensors: { x: 10, y: 54 }, control: { x: 90, y: 54 },
  mechanical: { x: 16, y: 86 }, general: { x: 50, y: 92 }, output: { x: 84, y: 86 },
};

interface MachineSchematicProps {
  machineName?: string | null;
  cover?: MediaRef | null;
  /** Zones this mission authored content for. */
  zones: string[];
  /** Zones with diagnostic checks still available at the current step. */
  activeZones: Set<string>;
  /** Evidence count per zone. */
  findings: Record<string, number>;
  currentZone?: string | null;
  selectedZone: string | null;
  status: 'ok' | 'warning';
  reducedMotion: boolean;
  onSelect: (zone: string | null) => void;
}

/**
 * Machine overview with the diagnostic zones the expert's scenario uses. Zones are a labelled
 * schematic over the machine photo — every hotspot filters real, authored actions and findings.
 */
export const MachineSchematic: React.FC<MachineSchematicProps> = ({
  machineName, cover, zones, activeZones, findings, currentZone, selectedZone, status, reducedMotion, onSelect,
}) => {
  const shown = Array.from(new Set([...zones, ...(currentZone ? [currentZone] : [])])).filter((zone) => POSITIONS[zone]);
  return (
    <section aria-label="Machine inspection" className="relative h-[300px] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#121418] sm:h-[340px]">
      {cover
        ? <img src={getApiUrl(`${cover.url}?inline=true`)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 saturate-50" />
        : null}
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#0f1114_85%)]" />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {shown.map((zone) => {
          const p = POSITIONS[zone];
          const highlighted = selectedZone === zone || currentZone === zone;
          return <line key={zone} x1={p.x} y1={p.y} x2={50} y2={52} stroke={highlighted ? 'rgba(245,158,11,0.7)' : 'rgba(148,163,184,0.18)'} strokeWidth={highlighted ? 0.5 : 0.3} strokeDasharray={highlighted ? '0' : '1 1.2'} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>

      <div className="absolute left-1/2 top-[52%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <div className={`flex h-24 w-40 items-center justify-center rounded-2xl border bg-[#171a1f]/90 px-3 text-center backdrop-blur sm:h-28 sm:w-52 ${status === 'warning' ? 'border-rose-400/50 shadow-[0_0_40px_-10px_rgba(244,63,94,0.6)]' : 'border-amber-400/30 shadow-[0_0_50px_-18px_rgba(245,158,11,0.6)]'}`}>
          <span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Unit under test</span>
            <span className="mt-1 block text-sm font-bold text-white">{machineName || 'Machine'}</span>
            <span className={`mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase ${status === 'warning' ? 'text-rose-300' : 'text-amber-300'}`}>
              <motion.span className={`h-1.5 w-1.5 rounded-full ${status === 'warning' ? 'bg-rose-400' : 'bg-amber-400'}`}
                animate={reducedMotion ? undefined : { opacity: [1, 0.25, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} />
              {status === 'warning' ? 'Safety alert' : 'Fault reported'}
            </span>
          </span>
        </div>
      </div>

      {shown.map((zone) => {
        const meta = ZONE_META[zone] || ZONE_META.general;
        const Icon = meta.icon;
        const p = POSITIONS[zone];
        const active = activeZones.has(zone);
        const found = findings[zone] || 0;
        const selected = selectedZone === zone;
        return (
          <button key={zone} type="button" onClick={() => onSelect(selected ? null : zone)} aria-pressed={selected}
            aria-label={`${meta.label}${active ? ', checks available' : ''}${found ? `, ${found} finding${found === 1 ? '' : 's'}` : ''}`}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs font-semibold backdrop-blur transition ${
              selected ? 'border-amber-400 bg-amber-500/20 text-amber-100' : active ? 'border-amber-400/40 bg-[#171a1f]/90 text-slate-100 hover:border-amber-400' : 'border-white/10 bg-[#171a1f]/80 text-slate-400 hover:text-slate-200'}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <span className="relative">
              <Icon className={`h-4 w-4 ${active || selected ? 'text-amber-300' : ''}`} />
              {active && !reducedMotion && <span className="absolute -inset-1 animate-ping rounded-full border border-amber-400/50" />}
            </span>
            <span className="hidden sm:inline">{meta.label}</span>
            {found > 0 && <span className="rounded bg-emerald-500/20 px-1 font-mono text-[10px] text-emerald-300">{found}</span>}
          </button>
        );
      })}
      {shown.length === 0 && (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center text-xs text-slate-500">This scenario's checks are listed in the action panel.</p>
      )}
    </section>
  );
};
