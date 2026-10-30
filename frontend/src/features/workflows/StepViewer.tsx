import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  ClipboardList,
  Eye,
  ExternalLink,
  FileWarning,
  Flag,
  Layers,
  Lightbulb,
  BookOpen,
  RotateCcw,
  ScrollText,
  Wrench,
} from 'lucide-react';
import { MediaShowcase } from './MediaShowcase';
import type { ProcedureReference, ProcedureStep, ReferenceLoadState } from './types';
import { stepAssetIds, stepChecklist, stepNarrationText, stepNeedsReview, stepNote, stepSourceReferences, stepStopCondition, stepTools } from './stepContent';
import { StepNarrator } from './StepNarrator';

function SectionHeading({ icon, children, id }: { icon: ReactNode; children: ReactNode; id?: string }) {
  return <h4 id={id} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#536779]">
    <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#E8F1F4] text-[#176E8A]">{icon}</span>{children}
  </h4>;
}

interface StepViewerBodyProps {
  step: ProcedureStep;
  stepReferences: ProcedureReference[];
  /** Attachment IDs saved on the step that the reference API did not return (removed or not accessible). */
  missingAttachmentCount: number;
  procedureReferences: ProcedureReference[];
  referenceState: ReferenceLoadState;
  referenceError: string;
  onRetryReferences: () => void;
  failedReferenceIds: Set<string>;
  onMediaError: (assetId: string) => void;
  onRetryMedia: (assetId: string) => void;
  checklistChecked: boolean[];
  checklistReadOnly: boolean;
  onToggleCheck: (index: number) => void;
  reducedMotion: boolean;
}

/** Renders only the content types this step actually carries, in a fixed learning order. */
export function StepViewerBody({
  step, stepReferences, missingAttachmentCount, procedureReferences, referenceState, referenceError, onRetryReferences,
  failedReferenceIds, onMediaError, onRetryMedia, checklistChecked, checklistReadOnly, onToggleCheck, reducedMotion,
}: StepViewerBodyProps) {
  const attachmentCount = stepAssetIds(step).length;
  const stopCondition = stepStopCondition(step);
  const tools = stepTools(step);
  const checklist = stepChecklist(step);
  const note = stepNote(step);
  const sources = stepSourceReferences(step);
  const checkedCount = checklistReadOnly ? checklist.length : checklistChecked.filter(Boolean).length;

  return <div className="space-y-6">
    {(step.safety_warning || stopCondition || stepNeedsReview(step)) && <div className="space-y-3">
      {step.safety_warning && <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="font-bold">Safety warning</p><p className="mt-1 whitespace-pre-line leading-6">{step.safety_warning}</p></div></div>}
      {stopCondition && <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-100/70 p-4 text-sm text-amber-950"><AlertOctagon size={18} className="mt-0.5 shrink-0" /><div><p className="font-bold">Stop condition</p><p className="mt-1 whitespace-pre-line leading-6">{stopCondition}</p></div></div>}
      {stepNeedsReview(step) && <div className="flex gap-3 rounded-2xl border border-[#DCE6F0] bg-[#F6F9FA] p-4 text-sm text-[#344B60]"><Flag size={17} className="mt-0.5 shrink-0 text-[#536779]" /><p className="leading-6">Part of this step's source content is flagged for expert review.</p></div>}
    </div>}

    <section aria-labelledby={`instructions-${step.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading id={`instructions-${step.id}`} icon={<ScrollText size={13} />}>What to do</SectionHeading>
        <StepNarrator text={stepNarrationText(step)} />
      </div>
      <p className="mt-3 max-w-[68ch] whitespace-pre-line text-[15px] leading-7 text-[#344B60]">{step.instruction}</p>
    </section>

    {sources.length > 0 && <section aria-label="Verified guidance sources" className="rounded-2xl border border-[#C8DCE7] bg-[#F4F8FA] p-4">
      <SectionHeading icon={<BookOpen size={13} />}>Verified guidance</SectionHeading>
      <p className="mt-2 text-xs leading-5 text-[#536779]">Use these references with the installed machine manual and local approved procedure.</p>
      <ul className="mt-3 space-y-2">
        {sources.map((source) => <li key={`${source.url}-${source.title}`}>
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 text-sm font-semibold text-[#176E8A] underline decoration-[#A8CCD7] underline-offset-2 hover:text-[#125C74]">
            <ExternalLink size={14} className="mt-0.5 shrink-0" />
            <span>{source.title}{source.publisher ? <span className="font-normal text-[#536779]"> · {source.publisher}</span> : null}</span>
          </a>
        </li>)}
      </ul>
    </section>}

    {tools.length > 0 && <section aria-labelledby={`tools-${step.id}`}>
      <SectionHeading id={`tools-${step.id}`} icon={<Wrench size={13} />}>Tools and materials</SectionHeading>
      <ul className="mt-3 flex flex-wrap gap-2">{tools.map((tool) => <li key={tool} className="rounded-full border border-[#DCE6F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344B60]">{tool}</li>)}</ul>
    </section>}

    {attachmentCount > 0 && <section aria-labelledby={`step-media-${step.id}`} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading id={`step-media-${step.id}`} icon={<Layers size={13} />}>Learning materials for this step</SectionHeading>
        <span className="font-mono text-[10px] font-semibold text-[#708196]">{attachmentCount} attached</span>
      </div>
      {referenceState === 'loading' && <div aria-label="Loading step attachments" aria-busy="true" className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: Math.min(attachmentCount, 2) }, (_, index) => <div key={index} className="aspect-[16/10] animate-pulse rounded-2xl bg-[#EEF2F5] motion-reduce:animate-none" />)}
      </div>}
      {referenceState === 'error' && <div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <div className="flex gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="font-bold">{attachmentCount === 1 ? 'This step has 1 attachment' : `This step has ${attachmentCount} attachments`}, but they could not be loaded.</p><p className="mt-1 text-xs leading-5">{referenceError || 'The attachment request failed.'}</p></div></div>
        <button type="button" onClick={onRetryReferences} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-200 bg-white px-3 text-xs font-bold text-rose-900 transition hover:bg-rose-100 motion-reduce:transition-none"><RotateCcw size={14} />Retry</button>
      </div>}
      {referenceState === 'loaded' && <MediaShowcase assets={stepReferences} failedIds={failedReferenceIds} onMediaError={onMediaError} onRetry={onRetryMedia} reducedMotion={reducedMotion} />}
      {referenceState === 'loaded' && missingAttachmentCount > 0 && <p role="note" className="flex gap-2 rounded-xl border border-[#DCE6F0] bg-[#F4F6F8] p-3 text-xs leading-5 text-[#536779]"><FileWarning size={15} className="mt-0.5 shrink-0" />{missingAttachmentCount === 1 ? '1 attachment saved on this step is unavailable. It may have been removed or belong to another machine.' : `${missingAttachmentCount} attachments saved on this step are unavailable. They may have been removed or belong to another machine.`}</p>}
    </section>}

    {step.expected_observation && <section aria-labelledby={`observation-${step.id}`} className="rounded-2xl border border-[#DCE6F0] bg-[#F6F9FA] p-4">
      <SectionHeading id={`observation-${step.id}`} icon={<Eye size={13} />}>Expected observation</SectionHeading>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#17324D]">{step.expected_observation}</p>
    </section>}

    {checklist.length > 0 && <section aria-labelledby={`checklist-${step.id}`} className="rounded-2xl border border-[#DCE6F0] p-4">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading id={`checklist-${step.id}`} icon={<ClipboardList size={13} />}>Checklist</SectionHeading>
        <span className="font-mono text-xs font-bold text-[#176E8A]">{checkedCount}/{checklist.length}</span>
      </div>
      <ul className="mt-3 space-y-2">
        {checklist.map((item, index) => {
          const checked = checklistReadOnly || Boolean(checklistChecked[index]);
          return <li key={`${index}-${item}`}>
            <label className={`flex min-h-11 items-start gap-3 rounded-xl px-3 py-2.5 text-sm leading-6 transition-colors motion-reduce:transition-none ${checked ? 'bg-[#EEF6F5] text-[#17324D]' : 'bg-[#FAFBFC] text-[#344B60] hover:bg-[#F4F8FA]'} ${checklistReadOnly ? '' : 'cursor-pointer'}`}>
              <input type="checkbox" className="peer sr-only" checked={checked} disabled={checklistReadOnly} onChange={() => onToggleCheck(index)} />
              <span aria-hidden="true" className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-[#176E8A]/20 motion-reduce:transition-none ${checked ? 'border-[#176E8A] bg-[#176E8A] text-white' : 'border-[#B7CDD7] bg-white'}`}>
                {checked && <motion.span initial={reducedMotion ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }}><Check size={13} strokeWidth={3.5} /></motion.span>}
              </span>
              <span className={checked ? 'font-medium' : ''}>{item}</span>
            </label>
          </li>;
        })}
      </ul>
    </section>}

    {note && <section aria-labelledby={`note-${step.id}`} className="rounded-2xl border-l-4 border-[#176E8A] bg-[#F4F8FA] p-4">
      <SectionHeading id={`note-${step.id}`} icon={<Lightbulb size={13} />}>Expert note</SectionHeading>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#344B60]">{note}</p>
    </section>}

    {procedureReferences.length > 0 && <section aria-labelledby="reference-heading">
      <div className="flex items-end justify-between gap-2">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#176E8A]">Approved learning materials</p><h4 id="reference-heading" className="mt-1 text-sm font-bold text-[#17324D]">Shared procedure materials</h4></div>
        <span className="text-[10px] text-[#708196]">{procedureReferences.length} item{procedureReferences.length === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-3"><MediaShowcase assets={procedureReferences} failedIds={failedReferenceIds} onMediaError={onMediaError} onRetry={onRetryMedia} reducedMotion={reducedMotion} /></div>
    </section>}
  </div>;
}
