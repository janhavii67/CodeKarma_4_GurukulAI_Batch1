import React, { useMemo } from 'react';
import type { SourceRef } from '../types';

interface SafeMarkdownProps {
  content: string;
  sources?: SourceRef[];
  onSelectSource?: (sourceId: string) => void;
}

/**
 * Safely renders markdown-like text without executing or injecting raw HTML.
 * Handles headings, paragraphs, bullet lists, bold text, inline code, and
 * transforms machine-readable [CHUNK:id] tags into elegant, numbered reference badges.
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({
  content,
  sources,
  onSelectSource,
}) => {
  if (!content) return null;

  // 1. Build a map of chunk_id -> { num, title, sourceId }
  const citationMap = useMemo(() => {
    const map = new Map<string, { num: number; title: string; sourceId: string }>();

    // Seed from provided sources array first to guarantee 1-to-1 match with the Sources list
    sources?.forEach((src, idx) => {
      const cleanTitle = src.title ? src.title.replace(/^Knowledge base document:\s*/i, '').trim() : `Source ${idx + 1}`;
      const item = {
        num: idx + 1,
        title: cleanTitle,
        sourceId: src.source_id || src.chunk_id || `src-${idx}`,
      };

      if (src.chunk_id && !map.has(src.chunk_id)) {
        map.set(src.chunk_id, item);
      }
      if (src.source_id && !map.has(src.source_id)) {
        map.set(src.source_id, item);
      }
    });

    // Scan content to assign sequential numbers to any cited chunk not already indexed
    const chunkRegex = /\[CHUNK:\s*([a-zA-Z0-9_\-\.]+)\s*\]/gi;
    let match: RegExpExecArray | null;
    while ((match = chunkRegex.exec(content)) !== null) {
      const cid = match[1].trim();
      if (!map.has(cid)) {
        const nextNum = map.size + 1;
        map.set(cid, {
          num: nextNum,
          title: `Source ${nextNum}`,
          sourceId: cid,
        });
      }
    }

    return map;
  }, [content, sources]);

  // Sanitize by removing potential HTML tags
  let sanitized = content.replace(/<[^>]*>/g, '');

  // Normalize awkward space between citation tag and trailing punctuation (e.g. "[CHUNK:id] ." -> "[CHUNK:id].")
  sanitized = sanitized.replace(/(\[CHUNK:[^\]]+\])\s+([.,;:!?])/g, '$1$2');

  // Collapse consecutive identical citations (e.g. "[CHUNK:abc] [CHUNK:abc]" -> "[CHUNK:abc]")
  sanitized = sanitized.replace(/(\[CHUNK:\s*([a-zA-Z0-9_\-\.]+)\s*\])(?:\s*\[CHUNK:\s*\2\s*\])+/gi, '$1');

  const lines = sanitized.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`${keyPrefix}-list`} className="list-disc list-inside space-y-1.5 my-2 pl-2 text-slate-700">
          {currentList.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {formatInlineStyles(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const formatInlineStyles = (text: string): React.ReactNode => {
    // Process citations [CHUNK:id], bold text **text**, and inline code `code`
    const parts = text.split(/(\[CHUNK:[^\]]+\]|\*\*[^*]+\*\*|`[^`]+`)/g);

    return parts.map((part, index) => {
      if (part.startsWith('[CHUNK:') && part.endsWith(']')) {
        const chunkId = part.slice(7, -1).trim();
        const info = citationMap.get(chunkId) || {
          num: 1,
          title: 'Source',
          sourceId: chunkId,
        };

        return (
          <button
            key={index}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSource?.(info.sourceId);
            }}
            title={`Source ${info.num}: ${info.title}`}
            aria-label={`View citation ${info.num}: ${info.title}`}
            className="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 mx-0.5 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 border border-blue-200/90 hover:border-blue-300 rounded-full cursor-pointer transition-colors duration-150 align-baseline select-none -translate-y-0.5 shadow-2xs hover:shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {info.num}
          </button>
        );
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={index} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code key={index} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-xs font-mono font-medium border border-slate-200">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList(`line-${idx}`);
      return;
    }

    // Bullet list item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2));
      return;
    }

    // Numbered list item
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      currentList.push(numberedMatch[2]);
      return;
    }

    flushList(`line-${idx}`);

    // Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={idx} className="text-sm font-bold text-slate-900 mt-3 mb-1">
          {formatInlineStyles(trimmed.slice(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={idx} className="text-base font-bold text-slate-900 mt-4 mb-1.5">
          {formatInlineStyles(trimmed.slice(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={idx} className="text-lg font-bold text-slate-900 mt-4 mb-2">
          {formatInlineStyles(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    // Standard paragraph
    elements.push(
      <p key={idx} className="text-sm text-slate-800 leading-relaxed my-1.5">
        {formatInlineStyles(trimmed)}
      </p>
    );
  });

  flushList('final');

  return <div className="space-y-1">{elements}</div>;
};
