import React from 'react';
import { Bot, User, CheckCircle2, ShieldAlert, AlertTriangle, Download, FileAudio, FileText, FileVideo, Image as ImageIcon } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { SafeMarkdown } from './SafeMarkdown';
import { SourceCitations } from './SourceCitations';
import { InsufficientEvidenceNotice } from './InsufficientEvidenceNotice';
import { FeedbackButtons } from './FeedbackButtons';
import { AudioTutorResult } from './AudioTutorResult';
import { TutorHandoffActions } from './TutorHandoffActions';
import { getApiUrl } from '../../../lib/api/client';
import type { Message, RelatedMedia } from '../types';

const MEDIA_ICONS: Record<string, typeof FileText> = { image: ImageIcon, audio: FileAudio, video: FileVideo, document: FileText };

/** Files attached to the knowledge this answer cites, listed as citations that open the file on demand. */
const RelatedMediaPanel: React.FC<{ items: RelatedMedia[] }> = ({ items }) => (
  <section aria-label="Related media from cited knowledge" className="mt-3 border-t border-slate-100 pt-3">
    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Related media from cited knowledge</p>
    <ol className="mt-2 flex flex-wrap gap-2">
      {items.map((item, index) => {
        const Icon = MEDIA_ICONS[item.kind] || FileText;
        return (
          <li key={item.id}>
            <a
              href={getApiUrl(item.url)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${item.kind} citation ${index + 1}: ${item.title}, from ${item.source_title}`}
              title={`From ${item.source_title}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="font-mono text-[10px] font-bold text-blue-700">[{index + 1}]</span>
              <Icon className="h-3.5 w-3.5 shrink-0 text-blue-700" />
              <span className="truncate font-semibold">{item.title}</span>
              <span className="shrink-0 text-[10px] uppercase text-slate-400">{item.kind}</span>
            </a>
          </li>
        );
      })}
    </ol>
  </section>
);

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onSelectSource?: (sourceId: string) => void;
}

const formatAttachmentSize = (size?: number) => {
  if (!size || size <= 0) return 'Attachment';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const withInlinePreview = (url: string) => `${url}${url.includes('?') ? '&' : '?'}inline=true`;

const AttachmentPreview: React.FC<{ attachment: NonNullable<Message['attachment']> }> = ({ attachment }) => {
  const mime = attachment.mime.toLowerCase();
  const inlineUrl = attachment.preview_url || (attachment.url ? getApiUrl(withInlinePreview(attachment.url)) : undefined);
  const downloadUrl = attachment.url ? getApiUrl(attachment.url) : attachment.preview_url;
  const previewImage = mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
  const previewVideo = mime.startsWith('video/');
  const previewAudio = mime.startsWith('audio/');
  const previewPdf = mime === 'application/pdf';
  const hasInlinePreview = previewImage || previewVideo || previewAudio || previewPdf;
  const Icon = previewImage ? ImageIcon : previewVideo ? FileVideo : previewAudio ? FileAudio : FileText;

  return (
    <div className="mt-3 w-full max-w-full overflow-hidden rounded-2xl border border-white/20 bg-slate-950/15 p-2.5 shadow-inner sm:max-w-sm">
      {inlineUrl && previewImage && (
        <img
          src={inlineUrl}
          alt={`Uploaded ${attachment.filename}`}
          loading="lazy"
          className="max-h-64 w-full rounded-xl bg-slate-900/20 object-contain"
        />
      )}
      {inlineUrl && previewVideo && (
        <video
          src={inlineUrl}
          controls
          playsInline
          preload="metadata"
          aria-label={`Preview ${attachment.filename}`}
          className="max-h-64 w-full rounded-xl bg-slate-950"
        />
      )}
      {inlineUrl && previewAudio && (
        <audio
          src={inlineUrl}
          controls
          preload="metadata"
          aria-label={`Play ${attachment.filename}`}
          className="w-full"
        />
      )}
      {inlineUrl && previewPdf && (
        <iframe
          src={inlineUrl}
          title={`Preview ${attachment.filename}`}
          loading="lazy"
          className="h-56 w-full rounded-xl bg-white"
        />
      )}

      <div className="mt-2 flex min-w-0 items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-white">{attachment.filename}</span>
          <span className="mt-0.5 block text-[10px] text-blue-100">
            {mime.split('/').pop()?.toUpperCase() || 'FILE'} · {formatAttachmentSize(attachment.size_bytes)}
          </span>
        </span>
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            download={attachment.preview_url ? attachment.filename : undefined}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/20"
            aria-label={`Open attachment ${attachment.filename}`}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{hasInlinePreview ? 'Open' : 'Download'}</span>
          </a>
        )}
      </div>
    </div>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isStreaming = false,
  onSelectSource,
}) => {
  const isUser = message.role === 'user';
  const isInsufficient = message.evidence_status === 'insufficient';
  const isProviderUnavailable = Boolean(message.provider_unavailable);

  if (isUser) {
    const isVoiceQuestion = Boolean(message.attachment?.mime.toLowerCase().startsWith('audio/'));
    const displayContent = message.attachment
      ? message.content
          .split('\n')
          .filter((line) => line.trim() !== `Attached: ${message.attachment?.filename}` && line.trim() !== `[Attachment: ${message.attachment?.filename}]`)
          .join('\n')
          .trim()
      : message.content;

    return (
      <div className="mb-5 flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
        <div className="flex max-w-[90%] flex-row-reverse items-end gap-2.5 sm:max-w-2xl lg:max-w-3xl">
          <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-white text-blue-700 shadow-sm">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 rounded-[1.4rem] rounded-br-md bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3 text-sm leading-relaxed text-white shadow-md shadow-blue-900/10">
            {isVoiceQuestion && displayContent && (
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-100">Voice question transcript</p>
            )}
            {displayContent && <p className="whitespace-pre-wrap">{displayContent}</p>}
            {message.attachment && <AttachmentPreview attachment={message.attachment} />}
            {message.created_at && (
              <span className="mt-2 block text-right text-[10px] text-blue-100">
                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 flex justify-start animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="flex w-full max-w-4xl items-start gap-3">
        {/* Assistant Avatar */}
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-900/10">
          <Bot className="h-4 w-4" />
        </div>

        {/* Assistant Bubble Content */}
        <div className="flex-1 space-y-2">
          <div className="space-y-3 rounded-[1.4rem] rounded-tl-md border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
            {/* Header info */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-bold text-slate-800">Gurukul AI Tutor</span>
                {isProviderUnavailable ? (
                  <Badge variant="warning" size="sm">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Assistant unavailable
                  </Badge>
                ) : message.evidence_status && message.evidence_status !== 'n_a' && (
                  <Badge
                    variant={isInsufficient ? 'warning' : 'success'}
                    size="sm"
                  >
                    {isInsufficient ? (
                      <>
                        <ShieldAlert className="w-3 h-3 mr-1" />
                        Insufficient Evidence
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Grounded in SOP
                      </>
                    )}
                  </Badge>
                )}
              </div>
              {message.created_at && (
                <span className="shrink-0 text-[11px] text-slate-400">
                  {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Content text / streaming */}
            <div className="font-sans text-sm leading-7 text-slate-800">
              <SafeMarkdown
                content={message.content}
                sources={message.sources}
                onSelectSource={onSelectSource}
              />
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-blue-600 animate-pulse" />
              )}
            </div>

            {message.audio_analysis && <AudioTutorResult result={message.audio_analysis} />}

            {/* Insufficient Evidence Notice */}
            {isInsufficient && !isProviderUnavailable && <InsufficientEvidenceNotice />}

            {/* Source Citations */}
            {message.sources && message.sources.length > 0 && (
              <SourceCitations sources={message.sources} onSelectSource={onSelectSource} />
            )}

            {!isStreaming && !isInsufficient && !isProviderUnavailable && message.related_media && message.related_media.length > 0 && (
              <RelatedMediaPanel items={message.related_media} />
            )}

            {!isStreaming && !isInsufficient && !isProviderUnavailable && !message.audio_analysis && (
              <TutorHandoffActions message={message} />
            )}
          </div>

          {/* Feedback buttons for finalized responses */}
          {!isStreaming && !message.audio_analysis && message.id && !message.id.startsWith('asst-') && (
            <FeedbackButtons messageId={message.id} />
          )}
        </div>
      </div>
    </div>
  );
};
