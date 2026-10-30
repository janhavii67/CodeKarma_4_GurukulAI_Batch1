import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  LockKeyhole,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import type { ProcedureStep } from './types';
import { CONTENT_KIND_LABELS, type StepContentKind } from './stepContent';

const ROW = 150;
const NODE = 72;
// Extra room above the first node keeps its Start tag inside the panel.
const TOP = 96;
const EDGE = 64;
const FINISH_GAP = 104;
const LABEL_GAP = 14;
const FALLBACK_WIDTH = 360;

export interface RoadItem {
  step: ProcedureStep;
  done: boolean;
  locked: boolean;
  status: string;
  kinds: StepContentKind[];
}

interface Point { x: number; y: number }

function curveLength(from: Point, to: Point, bend: number): number {
  const c1 = { x: from.x, y: from.y + bend };
  const c2 = { x: to.x, y: to.y - bend };
  let length = 0;
  let previous = from;
  for (let i = 1; i <= 24; i += 1) {
    const t = i / 24;
    const mt = 1 - t;
    const point = {
      x: mt ** 3 * from.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t ** 3 * to.x,
      y: mt ** 3 * from.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t ** 3 * to.y,
    };
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return length;
}

/** Lays nodes out on an S-shaped road and records the road length at each node for the lit-road fill. */
function roadGeometry(width: number, count: number) {
  const points = Array.from({ length: count }, (_, index) => ({
    x: Math.round(width * (index % 2 === 0 ? 0.3 : 0.7)),
    y: TOP + index * ROW,
  }));
  const bend = ROW * 0.55;
  const last = points[points.length - 1];
  const finish = { x: last.x, y: last.y + FINISH_GAP };
  const height = finish.y + EDGE;
  let d = `M ${points[0].x} 0 L ${points[0].x} ${points[0].y}`;
  let travelled = points[0].y;
  const stops = [travelled];
  for (let index = 1; index < count; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    d += ` C ${from.x} ${from.y + bend}, ${to.x} ${to.y - bend}, ${to.x} ${to.y}`;
    travelled += curveLength(from, to, bend);
    stops.push(travelled);
  }
  d += ` L ${finish.x} ${finish.y} L ${finish.x} ${height}`;
  stops.push(travelled + FINISH_GAP);
  return { points, finish, height, d, stops, total: travelled + FINISH_GAP + EDGE };
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => { if (element.clientWidth) setWidth(element.clientWidth); };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

interface LearningRoadProps {
  items: RoadItem[];
  activeIndex: number;
  nextIndex: number;
  completedCount: number;
  complete: boolean;
  disabled: boolean;
  reducedMotion: boolean;
  celebrateStepId: string | null;
  onSelect: (index: number) => void;
}

export function LearningRoad({ items, activeIndex, nextIndex, completedCount, complete, disabled, reducedMotion, celebrateStepId, onSelect }: LearningRoadProps) {
  const { ref, width } = useContainerWidth();
  const geometry = useMemo(() => roadGeometry(width, items.length), [width, items.length]);
  const litTo = complete ? geometry.stops[items.length] : geometry.stops[Math.min(nextIndex, items.length - 1)];
  const litFraction = Math.min(1, litTo / geometry.total);

  return <div ref={ref} className="relative" style={{ height: geometry.height }}>
    <svg aria-hidden="true" className="absolute inset-0 overflow-visible" width={width} height={geometry.height} viewBox={`0 0 ${width} ${geometry.height}`}>
      <path d={geometry.d} fill="none" stroke="#0B1D2E" strokeOpacity={0.55} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
      <path d={geometry.d} fill="none" stroke="#2A4866" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
      <motion.path d={geometry.d} fill="none" stroke="#FFFFFF" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: reducedMotion ? litFraction : 0 }} animate={{ pathLength: litFraction }} transition={reducedMotion ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      <path d={geometry.d} fill="none" stroke="#17324D" strokeOpacity={0.45} strokeWidth={2} strokeDasharray="9 11" strokeLinecap="round" />
    </svg>

    <ol aria-label="Procedure learning steps" className="relative h-full">
      {items.map((item, index) => {
        const point = geometry.points[index];
        const labelOnRight = index % 2 === 0;
        const labelWidth = Math.max(120, labelOnRight ? width - (point.x + NODE / 2) - LABEL_GAP - 8 : point.x - NODE / 2 - LABEL_GAP - 8);
        const isSelected = index === activeIndex;
        const isNext = index === nextIndex && !item.done && !complete;
        const celebrating = celebrateStepId === item.step.id && !reducedMotion;
        const contentText = item.kinds.length ? `, includes ${item.kinds.map((kind) => CONTENT_KIND_LABELS[kind]).join(', ')}` : '';
        const circle = item.done
          ? 'bg-[#4C8DFF] text-white shadow-[0_10px_24px_-12px_rgba(76,141,255,0.55)] hover:bg-[#2675E8]'
          : item.locked
            ? 'bg-[#23415F] text-[#7F95AB] ring-2 ring-inset ring-[#2F4E6E]'
            : 'bg-white text-[#2478F5] shadow-[0_12px_30px_-12px_rgba(255,255,255,0.55)]';

        return <motion.li
          key={item.step.id}
          className="absolute"
          style={{ left: point.x - NODE / 2, top: point.y - NODE / 2, width: NODE, height: NODE }}
          initial={reducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18, delay: Math.min(index * 0.06, 0.36) }}
        >
          <button
            type="button"
            data-step-node={index}
            disabled={item.locked || disabled}
            onClick={() => onSelect(index)}
            aria-current={isSelected ? 'step' : undefined}
            aria-label={`Step ${item.step.step_order}: ${item.step.title}, ${item.status}${contentText}`}
            className="group relative grid h-full w-full place-items-center rounded-full text-lg font-extrabold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#AFCBFF]/70 disabled:cursor-not-allowed"
          >
            {isNext && !reducedMotion && <motion.span aria-hidden="true" className="absolute inset-[-10px] rounded-full border-2 border-white/40" animate={{ scale: [1, 1.08, 1], opacity: [0.7, 0.2, 0.7] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }} />}
            {isSelected && <span aria-hidden="true" className="absolute inset-[-7px] rounded-full ring-[3px] ring-[#AFCBFF]" />}
            <motion.span
              key={celebrating ? 'celebrate' : 'rest'}
              aria-hidden="true"
              className={`grid h-full w-full place-items-center rounded-full transition-[background-color,filter] duration-200 motion-reduce:transition-none ${circle} ${!item.locked ? 'group-hover:brightness-105' : ''}`}
              initial={false}
              animate={celebrating ? { scale: [1, 1.16, 1] } : { scale: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              {item.done ? <Check size={30} strokeWidth={3} /> : item.locked ? <LockKeyhole size={22} /> : <span>{item.step.step_order}</span>}
            </motion.span>
            {celebrating && <motion.span aria-hidden="true" className="absolute inset-0 rounded-full border-4 border-[#4C8DFF]" initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />}
            {item.step.is_critical && <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-amber-950 ring-2 ring-[#17324D]"><ShieldCheck size={13} /></span>}
            {isNext && <span aria-hidden="true" className="absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2">
              <motion.span initial={reducedMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="relative block whitespace-nowrap rounded-full bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#2478F5] shadow-md after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-[5px] after:border-transparent after:border-t-white after:content-['']">{completedCount === 0 ? 'Start' : 'Up next'}</motion.span>
            </span>}
            <span aria-hidden="true" className={`absolute top-1/2 -translate-y-1/2 ${labelOnRight ? 'left-[calc(100%+14px)] text-left' : 'right-[calc(100%+14px)] text-right'}`} style={{ width: labelWidth }}>
              <span
                data-step-label
                className={`block rounded-xl border px-3 py-2 text-[14px] font-extrabold leading-[1.25] tracking-[-0.015em] shadow-lg ring-1 ring-white/5 backdrop-blur-sm ${item.locked ? 'border-white/5 bg-[#17324D]/80 text-[#B8C7D6]' : 'border-white/15 bg-[#17324D]/95 text-white'}`}
              >{item.step.title}</span>
            </span>
          </button>
        </motion.li>;
      })}
    </ol>

    <div className="absolute flex items-center gap-3" style={{ left: geometry.finish.x - 28, top: geometry.finish.y - 28 }}>
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={complete && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={`grid h-14 w-14 place-items-center rounded-full ${complete ? 'bg-white text-[#2478F5] shadow-[0_12px_30px_-12px_rgba(255,255,255,0.6)]' : 'bg-[#23415F] text-[#7F95AB] ring-2 ring-inset ring-[#2F4E6E]'}`}
      ><Trophy size={24} /></motion.span>
    </div>
    <p className={`absolute text-xs font-bold ${geometry.finish.x < width / 2 ? 'text-left' : 'text-right'} ${complete ? 'text-white' : 'text-[#9AAEC2]'}`} style={geometry.finish.x < width / 2 ? { left: geometry.finish.x + 40, top: geometry.finish.y - 9 } : { right: width - geometry.finish.x + 40, top: geometry.finish.y - 9 }}>
      {complete ? 'Path complete' : 'Finish line'}
    </p>
  </div>;
}

/** Road-shaped placeholder while the procedure and run load. */
export function LearningRoadSkeleton() {
  return <div aria-hidden="true" className="relative mx-auto h-[420px] max-w-md">
    {[0, 1, 2].map((index) => <div key={index} className="absolute flex items-center gap-3" style={{ top: 40 + index * 130, left: index % 2 === 0 ? '18%' : '46%' }}>
      <span className="h-16 w-16 animate-pulse rounded-full bg-white/15 motion-reduce:animate-none" />
      <span className="space-y-2"><span className="block h-3 w-28 animate-pulse rounded bg-white/15 motion-reduce:animate-none" /><span className="block h-2.5 w-20 animate-pulse rounded bg-white/10 motion-reduce:animate-none" /></span>
    </div>)}
  </div>;
}
