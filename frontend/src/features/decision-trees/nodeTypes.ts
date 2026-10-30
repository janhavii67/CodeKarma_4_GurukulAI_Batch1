import { CheckCircle2, CircleHelp, Film, PlayCircle, ShieldAlert, Workflow, Wrench, type LucideIcon } from 'lucide-react';
import type { DecisionNodeType } from './types';

export interface NodeTypeConfig {
  type: DecisionNodeType;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Accent for labels, icon tiles, borders and the minimap. */
  accent: string;
  defaultTitle: string;
  /** Shown in "Add …" buttons. */
  addLabel: string;
}

export const PALETTE: NodeTypeConfig[] = [
  { type: 'question', label: 'Question', hint: 'Ask one observable thing; each answer branches', icon: CircleHelp, accent: '#60a5fa', defaultTitle: 'Is the symptom present?', addLabel: 'Add Question' },
  { type: 'action', label: 'Action', hint: 'An approved inspection or corrective step', icon: Wrench, accent: '#fbbf24', defaultTitle: 'Perform the approved inspection', addLabel: 'Add Action' },
  { type: 'safety', label: 'Safety', hint: 'Warnings, PPE and restricted operations', icon: ShieldAlert, accent: '#fb7185', defaultTitle: 'Isolate power before inspection', addLabel: 'Add Safety' },
  { type: 'media', label: 'Media', hint: 'Images, video, audio or documents to compare', icon: Film, accent: '#f472b6', defaultTitle: 'Compare with the reference', addLabel: 'Add Media' },
  { type: 'workflow', label: 'Guided Workflow', hint: 'Hand off to an approved Guided Workflow', icon: Workflow, accent: '#22d3ee', defaultTitle: 'Follow the approved workflow', addLabel: 'Connect Workflow' },
  { type: 'result', label: 'Result', hint: 'Possible causes and next actions', icon: CheckCircle2, accent: '#4ade80', defaultTitle: 'Likely cause identified', addLabel: 'Add Result' },
];

const START: NodeTypeConfig = { type: 'start', label: 'Start', hint: 'Where troubleshooting begins', icon: PlayCircle, accent: '#34d399', defaultTitle: 'Start', addLabel: 'Start' };

const LEGACY: Partial<Record<DecisionNodeType, NodeTypeConfig>> = {
  answer: { ...PALETTE[0], type: 'answer', label: 'Answer' },
  check: { ...PALETTE[1], type: 'check', label: 'Check' },
  end: { ...PALETTE[5], type: 'end', label: 'End' },
  stop: { ...PALETTE[2], type: 'stop', label: 'Stop' },
  escalation: { ...PALETTE[2], type: 'escalation', label: 'Escalate' },
};

export const nodeTypeConfig = (type: DecisionNodeType): NodeTypeConfig =>
  type === 'start' ? START : PALETTE.find((entry) => entry.type === type) || LEGACY[type] || PALETTE[0];

export const STEP_DESTINATIONS = PALETTE.map(({ type, label }) => ({ type, label }));
