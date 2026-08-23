/**
 * RichBody — an announcement or noticeboard body, however it was written,
 * rendered with native primitives.
 *
 * Bodies written with the web editor are HTML; everything older is plain text.
 * The server sanitizes on write to a closed tag set (backend/utils/rich_text.py:
 * p, br, strong/b, em/i, u, s/del, h1–h4, ul/ol/li, blockquote, pre, code, hr,
 * a[href]) — small enough to parse into blocks and render as <Text>/<View>
 * instead of shipping an HTML-renderer dependency or a WebView. Rows that
 * predate the sanitizer can hold anything, so unknown tags are stripped while
 * their text survives, and nothing is ever executed: every character ends its
 * life inside an RN <Text>.
 */

import React from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { isHtml, decodeEntities } from '@/src/utils/richText';

export interface RichRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  href?: string;
}

export type RichBlock =
  | { type: 'paragraph'; runs: RichRun[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4; runs: RichRun[] }
  | { type: 'list'; ordered: boolean; items: RichRun[][] }
  | { type: 'quote'; runs: RichRun[] }
  | { type: 'pre'; text: string }
  | { type: 'rule' };

const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

/** Tags whose text content is dropped entirely (pre-sanitizer rows only). */
const DROP_CONTENT = new Set(['script', 'style', 'title', 'head']);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>|<!--[\s\S]*?-->/g;

const hrefOf = (attrs: string): string | undefined => {
  const m = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  const href = m ? (m[2] ?? m[3] ?? m[4]) : undefined;
  if (!href) return undefined;
  const decoded = decodeEntities(href).trim();
  return SAFE_HREF.test(decoded) ? decoded : undefined;
};

export function parseRichBody(body: string | null | undefined): RichBlock[] {
  if (!body) return [];

  if (!isHtml(body)) {
    // Plain text: blank lines split paragraphs, single newlines stay.
    return body
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => ({
        type: 'paragraph' as const,
        runs: [{ text: chunk, bold: false, italic: false, underline: false, strike: false, code: false }],
      }));
  }

  const blocks: RichBlock[] = [];

  // Inline state — counters so nested/aliased tags unwind correctly.
  let bold = 0, italic = 0, underline = 0, strike = 0, code = 0;
  const hrefs: (string | undefined)[] = [];
  let dropDepth = 0;

  // Block state. (Mutated from the closures below — TS control-flow analysis
  // would otherwise pin the outer `let` to its initial null at the switch.)
  type OpenBlock = { type: 'paragraph' | 'heading' | 'quote'; level?: 1 | 2 | 3 | 4 };
  let runs: RichRun[] = [];
  let block: OpenBlock | null = null;
  let list: { ordered: boolean; items: RichRun[][] } | null = null;
  let item: RichRun[] | null = null;
  let preText: string | null = null;

  const hasText = (rs: RichRun[]) => rs.some((r) => r.text.trim());
  const inQuote = () => block?.type === 'quote';

  const flush = () => {
    if (block && hasText(runs)) {
      // Trim the whitespace HTML pretty-printing leaves at the edges.
      runs[0].text = runs[0].text.replace(/^\s+/, '');
      runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
      const kept = runs.filter((r) => r.text);
      if (block.type === 'heading') blocks.push({ type: 'heading', level: block.level!, runs: kept });
      else if (block.type === 'quote') blocks.push({ type: 'quote', runs: kept });
      else blocks.push({ type: 'paragraph', runs: kept });
    }
    runs = [];
    block = null;
  };

  const pushText = (text: string) => {
    if (dropDepth > 0 || !text) return;
    if (preText !== null) { preText += decodeEntities(text); return; }
    // Standard HTML whitespace collapsing.
    const collapsed = decodeEntities(text.replace(/[ \t\r\n]+/g, ' '));
    if (item) {
      item.push(run(collapsed));
      return;
    }
    if (!block) {
      if (!collapsed.trim()) return; // stray whitespace between blocks
      block = { type: 'paragraph' }; // bare inline content
    }
    runs.push(run(collapsed));
  };

  const run = (text: string): RichRun => ({
    text,
    bold: bold > 0,
    italic: italic > 0,
    underline: underline > 0,
    strike: strike > 0,
    code: code > 0,
    href: hrefs[hrefs.length - 1],
  });

  const openBlock = (type: 'paragraph' | 'heading' | 'quote', level?: 1 | 2 | 3 | 4) => {
    // A quote's inner <p> stays inside the quote — paragraphs within it
    // become newline-separated lines rather than separate blocks.
    if (block?.type === 'quote' && type === 'paragraph') {
      if (hasText(runs)) runs.push(run('\n'));
      return;
    }
    flush();
    block = { type, level };
  };

  TAG_RE.lastIndex = 0;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(body)) !== null) {
    pushText(body.slice(cursor, m.index));
    cursor = TAG_RE.lastIndex;
    if (!m[1]) continue; // comment
    const tag = m[1].toLowerCase();
    const closing = m[0][1] === '/';

    if (DROP_CONTENT.has(tag)) { dropDepth += closing ? -1 : 1; if (dropDepth < 0) dropDepth = 0; continue; }
    if (dropDepth > 0) continue;

    switch (tag) {
      case 'strong': case 'b': bold += closing ? -1 : 1; break;
      case 'em': case 'i': italic += closing ? -1 : 1; break;
      case 'u': case 'ins': underline += closing ? -1 : 1; break;
      case 's': case 'del': case 'strike': strike += closing ? -1 : 1; break;
      case 'code': if (preText === null) code += closing ? -1 : 1; break;
      case 'a':
        if (closing) hrefs.pop();
        else hrefs.push(hrefOf(m[2] || ''));
        break;
      case 'br':
        if (item) item.push(run('\n'));
        else if (block) runs.push(run('\n'));
        break;
      case 'p': case 'div':
        if (closing) { if (!inQuote()) flush(); }
        else openBlock('paragraph');
        break;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        if (closing) flush();
        else openBlock('heading', Math.min(4, Number(tag[1])) as 1 | 2 | 3 | 4);
        break;
      case 'blockquote':
        if (closing) flush();
        else openBlock('quote');
        break;
      case 'ul': case 'ol':
        if (closing) {
          if (list && list.items.length) blocks.push({ type: 'list', ordered: list.ordered, items: list.items });
          list = null; item = null;
        } else {
          flush();
          if (!list) list = { ordered: tag === 'ol', items: [] }; // nested lists flatten
        }
        break;
      case 'li':
        if (closing) {
          if (item && hasText(item)) {
            item[0].text = item[0].text.replace(/^\s+/, '');
            item[item.length - 1].text = item[item.length - 1].text.replace(/\s+$/, '');
            list?.items.push(item.filter((r) => r.text));
          }
          item = null;
        } else if (list) item = [];
        break;
      case 'pre':
        if (closing) {
          if (preText?.trim()) blocks.push({ type: 'pre', text: preText.trim() });
          preText = null;
        } else { flush(); preText = ''; }
        break;
      case 'hr':
        flush();
        blocks.push({ type: 'rule' });
        break;
      default:
        break; // unknown tag: stripped, its text already flows through
    }
  }
  pushText(body.slice(cursor));
  flush();

  return blocks;
}

// ── Rendering ──

const bump = { 1: 22, 2: 19, 3: 17, 4: 15 } as const;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function Runs({ runs, baseSize, color }: { runs: RichRun[]; baseSize: number; color: string }) {
  const c = useThemeColors();
  return (
    <>
      {runs.map((r, i) => (
        <Text
          key={i}
          style={{
            fontFamily: r.code ? MONO : r.bold ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
            fontStyle: r.italic ? 'italic' : 'normal',
            textDecorationLine: r.underline && r.strike ? 'underline line-through'
              : r.underline ? 'underline' : r.strike ? 'line-through' : 'none',
            color: r.href ? c.brand : color,
            fontSize: baseSize,
          }}
          onPress={r.href ? () => Linking.openURL(r.href!).catch(() => {}) : undefined}
          accessibilityRole={r.href ? 'link' : undefined}
        >
          {r.text}
        </Text>
      ))}
    </>
  );
}

interface RichBodyProps {
  text?: string | null;
  /** Base font size for body text; headings scale from it. */
  size?: number;
}

export default function RichBody({ text, size = 14 }: RichBodyProps) {
  const c = useThemeColors();
  const blocks = parseRichBody(text);
  if (!blocks.length) return null;

  return (
    <View style={{ gap: 8 }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <Text key={i} style={{ fontFamily: 'Poppins_600SemiBold', fontSize: bump[b.level], color: c.text, lineHeight: bump[b.level] * 1.4 }}>
                <Runs runs={b.runs} baseSize={bump[b.level]} color={c.text} />
              </Text>
            );
          case 'list':
            return (
              <View key={i} style={{ gap: 4 }}>
                {b.items.map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: size, color: c.textMuted, lineHeight: size * 1.5 }}>
                      {b.ordered ? `${j + 1}.` : '•'}
                    </Text>
                    <Text style={{ flex: 1, fontSize: size, lineHeight: size * 1.5 }}>
                      <Runs runs={item} baseSize={size} color={c.text} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: `${c.brand}55`, paddingLeft: 10 }}>
                <Text style={{ fontSize: size, lineHeight: size * 1.5 }}>
                  <Runs runs={b.runs} baseSize={size} color={c.textMuted} />
                </Text>
              </View>
            );
          case 'pre':
            return (
              <View key={i} style={{ backgroundColor: c.surfaceMuted, borderRadius: 8, padding: 10 }}>
                <Text style={{ fontFamily: MONO, fontSize: size - 1, color: c.text }}>{b.text}</Text>
              </View>
            );
          case 'rule':
            return <View key={i} style={{ height: 1, backgroundColor: c.border }} />;
          default:
            return (
              <Text key={i} style={{ fontSize: size, lineHeight: size * 1.5 }}>
                <Runs runs={b.runs} baseSize={size} color={c.text} />
              </Text>
            );
        }
      })}
    </View>
  );
}
