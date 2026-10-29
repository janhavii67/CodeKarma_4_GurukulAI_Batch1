import React from 'react';
import {
  AlertTriangle,
  Info,
  Cpu,
} from 'lucide-react';
import type { KnowledgeItemDetail, Step } from '../types';
import type { Machine } from '../types';
import type { EditorMode } from './deriveEditorMode';
import { useMachines } from '../hooks';
import { selectableMachines } from '../../machines/registeredMachines';

// ─── Styling constants ────────────────────────────────────────────────────────

const INPUT_BASE =
  'w-full bg-[#0B1325] border border-[#22304D] rounded-lg px-3 py-2.5 text-sm text-[#E8EEFA] placeholder-[#8FA0BF] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors';

const INPUT_FROZEN =
  'w-full bg-slate-800/30 border border-slate-700/30 rounded-lg px-3 py-2.5 text-sm text-slate-300 cursor-not-allowed';

const TA_BASE =
  'w-full bg-[#0B1325] border border-[#22304D] rounded-lg px-3 py-2.5 text-sm text-[#E8EEFA] placeholder-[#8FA0BF] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors';

const LABEL_BASE =
  'block text-[11px] font-semibold uppercase tracking-wider text-[#A3B1CC] mb-1.5';

const Label: React.FC<{
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
}> = ({ htmlFor, children, required }) => (
  <label htmlFor={htmlFor} className={LABEL_BASE}>
    {children}
    {required && <span className="ml-0.5 text-rose-400" aria-hidden>*</span>}
  </label>
);

/** Fields without backend support — shown as disabled with ◇ marker */
const UnsupportedField: React.FC<{ label: string; placeholder?: string }> = ({
  label,
  placeholder,
}) => (
  <div>
    <label className={`${LABEL_BASE} flex items-center gap-1`}>
      <span className="text-slate-500">◇</span>
      {label}
    </label>
    <div className={INPUT_FROZEN}>
      <span className="text-slate-500 text-xs italic">
        {placeholder ?? 'Not saved yet (needs backend support)'}
      </span>
    </div>
  </div>
);

// ─── Machine selector ─────────────────────────────────────────────────────────

const MachineSelector: React.FC<{
  currentMachineId: string | null;
  currentMachine: Machine | null;
  isEditable: boolean;
  onChange: (machineId: string | null) => void;
}> = ({ currentMachineId, currentMachine, isEditable, onChange }) => {
  const { data: machinesData, isLoading } = useMachines();
  const machines = selectableMachines(machinesData?.items ?? []);

  if (!isEditable) {
    return (
      <div>
        <Label htmlFor="machine-display">Machine / Asset</Label>
        <div className={INPUT_FROZEN}>
          {currentMachine
            ? `${currentMachine.name} (${currentMachine.code})`
            : 'No machine linked'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor="machine-select">Machine / Asset</Label>
      <div className="relative">
        <select
          id="machine-select"
          value={currentMachineId ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={INPUT_BASE}
          disabled={isLoading}
        >
          <option value="">No machine</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.code})
            </option>
          ))}
        </select>
        <Cpu className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
      </div>
      <p className="mt-1 text-[11px] text-[#8FA0BF]">
        Machine linkage may be constrained after creation. The backend will reject
        changes that are not permitted.
      </p>
    </div>
  );
};

// ─── Summary strip ────────────────────────────────────────────────────────────

const SummaryStrip: React.FC<{
  versionNo: number;
  versionStatus: string;
  machineName: string | null;
  audioCt: number;
  videoCt: number;
  imageCt: number;
  documentCt: number;
  stepCt: number;
  isDemo: boolean;
  isLoaded: boolean;
}> = ({
  versionNo,
  versionStatus,
  machineName,
  audioCt,
  videoCt,
  imageCt,
  documentCt,
  stepCt,
  isDemo,
  isLoaded,
}) => {
  if (!isLoaded) return null;

  const parts: string[] = [
    `${versionStatus.charAt(0).toUpperCase() + versionStatus.slice(1)} v${versionNo}`,
  ];
  if (machineName) parts.push(machineName);
  if (audioCt > 0) parts.push(`${audioCt} audio`);
  if (videoCt > 0) parts.push(`${videoCt} video`);
  if (imageCt > 0) parts.push(`${imageCt} image`);
  if (documentCt > 0) parts.push(`${documentCt} document`);
  parts.push(`${stepCt} step${stepCt !== 1 ? 's' : ''}`);

  return (
    <div className="flex items-center gap-3 flex-wrap text-xs text-[#A3B1CC] border-b border-[#22304D] pb-4 mb-4">
      <span>{parts.join(' · ')}</span>
      {isDemo && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 border border-sky-500/30 rounded-full px-2 py-0.5">
          Demonstration data
        </span>
      )}
    </div>
  );
};

// ─── Overview Tab ─────────────────────────────────────────────────────────────

export interface OverviewTabProps {
  data: KnowledgeItemDetail;
  mode: EditorMode;
  localTitle: string;
  localSummary: string;
  localDescription: string;
  localMachineId: string | null;
  titleError: string | null;
  steps: Step[];
  /** Counts per kind from real data */
  audioCt: number;
  videoCt: number;
  imageCt: number;
  documentCt: number;
  mediaLoaded: boolean;
  onTitleChange: (val: string) => void;
  onSummaryChange: (val: string) => void;
  onDescriptionChange: (val: string) => void;
  onMachineChange: (val: string | null) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  data,
  mode,
  localTitle,
  localSummary,
  localDescription,
  localMachineId,
  titleError,
  steps,
  audioCt,
  videoCt,
  imageCt,
  documentCt,
  mediaLoaded,
  onTitleChange,
  onSummaryChange,
  onDescriptionChange,
  onMachineChange,
}) => {
  const v = data.version;
  const isEditable = mode === 'editable';

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  return (
    <div
      id="tabpanel-overview"
      role="tabpanel"
      aria-labelledby="tab-overview"
      className="space-y-6"
    >
      {/* Summary strip */}
      <SummaryStrip
        versionNo={v.version_no}
        versionStatus={v.status}
        machineName={data.machine?.name ?? null}
        audioCt={audioCt}
        videoCt={videoCt}
        imageCt={imageCt}
        documentCt={documentCt}
        stepCt={steps.length}
        isDemo={data.is_demo}
        isLoaded={mediaLoaded}
      />

      {/* Record information card */}
      <div className="rounded-2xl bg-[#111A2E] border border-[#22304D] p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#A3B1CC]">
            Record Information
          </h2>
          {/* ◇ legend — only when there are unsupported fields shown */}
          <p className="text-[10px] text-slate-500 flex items-center gap-1">
            <span className="text-slate-500">◇</span>
            Saved on this device until the server supports the field
          </p>
        </div>

        {/* Title */}
        <div>
          <Label htmlFor="item-title" required>
            Knowledge title
          </Label>
          {isEditable ? (
            <div>
              <input
                id="item-title"
                type="text"
                value={localTitle}
                onChange={(e) => onTitleChange(e.target.value)}
                maxLength={255}
                aria-required="true"
                aria-invalid={!!titleError}
                aria-describedby={titleError ? 'title-error' : undefined}
                className={`${INPUT_BASE} ${titleError ? 'border-rose-500 focus:ring-rose-500 focus:border-rose-500' : ''}`}
                placeholder="Knowledge item title"
              />
              {titleError && (
                <p id="title-error" className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {titleError}
                </p>
              )}
            </div>
          ) : (
            <div className={INPUT_FROZEN}>{data.title}</div>
          )}
        </div>

        {/* Short description (= summary) */}
        <div>
          <Label htmlFor="version-summary">Short description</Label>
          {isEditable ? (
            <textarea
              id="version-summary"
              value={localSummary}
              onChange={(e) => onSummaryChange(e.target.value)}
              placeholder="Brief summary of this procedure…"
              maxLength={10000}
              rows={3}
              className={TA_BASE}
              aria-label="Short description (summary)"
            />
          ) : (
            <p className="text-sm text-slate-300 whitespace-pre-wrap">
              {v.summary || (
                <span className="text-slate-500 italic">No summary provided.</span>
              )}
            </p>
          )}
        </div>

        {/* Full description */}
        <div>
          <Label htmlFor="version-description">Full description</Label>
          {isEditable ? (
            <textarea
              id="version-description"
              value={localDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Full procedure description, context, prerequisites…"
              maxLength={10000}
              rows={5}
              className={TA_BASE}
              aria-label="Full description"
            />
          ) : (
            <p className="text-sm text-slate-300 whitespace-pre-wrap">
              {v.description || (
                <span className="text-slate-500 italic">No description provided.</span>
              )}
            </p>
          )}
        </div>

        {/* Two-column grid: Machine Type ◇ + Machine/asset */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Machine Type — no backend support */}
          <UnsupportedField label="Machine type" />

          {/* Machine / asset — real field */}
          <MachineSelector
            currentMachineId={localMachineId}
            currentMachine={data.machine}
            isEditable={isEditable}
            onChange={onMachineChange}
          />
        </div>

        {/* Manufacturer and model ◇ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UnsupportedField
            label="Manufacturer and model"
            placeholder="e.g. manufacturer, model number"
          />
          {/* Department ◇ */}
          <UnsupportedField
            label="Department / production area"
            placeholder="e.g. Machining cell 2"
          />
        </div>

        {/* Knowledge category ◇ */}
        <UnsupportedField
          label="Knowledge category"
          placeholder="e.g. Setup, Operation, Maintenance…"
        />

        {/* Expert / Author (read-only) */}
        <div>
          <Label>Expert / author</Label>
          <div className={INPUT_FROZEN}>
            {/* Display user name if available — currently only ID is in version */}
            {v.created_by ? (
              <span className="font-mono text-xs text-slate-400">{v.created_by}</span>
            ) : (
              <span className="text-slate-500 italic">Unknown</span>
            )}
          </div>
        </div>

        {/* Status and version (read-only) */}
        <div>
          <Label>Status and version</Label>
          <div className={INPUT_FROZEN}>
            <span className="capitalize">{v.status.replace(/_/g, ' ')}</span>
            {' · '}
            v{v.version_no}
            {' · '}
            <span className="capitalize">{v.origin.replace(/_/g, ' ')} origin</span>
            {v.updated_at && ` · Updated ${formatDate(v.updated_at)}`}
          </div>
        </div>

        {/* Process conditions ◇ */}
        <UnsupportedField
          label="Applicable machine or process conditions"
          placeholder="When does this knowledge apply? Describe machine state, load, or process conditions."
        />

        {/* Keywords / tags ◇ */}
        <UnsupportedField
          label="Keywords and tags"
          placeholder="Add keyword, press Enter (no backend support yet)"
        />
      </div>

      {/* Info about unsupported fields */}
      <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-800/20 border border-slate-700/30 rounded-xl p-3">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Fields marked ◇ (Machine type, Manufacturer/model, Department, Category, Process conditions, Keywords) require backend support and are not saved. They accept no input and are never sent to the server.
        </span>
      </div>
    </div>
  );
};
