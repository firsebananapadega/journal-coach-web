'use client';

// Markdown-lite renderer for guide responses. Handles only:
//   - Paragraph breaks on \n\n
//   - **bold** inline
//   - *italic* inline (not part of **)
//   - A line that is entirely **bold** is treated as a section header
// No new dependencies. Plain-text legacy responses pass through unchanged.

import { Fragment, type ReactNode } from 'react';

interface Props {
  text: string;
  className?: string;
  textColor?: string;
}

// ── Feature flag — toggle ON to bring section headers back ─────────
// Gemini sometimes labels each paragraph in a long guide reply with a
// short bold line ("Your next move", "What I noticed", etc). Some
// users find these helpful as visual anchors; others find the
// repeated "Your next move" header reads as canned and repetitive.
//
// Flip this back to `true` and the existing header rendering is
// restored exactly. Single boolean = safe A/B with one keystroke.
const SHOW_PARAGRAPH_HEADERS = false;

const HEADER_LINE_RE = /^\*\*([^*]+)\*\*$/;
// Match either **bold** or *italic* tokens
const INLINE_TOKEN_RE = /(\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*))/g;

function renderInline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  // Reset regex state per call
  INLINE_TOKEN_RE.lastIndex = 0;
  while ((m = INLINE_TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      out.push(<strong key={key++} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={key++} className="italic">{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export default function RichGuideText({ text, className = '', textColor }: Props) {
  if (!text) return null;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className={`space-y-3 ${className}`} style={textColor ? { color: textColor } : undefined}>
      {paragraphs.map((para, i) => {
        if (HEADER_LINE_RE.test(para)) {
          // Header-only paragraph (e.g. "**Your next move**" on its
          // own line). When the feature flag is off we drop the line
          // entirely — the user keeps paragraph spacing between the
          // surrounding text but loses the canned section labels.
          if (!SHOW_PARAGRAPH_HEADERS) return null;
          const m = para.match(HEADER_LINE_RE)!;
          return (
            <h4
              key={i}
              className="text-[15px] font-bold mt-4 first:mt-0"
            >
              {m[1]}
            </h4>
          );
        }
        // Within a paragraph, single line breaks become <br />
        const lines = para.split('\n');
        return (
          <p key={i} className="text-[15px] leading-relaxed">
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
