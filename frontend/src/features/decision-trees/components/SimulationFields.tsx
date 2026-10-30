import React, { useEffect, useState } from 'react';
import type { DecisionEdge, DecisionNode, NodeDetails, NodeInput } from '../types';

/** Simulator outcome for an answer, stored as JSON in the edge's ``condition``. */
export interface EdgeSim {
  outcome?: 'correct' | 'reveal' | 'acceptable' | 'wrong' | 'unsafe';
  feedback?: string;
  clue?: string;
  zone?: string;
  reading?: { label?: string; value?: string; unit?: string; normal?: string };
}

export const ZONES = ['power', 'cooling', 'sensors', 'control', 'mechanical', 'output', 'software', 'general'] as const;
const OUTCOMES: Array<{ value: NonNullable<EdgeSim['outcome']> | ''; label: string }> = [
  { value: '', label: 'Not scored (always continues)' },
  { value: 'correct', label: 'Correct — the approved next step' },
  { value: 'reveal', label: 'Diagnostic check — reveals evidence' },
  { value: 'acceptable', label: 'Acceptable but inefficient' },
  { value: 'wrong', label: 'Wrong — feedback, stays on step' },
  { value: 'unsafe', label: 'Unsafe — safety violation' },
];

export function parseEdgeSim(condition?: string | null): EdgeSim {
  if (!condition) return {};
  try {
    const parsed = JSON.parse(condition);
    return parsed && typeof parsed === 'object' && parsed.sim && typeof parsed.sim === 'object' ? parsed.sim : {};
  } catch {
    return {};
  }
}

export const serializeEdgeSim = (sim: EdgeSim): string | null => {
  const clean = Object.fromEntries(Object.entries(sim).filter(([, value]) => value !== undefined && value !== '' && !(typeof value === 'object' && !Object.keys(value).length)));
  return Object.keys(clean).length ? JSON.stringify({ sim: clean }) : null;
};

const input = 'w-full rounded-lg border border-white/[0.08] bg-[#14171c] px-2.5 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none disabled:opacity-60';
const label = 'mb-1 block text-[10.5px] font-semibold text-slate-400';

const Commit: React.FC<{ value: string; placeholder?: string; disabled: boolean; ariaLabel: string; onCommit: (value: string) => void }> = ({ value, placeholder, disabled, ariaLabel, onCommit }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input aria-label={ariaLabel} value={draft} placeholder={placeholder} disabled={disabled} className={input}
      onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
};

const ReadingFields: React.FC<{ reading?: EdgeSim['reading']; disabled: boolean; prefix: string; onChange: (reading: EdgeSim['reading']) => void }> = ({ reading = {}, disabled, prefix, onChange }) => (
  <div>
    <span className={label}>Reading shown to the trainee (optional)</span>
    <div className="grid grid-cols-4 gap-1.5">
      {(['label', 'value', 'unit', 'normal'] as const).map((key) => (
        <Commit key={key} ariaLabel={`${prefix} reading ${key}`} value={reading[key] || ''} disabled={disabled}
          placeholder={{ label: 'Vibration', value: '7.2', unit: 'mm/s', normal: '< 4.5' }[key]}
          onCommit={(value) => onChange({ ...reading, [key]: value })} />
      ))}
    </div>
  </div>
);

/** Per-answer scenario outcome, shown inside each answer row. */
export const AnswerSimFields: React.FC<{ edge: DecisionEdge; disabled: boolean; onChange: (condition: string | null) => void }> = ({ edge, disabled, onChange }) => {
  const sim = parseEdgeSim(edge.condition);
  const update = (patch: Partial<EdgeSim>) => onChange(serializeEdgeSim({ ...sim, ...patch }));
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-400/15 bg-amber-500/[0.04] p-2">
      <label className="block">
        <span className={label}>Simulation outcome</span>
        <select aria-label={`Simulation outcome for ${edge.label}`} value={sim.outcome || ''} disabled={disabled} className={input}
          onChange={(e) => update({ outcome: (e.target.value || undefined) as EdgeSim['outcome'] })}>
          {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {sim.outcome && (
        <label className="block">
          <span className={label}>{sim.outcome === 'reveal' ? 'Note shown after the check' : 'Feedback explaining why'}</span>
          <Commit ariaLabel={`Feedback for ${edge.label}`} value={sim.feedback || ''} disabled={disabled} placeholder="Why this choice is right or wrong"
            onCommit={(feedback) => update({ feedback })} />
        </label>
      )}
      {sim.outcome === 'reveal' && (
        <>
          <label className="block">
            <span className={label}>Evidence discovered</span>
            <Commit ariaLabel={`Evidence for ${edge.label}`} value={sim.clue || ''} disabled={disabled} placeholder="e.g. Vibration above the reference range"
              onCommit={(clue) => update({ clue })} />
          </label>
          <ReadingFields prefix={edge.label} reading={sim.reading} disabled={disabled} onChange={(reading) => update({ reading })} />
        </>
      )}
      {sim.outcome && (
        <label className="block">
          <span className={label}>Machine zone</span>
          <select aria-label={`Zone for ${edge.label}`} value={sim.zone || ''} disabled={disabled} className={input} onChange={(e) => update({ zone: e.target.value || undefined })}>
            <option value="">No zone</option>
            {ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>
      )}
    </div>
  );
};

/** Step-level scenario data: what the trainee finds when they inspect this step. */
export const NodeSimFields: React.FC<{ node: DecisionNode; disabled: boolean; onUpdate: (patch: NodeInput) => void }> = ({ node, disabled, onUpdate }) => {
  const details: NodeDetails = node.details || {};
  const set = (patch: Partial<NodeDetails>) => onUpdate({ details: { ...details, ...patch } });
  const terminal = ['result', 'end', 'stop', 'escalation'].includes(node.node_type);
  return (
    <div className="space-y-2.5">
      {!terminal && !node.is_start && (
        <>
          <label className="block">
            <span className={label}>Evidence found when the trainee inspects this step</span>
            <Commit ariaLabel="Inspection evidence" value={details.sim_clue || ''} disabled={disabled} placeholder="Leave empty if this step reveals nothing"
              onCommit={(sim_clue) => set({ sim_clue })} />
          </label>
          <ReadingFields prefix="Step" reading={details.sim_reading} disabled={disabled} onChange={(sim_reading) => set({ sim_reading })} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={label}>Machine zone</span>
              <select aria-label="Step machine zone" value={details.sim_zone || ''} disabled={disabled} className={input} onChange={(e) => set({ sim_zone: e.target.value || undefined })}>
                <option value="">No zone</option>
                {ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </label>
            {node.node_type === 'question' && (
              <label className="block">
                <span className={label}>Checks required first</span>
                <input type="number" min={0} max={10} aria-label="Checks required before deciding" value={details.sim_min_checks ?? 0} disabled={disabled} className={input}
                  onChange={(e) => set({ sim_min_checks: Number(e.target.value) })} />
              </label>
            )}
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-300">
            <input type="checkbox" checked={Boolean(details.sim_critical)} disabled={disabled} onChange={(e) => set({ sim_critical: e.target.checked })} className="accent-amber-500" />
            Critical checkpoint (skipping it costs points)
          </label>
          <label className="block">
            <span className={label}>Smart hint (level 2)</span>
            <Commit ariaLabel="Smart hint" value={details.sim_hint || ''} disabled={disabled} placeholder="A nudge that doesn't give the answer away" onCommit={(sim_hint) => set({ sim_hint })} />
          </label>
        </>
      )}
      {terminal && (
        <label className="block">
          <span className={label}>Verification condition (machine restored when…)</span>
          <Commit ariaLabel="Verification condition" value={details.verification || ''} disabled={disabled} placeholder="e.g. Test scan runs with no vibration alarm"
            onCommit={(verification) => set({ verification })} />
        </label>
      )}
      <p className="text-[10.5px] leading-relaxed text-slate-500">Used only by the trainee simulator. Expert guidance (level 3) uses this step's “why this matters” text and the answer marked correct.</p>
    </div>
  );
};
