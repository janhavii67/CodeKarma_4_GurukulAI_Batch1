import React from 'react';
import { motion } from 'framer-motion';
import { Check, CircleDot, GitBranch, Lock } from 'lucide-react';
import type { MissionAttempt } from '../types';

/** Horizontal journey: completed stages, the current stage, open/locked branches and the resolution stages. */
export const InvestigationMap: React.FC<{ map: MissionAttempt['map']; reducedMotion: boolean }> = ({ map, reducedMotion }) => (
  <nav aria-label="Investigation map" className="overflow-x-auto">
    <ol className="flex min-w-max items-center gap-1.5 py-1">
      {map.stages.map((stage, index) => (
        <React.Fragment key={`${stage.node_id}-${index}`}>
          {index > 0 && <li aria-hidden="true" className="h-px w-5 bg-white/15" />}
          <li className={`flex max-w-[180px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
            stage.status === 'current' ? 'border-amber-400/60 bg-amber-500/10 text-amber-100' : 'border-white/[0.07] bg-white/[0.03] text-slate-400'}`}
            aria-current={stage.status === 'current' ? 'step' : undefined}>
            {stage.status === 'current'
              ? <motion.span animate={reducedMotion ? undefined : { scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}><CircleDot className="h-3.5 w-3.5 text-amber-400" /></motion.span>
              : <Check className="h-3.5 w-3.5 text-emerald-400" />}
            <span className="min-w-0">
              <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-500">{stage.label}</span>
              <span className="block truncate">{stage.title}</span>
            </span>
          </li>
        </React.Fragment>
      ))}
      {map.branches.length > 0 && (
        <>
          <li aria-hidden="true" className="h-px w-5 bg-white/15" />
          <li className="flex items-center gap-1.5" aria-label="Paths from here">
            <GitBranch className="h-3.5 w-3.5 text-slate-500" />
            {map.branches.map((branch) => (
              <span key={branch.label} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] ${branch.locked ? 'border-rose-400/20 text-rose-300/70 line-through' : 'border-dashed border-white/15 text-slate-400'}`}>
                {branch.locked && <Lock className="h-3 w-3" />}{branch.label}
              </span>
            ))}
          </li>
        </>
      )}
      {map.resolution.map((stage) => (
        <React.Fragment key={stage.key}>
          <li aria-hidden="true" className="h-px w-5 bg-white/15" />
          <li className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
            stage.status === 'done' ? 'border-emerald-400/30 text-emerald-300' : stage.status === 'current' ? 'border-amber-400/60 bg-amber-500/10 text-amber-100' : 'border-white/[0.06] text-slate-600'}`}>
            {stage.status === 'done' ? <Check className="h-3.5 w-3.5" /> : stage.status === 'locked' ? <Lock className="h-3 w-3" /> : <CircleDot className="h-3.5 w-3.5" />}{stage.label}
          </li>
        </React.Fragment>
      ))}
    </ol>
  </nav>
);
