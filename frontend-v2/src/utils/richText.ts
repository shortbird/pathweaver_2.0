/**
 * Message bodies that may or may not be formatted.
 *
 * Announcements written before the editor existed are plain text; ones written
 * with it are HTML. Every reader handles both. Mirrors
 * frontend/src/utils/richText.js and backend/utils/rich_text.py — but without
 * a DOM, because native has none: tags are stripped by regex, entities decoded
 * by table. Safe here because the server sanitizes on write (bleach,
 * strip=True) and the output is only ever rendered through RN <Text>.
 */

const HTML_TAG = /<(?:[a-z][a-z0-9]*)\b[^>]*>/i;
const BLOCK_TAG = /<\/?(?:p|div|li|ul|ol|h[1-6]|blockquote|pre|tr|br|hr)\b[^>]*>/gi;
const ANY_TAG = /<[^>]+>/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

/** Decode the entities the editor and old plain-text bodies actually contain. */
export const decodeEntities = (value: string): string =>
  value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });

/** True when this body was written with the editor rather than typed plain. */
export const isHtml = (value: unknown): boolean =>
  typeof value === 'string' && HTML_TAG.test(value);

/**
 * The readable text of a body — for previews, counting, and deciding whether
 * anything was actually written. Block boundaries become newlines so a list
 * doesn't collapse into one line.
 */
export const htmlToText = (value: unknown): string => {
  if (!value || typeof value !== 'string') return '';
  if (!isHtml(value)) return value;
  return decodeEntities(value.replace(BLOCK_TAG, '\n').replace(ANY_TAG, ''))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
};

/** True when a body has nothing in it ("<p></p>" is an empty editor, not text). */
export const isBlank = (value: unknown): boolean => !htmlToText(value).trim();
