/**
 * Finding the links inside a plain-text message.
 *
 * Chat messages are stored and sent as plain text. On the web app they are
 * linkified when rendered (web/src/components/communication/MessageText.jsx,
 * iCreate a2da7b48); in the app they were not, so a teacher who posted a
 * homework link had posted a 90-character string with nothing to tap — which is
 * exactly how it was reported (iCreate, 2026-09-07, 208b75b5: "my students
 * can't access homework links from the mobile app").
 *
 * The regex and the trailing-punctuation rule are deliberately the same as the
 * web's `splitUrls`, so the two surfaces agree on where a link ends.
 */

export type Segment = { text: string; url?: undefined } | { url: string; text?: undefined };

const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** Trailing sentence punctuation belongs to the sentence, not the URL. */
const trimUrl = (url: string) => url.replace(/[.,;:!?)\]]+$/, '');

/**
 * Split plain text into alternating text and url segments. Only http(s) is
 * matched: a message is untrusted text, and the app hands whatever comes back
 * to `safeOpenURL`, which re-checks the scheme before the OS ever sees it.
 */
export function splitUrls(text: string): Segment[] {
  const parts: Segment[] = [];
  if (!text) return parts;
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Does this message carry anything tappable? */
export const hasUrl = (text: string) => splitUrls(text).some((s) => s.url);
