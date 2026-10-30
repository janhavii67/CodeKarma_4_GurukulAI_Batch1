import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Clock3,
  Pause,
  Play,
  PlayCircle,
  RotateCcw,
  Volume2,
  X,
} from 'lucide-react';
import { getApiUrl } from '../../lib/api/client';
import { formatFileSize, isVerifiedReference, referenceTitle, type ProcedureReference } from './types';

const MEDIA_KINDS = ['image', 'video', 'audio', 'document'] as const;

// Workflow steps label verification status; the machine knowledge library does not.
const ShowStatusContext = createContext(true);

interface MediaProps {
  failedIds: Set<string>;
  onMediaError: (assetId: string) => void;
  onRetry: (assetId: string) => void;
  reducedMotion: boolean;
}

function mediaUrl(asset: ProcedureReference) {
  return getApiUrl(asset.url || `/media/${asset.id}`);
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Verified items come from approved knowledge; others were attached by the workflow author and are labeled, not hidden. */
function StatusBadge({ asset, onDark = false }: { asset: ProcedureReference; onDark?: boolean }) {
  if (!useContext(ShowStatusContext)) return null;
  if (isVerifiedReference(asset)) return <p className={`inline-flex items-center gap-1 text-[10px] font-semibold ${onDark ? 'text-[#8FE3DA]' : 'text-[#176E8A]'}`}><CheckCircle2 size={12} />Verified for this machine</p>;
  return <p className={`inline-flex items-center gap-1 text-[10px] font-semibold ${onDark ? 'text-[#CFE0EC]' : 'text-[#536779]'}`}><Clock3 size={12} />Not yet verified · attached by the workflow author</p>;
}

function FileMeta({ asset, onDark = false }: { asset: ProcedureReference; onDark?: boolean }) {
  const parts = [asset.filename && referenceTitle(asset) !== asset.filename ? asset.filename : null, asset.mime, formatFileSize(asset.size_bytes)].filter(Boolean);
  if (!parts.length) return null;
  return <p className={`mt-0.5 break-all font-mono text-[10px] ${onDark ? 'text-[#9AAEC2]' : 'text-[#708196]'}`}>{parts.join(' · ')}</p>;
}

function OpenFileLink({ asset, onDark = false }: { asset: ProcedureReference; onDark?: boolean }) {
  return <a href={mediaUrl(asset)} target="_blank" rel="noreferrer" aria-label={`Open or download ${referenceTitle(asset)}`} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-bold transition motion-reduce:transition-none ${onDark ? 'bg-white/10 text-white hover:bg-white/20' : 'border border-[#DCE6F0] bg-white text-[#176E8A] hover:bg-[#F4F8FA]'}`}><ExternalLink size={14} />Open file</a>;
}

function PreviewFallback({ asset, onRetry }: { asset: ProcedureReference; onRetry?: () => void }) {
  return <div className="rounded-xl bg-[#F4F6F8] p-3">
    <p className="text-xs leading-5 text-[#536779]">The embedded preview could not be loaded. Open the approved file to view it.</p>
    <p className="mt-1 text-[11px] leading-5 text-[#708196]">The file may have been moved, your session may have expired, or the format may not play in this browser.</p>
    <div className="mt-2 flex flex-wrap gap-2"><OpenFileLink asset={asset} />{onRetry && <button type="button" onClick={onRetry} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#DCE6F0] bg-white px-3 text-xs font-bold text-[#17324D] transition hover:bg-[#F4F8FA] motion-reduce:transition-none"><RotateCcw size={14} />Retry preview</button>}</div>
  </div>;
}

function FailedMediaCard({ asset, onRetry }: { asset: ProcedureReference; onRetry: () => void }) {
  return <article className="rounded-2xl border border-[#DCE6F0] bg-white p-4"><p className="text-sm font-bold text-[#17324D]">{referenceTitle(asset)}</p><FileMeta asset={asset} /><div className="mt-3"><PreviewFallback asset={asset} onRetry={onRetry} /></div></article>;
}

/** Large framed preview with thumbnails and a full-screen viewer. */
function ImageGallery({ images, failedIds, onMediaError, onRetry, reducedMotion }: MediaProps & { images: ProcedureReference[] }) {
  const [selected, setSelected] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const current = images[Math.min(selected, images.length - 1)];

  return <div className="space-y-3">
    {failedIds.has(current.id) ? <FailedMediaCard asset={current} onRetry={() => onRetry(current.id)} /> : <figure className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white shadow-[0_18px_40px_-28px_rgba(23,50,77,0.6)]">
      <button type="button" onClick={() => setViewerIndex(selected)} aria-label={`View ${referenceTitle(current)} full screen`} className="group relative block aspect-[16/10] w-full overflow-hidden bg-[radial-gradient(circle_at_30%_20%,#23415F,#0F2236)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#8FD3CF]">
        <motion.img key={current.id} src={mediaUrl(current)} alt={referenceTitle(current)} crossOrigin="use-credentials" loading="lazy" onError={() => onMediaError(current.id)} initial={reducedMotion ? false : { opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none" />
        <span aria-hidden="true" className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-bold text-white opacity-90 backdrop-blur transition group-hover:bg-black/60 motion-reduce:transition-none"><Maximize2 size={13} />Expand</span>
        {images.length > 1 && <span aria-hidden="true" className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[11px] font-bold text-white backdrop-blur">{selected + 1} / {images.length}</span>}
      </button>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E7EDF1] px-4 py-3">
        <div className="min-w-0"><p className="break-words text-sm font-bold leading-5 text-[#17324D]">{referenceTitle(current)}</p><FileMeta asset={current} /><StatusBadge asset={current} /></div>
        <OpenFileLink asset={current} />
      </figcaption>
    </figure>}
    {images.length > 1 && <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Step images">
      {images.map((image, index) => <li key={image.id} className="shrink-0"><button type="button" onClick={() => setSelected(index)} aria-label={`Show image ${index + 1}: ${referenceTitle(image)}`} aria-pressed={index === selected} className={`relative block h-16 w-24 overflow-hidden rounded-xl bg-[#0F2236] ring-2 transition motion-reduce:transition-none ${index === selected ? 'ring-[#176E8A]' : 'ring-transparent opacity-70 hover:opacity-100'}`}>
        {failedIds.has(image.id) ? <ImageIcon size={18} className="mx-auto text-[#7F95AB]" /> : <img src={mediaUrl(image)} alt="" crossOrigin="use-credentials" loading="lazy" className="h-full w-full object-cover" />}
      </button></li>)}
    </ul>}
    {viewerIndex !== null && <ImageViewer images={images} index={viewerIndex} onIndexChange={(next) => { setViewerIndex(next); setSelected(next); }} onClose={() => setViewerIndex(null)} reducedMotion={reducedMotion} />}
  </div>;
}

function ImageViewer({ images, index, onIndexChange, onClose, reducedMotion }: { images: ProcedureReference[]; index: number; onIndexChange: (index: number) => void; onClose: () => void; reducedMotion: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const image = images[index];
  const step = (delta: number) => onIndexChange((index + delta + images.length) % images.length);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus?.(); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (images.length > 1 && event.key === 'ArrowRight') onIndexChange((index + 1) % images.length);
      if (images.length > 1 && event.key === 'ArrowLeft') onIndexChange((index - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, index, onClose, onIndexChange]);

  return createPortal(<motion.div role="dialog" aria-modal="true" aria-label={`${referenceTitle(image)} full-screen view`} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] flex flex-col bg-[#071320]/95 backdrop-blur-sm" onClick={onClose}>
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-white sm:px-6" onClick={(event) => event.stopPropagation()}>
      <div className="min-w-0"><p className="truncate text-sm font-bold">{referenceTitle(image)}</p><StatusBadge asset={image} onDark /></div>
      <div className="flex items-center gap-2">
        {images.length > 1 && <span className="font-mono text-xs text-[#B8C7D6]">{index + 1} / {images.length}</span>}
        <OpenFileLink asset={image} onDark />
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close full-screen view" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8FD3CF]/60 motion-reduce:transition-none"><X size={18} /></button>
      </div>
    </div>
    <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-6 sm:px-16" onClick={(event) => event.stopPropagation()}>
      <AnimatePresence initial={false}>
        <motion.img key={image.id} src={mediaUrl(image)} alt={referenceTitle(image)} crossOrigin="use-credentials" initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22 }} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
      </AnimatePresence>
      {images.length > 1 && <>
        <button type="button" onClick={() => step(-1)} aria-label="Previous image" className="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 motion-reduce:transition-none sm:left-4"><ChevronLeft size={22} /></button>
        <button type="button" onClick={() => step(1)} aria-label="Next image" className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 motion-reduce:transition-none sm:right-4"><ChevronRight size={22} /></button>
      </>}
    </div>
  </motion.div>, document.body);
}

interface CardProps { asset: ProcedureReference; failed: boolean; onMediaError: () => void; onRetry: () => void }

function VideoCard({ asset, failed, onMediaError, onRetry }: CardProps) {
  if (failed) return <FailedMediaCard asset={asset} onRetry={onRetry} />;
  return <figure className="overflow-hidden rounded-2xl bg-[#0B1D2E] shadow-[0_24px_50px_-28px_rgba(11,29,46,0.9)] ring-1 ring-[#17324D]/20">
    <div className="relative aspect-video bg-black">
      <video aria-label={`${referenceTitle(asset)} preview`} controls preload="metadata" playsInline className="h-full w-full" crossOrigin="use-credentials" onError={onMediaError}><source src={mediaUrl(asset)} type={asset.mime || undefined} /></video>
    </div>
    <figcaption className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#8FD3CF]"><PlayCircle size={20} /></span>
        <div className="min-w-0"><p className="break-words text-sm font-bold leading-5">{referenceTitle(asset)}</p><FileMeta asset={asset} onDark /><StatusBadge asset={asset} onDark /></div>
      </div>
      <OpenFileLink asset={asset} onDark />
    </figcaption>
  </figure>;
}

/** Custom controls over a native audio element; the element keeps the accessible preview label. */
function AudioCard({ asset, failed, onMediaError, onRetry, reducedMotion }: CardProps & { reducedMotion: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [loadedDuration, setDuration] = useState(0);
  // Show the stored duration until the browser has read the file's metadata.
  const duration = loadedDuration || asset.duration_seconds || 0;

  if (failed) return <FailedMediaCard asset={asset} onRetry={onRetry} />;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  };
  const progress = duration ? (current / duration) * 100 : 0;

  return <article className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#17324D] to-[#1F4C6E] p-4 text-white shadow-[0_20px_44px_-28px_rgba(23,50,77,0.9)] sm:p-5">
    <audio
      ref={audioRef}
      aria-label={`${referenceTitle(asset)} preview`}
      preload="metadata"
      crossOrigin="use-credentials"
      onError={onMediaError}
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      onDurationChange={(event) => setDuration(event.currentTarget.duration)}
      onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
    ><source src={mediaUrl(asset)} type={asset.mime || undefined} /></audio>
    <div className="flex items-center gap-4">
      <motion.button type="button" onClick={toggle} whileTap={reducedMotion ? undefined : { scale: 0.92 }} aria-label={playing ? `Pause ${referenceTitle(asset)}` : `Play ${referenceTitle(asset)}`} className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-[#17324D] shadow-lg transition hover:bg-[#E8F1F4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8FD3CF]/60 motion-reduce:transition-none">
        {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
      </motion.button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="break-words text-sm font-bold leading-5">{referenceTitle(asset)}</p><FileMeta asset={asset} onDark /><StatusBadge asset={asset} onDark /></div>
          <span aria-hidden="true" className="flex h-6 items-end gap-[3px]">
            {[0, 1, 2, 3].map((bar) => <motion.span key={bar} className="w-[3px] rounded-full bg-[#8FD3CF]" initial={false} animate={playing && !reducedMotion ? { height: ['30%', '100%', '45%', '80%', '30%'] } : { height: playing ? '70%' : '30%' }} transition={playing && !reducedMotion ? { duration: 1.1, repeat: Infinity, delay: bar * 0.15, ease: 'easeInOut' } : { duration: 0.2 }} />)}
          </span>
        </div>
        <div className="mt-3">
          <input type="range" min={0} max={loadedDuration || 0} step={0.1} value={Math.min(current, loadedDuration || 0)} disabled={!loadedDuration} aria-label={`Seek ${referenceTitle(asset)}`} onChange={(event) => { const audio = audioRef.current; if (audio) { audio.currentTime = Number(event.target.value); setCurrent(audio.currentTime); } }} className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[#8FD3CF] disabled:cursor-default" style={{ background: `linear-gradient(to right, #8FD3CF ${progress}%, rgba(255,255,255,0.18) ${progress}%)` }} />
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-[#B8C7D6]"><span>{formatTime(current)}</span><span>{duration ? formatTime(duration) : '--:--'}</span></div>
        </div>
      </div>
    </div>
    <div className="mt-3 flex justify-end"><OpenFileLink asset={asset} onDark /></div>
  </article>;
}

function DocumentCard({ asset, failed, onRetry }: Omit<CardProps, 'onMediaError'>) {
  const isPdf = (asset.mime || '').toLowerCase() === 'application/pdf';
  return <article className="overflow-hidden rounded-2xl border border-[#DCE6F0] bg-white shadow-[0_14px_32px_-26px_rgba(23,50,77,0.6)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EDF1] bg-[#F8FAFB] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E8F1F4] text-[#176E8A]"><FileText size={19} /></span>
        <div className="min-w-0"><p className="break-words text-sm font-bold leading-5 text-[#17324D]">{referenceTitle(asset)}</p><FileMeta asset={asset} /><StatusBadge asset={asset} /></div>
      </div>
      <OpenFileLink asset={asset} />
    </div>
    {failed ? <div className="p-4"><PreviewFallback asset={asset} onRetry={onRetry} /></div> : isPdf ? <div className="bg-[#EEF2F5] p-3"><object data={mediaUrl(asset)} type="application/pdf" aria-label={`${referenceTitle(asset)} preview`} className="h-80 w-full rounded-lg bg-white shadow-sm" /><p className="mt-2 text-[10px] text-[#708196]">If the preview is blank, open the PDF in a new tab.</p></div> : <p className="px-4 py-3 text-xs leading-5 text-[#536779]">Open this document in a new tab. The browser can preview supported PDFs and download other file types.</p>}
  </article>;
}

function OtherFileCard({ asset }: { asset: ProcedureReference }) {
  return <article className="rounded-2xl border border-[#DCE6F0] bg-white p-4">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E8F1F4] text-[#176E8A]"><FileText size={18} /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-bold leading-5 text-[#17324D]">{referenceTitle(asset)}</p><FileMeta asset={asset} /><StatusBadge asset={asset} /></div></div>
    <div className="mt-3 rounded-xl bg-[#F6F9FA] p-3"><p className="text-xs leading-5 text-[#536779]">This file type has no embedded preview. Open or download the file.</p><div className="mt-2"><OpenFileLink asset={asset} /></div></div>
  </article>;
}

const GROUP_LABELS = { image: ['Images', ImageIcon], video: ['Video', PlayCircle], audio: ['Audio', Volume2], document: ['Documents', FileText] } as const;

/** Shows attached media grouped by type: image gallery, video, audio, documents, then other files. */
export function MediaShowcase({ assets, failedIds, onMediaError, onRetry, reducedMotion, showStatus = true, compact = false }: MediaProps & { assets: ProcedureReference[]; showStatus?: boolean; compact?: boolean }) {
  const others = assets.filter((asset) => !MEDIA_KINDS.includes(asset.kind as typeof MEDIA_KINDS[number]));
  return <ShowStatusContext.Provider value={showStatus}><div className="space-y-5">
    {MEDIA_KINDS.map((kind) => {
      const group = assets.filter((asset) => asset.kind === kind);
      if (!group.length) return null;
      const [label, Icon] = GROUP_LABELS[kind];
      return <div key={kind}>
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#17324D]"><Icon size={14} className="text-[#176E8A]" />{label}{group.length > 1 && <span className="font-mono text-[10px] font-semibold text-[#708196]">· {group.length}</span>}</p>
        {kind === 'image' && <ImageGallery images={group} failedIds={failedIds} onMediaError={onMediaError} onRetry={onRetry} reducedMotion={reducedMotion} />}
        {kind === 'video' && <div className="space-y-4">{group.map((asset) => <VideoCard key={asset.id} asset={asset} failed={failedIds.has(asset.id)} onMediaError={() => onMediaError(asset.id)} onRetry={() => onRetry(asset.id)} />)}</div>}
        {kind === 'audio' && <div className={compact ? 'grid gap-3' : 'grid gap-3 xl:grid-cols-2'}>{group.map((asset) => <AudioCard key={asset.id} asset={asset} failed={failedIds.has(asset.id)} onMediaError={() => onMediaError(asset.id)} onRetry={() => onRetry(asset.id)} reducedMotion={reducedMotion} />)}</div>}
        {kind === 'document' && <div className="space-y-3">{group.map((asset) => <DocumentCard key={asset.id} asset={asset} failed={failedIds.has(asset.id)} onRetry={() => onRetry(asset.id)} />)}</div>}
      </div>;
    })}
    {others.map((asset) => <OtherFileCard key={asset.id} asset={asset} />)}
  </div></ShowStatusContext.Provider>;
}
