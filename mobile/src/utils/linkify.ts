/**
 * Find the links in a run of plain text.
 *
 * The school's calendar descriptions are typed, not authored: "Sign up HERE:
 * https://forms.gle/..." with the URL pasted inline, and a location that is
 * sometimes a Zoom link rather than a room. Nothing on the phone made those
 * tappable (2026-09-18). This splits a string into text and link parts so a
 * <Text> can render the links as links; opening them stays with safeOpenURL.
 *
 * Scheme-carrying URLs and bare "www." hosts only — a bare "example.com" in
 * prose is as likely to be a sentence ending as an address. Trailing
 * punctuation stays with the sentence, not the link, and a closing paren is
 * only part of the link when the link opened one.
 */

export type TextPart = { text: string; url?: string };

const LINK_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

const TRAILING = /[.,;:!?'"]+$/;

const trimLink = (raw: string): string => {
  let link = raw.replace(TRAILING, '');
  if (link.endsWith(')') && !link.includes('(')) link = link.slice(0, -1).replace(TRAILING, '');
  return link;
};

export function linkify(text: string | null | undefined): TextPart[] {
  if (!text) return [];
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    const link = trimLink(m[0]);
    if (!link) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: link, url: /^www\./i.test(link) ? `https://${link}` : link });
    last = start + link.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export const hasLink = (text: string | null | undefined): boolean =>
  linkify(text).some((p) => !!p.url);
