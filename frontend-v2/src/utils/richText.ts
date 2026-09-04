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

// The HTML 4.01 named entities, plus `apos` (XML, and what some editors emit).
//
// This was thirteen entries until 2026-09-03, chosen as "the ones the editor
// actually produces". It was wrong in a way nobody would report: the web app
// and the email fan-out decode entities through a DOM and Python's
// html.unescape respectively, which know the whole table, so an announcement
// containing `caf&eacute;` or `&copy;` read correctly everywhere EXCEPT on a
// phone, where it showed the raw entity. Pasting from Word or a web page is
// how they get into a body. shared/richTextCases.json now pins all three
// implementations against the same corpus.
//
// HTML 4.01 (252) rather than HTML5 (2231): it covers Latin-1, Greek, maths
// and punctuation -- everything a paste realistically carries -- without
// putting 40KB of entity names none of them emit into the mobile bundle.
const NAMED_ENTITIES: Record<string, string> = {
  AElig: 'Æ', Aacute: 'Á', Acirc: 'Â', Agrave: 'À', Alpha: 'Α', Aring: 'Å', Atilde: 'Ã',
  Auml: 'Ä', Beta: 'Β', Ccedil: 'Ç', Chi: 'Χ', Dagger: '‡', Delta: 'Δ', ETH: 'Ð',
  Eacute: 'É', Ecirc: 'Ê', Egrave: 'È', Epsilon: 'Ε', Eta: 'Η', Euml: 'Ë', Gamma: 'Γ',
  Iacute: 'Í', Icirc: 'Î', Igrave: 'Ì', Iota: 'Ι', Iuml: 'Ï', Kappa: 'Κ', Lambda: 'Λ',
  Mu: 'Μ', Ntilde: 'Ñ', Nu: 'Ν', OElig: 'Œ', Oacute: 'Ó', Ocirc: 'Ô', Ograve: 'Ò',
  Omega: 'Ω', Omicron: 'Ο', Oslash: 'Ø', Otilde: 'Õ', Ouml: 'Ö', Phi: 'Φ', Pi: 'Π',
  Prime: '″', Psi: 'Ψ', Rho: 'Ρ', Scaron: 'Š', Sigma: 'Σ', THORN: 'Þ', Tau: 'Τ',
  Theta: 'Θ', Uacute: 'Ú', Ucirc: 'Û', Ugrave: 'Ù', Upsilon: 'Υ', Uuml: 'Ü',
  Xi: 'Ξ', Yacute: 'Ý', Yuml: 'Ÿ', Zeta: 'Ζ', aacute: 'á', acirc: 'â', acute: '´',
  aelig: 'æ', agrave: 'à', alefsym: 'ℵ', alpha: 'α', amp: '&', and: '∧', ang: '∠',
  aring: 'å', asymp: '≈', atilde: 'ã', auml: 'ä', bdquo: '„', beta: 'β', brvbar: '¦',
  bull: '•', cap: '∩', ccedil: 'ç', cedil: '¸', cent: '¢', chi: 'χ', circ: 'ˆ',
  clubs: '♣', cong: '≅', copy: '©', crarr: '↵', cup: '∪', curren: '¤', dArr: '⇓',
  dagger: '†', darr: '↓', deg: '°', delta: 'δ', diams: '♦', divide: '÷', eacute: 'é',
  ecirc: 'ê', egrave: 'è', empty: '∅', emsp: ' ', ensp: ' ', epsilon: 'ε', equiv: '≡',
  eta: 'η', eth: 'ð', euml: 'ë', euro: '€', exist: '∃', fnof: 'ƒ', forall: '∀',
  frac12: '½', frac14: '¼', frac34: '¾', frasl: '⁄', gamma: 'γ', ge: '≥', gt: '>',
  hArr: '⇔', harr: '↔', hearts: '♥', hellip: '…', iacute: 'í', icirc: 'î', iexcl: '¡',
  igrave: 'ì', image: 'ℑ', infin: '∞', int: '∫', iota: 'ι', iquest: '¿', isin: '∈',
  iuml: 'ï', kappa: 'κ', lArr: '⇐', lambda: 'λ', lang: '〈', laquo: '«', larr: '←',
  lceil: '⌈', ldquo: '“', le: '≤', lfloor: '⌊', lowast: '∗', loz: '◊', lrm: '‎',
  lsaquo: '‹', lsquo: '‘', lt: '<', macr: '¯', mdash: '—', micro: 'µ', middot: '·',
  minus: '−', mu: 'μ', nabla: '∇', nbsp: ' ', ndash: '–', ne: '≠', ni: '∋', not: '¬',
  notin: '∉', nsub: '⊄', ntilde: 'ñ', nu: 'ν', oacute: 'ó', ocirc: 'ô', oelig: 'œ',
  ograve: 'ò', oline: '‾', omega: 'ω', omicron: 'ο', oplus: '⊕', or: '∨', ordf: 'ª',
  ordm: 'º', oslash: 'ø', otilde: 'õ', otimes: '⊗', ouml: 'ö', para: '¶', part: '∂',
  permil: '‰', perp: '⊥', phi: 'φ', pi: 'π', piv: 'ϖ', plusmn: '±', pound: '£',
  prime: '′', prod: '∏', prop: '∝', psi: 'ψ', quot: '"', rArr: '⇒', radic: '√',
  rang: '〉', raquo: '»', rarr: '→', rceil: '⌉', rdquo: '”', real: 'ℜ', reg: '®',
  rfloor: '⌋', rho: 'ρ', rlm: '‏', rsaquo: '›', rsquo: '’', sbquo: '‚', scaron: 'š',
  sdot: '⋅', sect: '§', shy: '­', sigma: 'σ', sigmaf: 'ς', sim: '∼', spades: '♠',
  sub: '⊂', sube: '⊆', sum: '∑', sup: '⊃', sup1: '¹', sup2: '²', sup3: '³', supe: '⊇',
  szlig: 'ß', tau: 'τ', there4: '∴', theta: 'θ', thetasym: 'ϑ', thinsp: ' ',
  thorn: 'þ', tilde: '˜', times: '×', trade: '™', uArr: '⇑', uacute: 'ú', uarr: '↑',
  ucirc: 'û', ugrave: 'ù', uml: '¨', upsih: 'ϒ', upsilon: 'υ', uuml: 'ü', weierp: '℘',
  xi: 'ξ', yacute: 'ý', yen: '¥', yuml: 'ÿ', zeta: 'ζ', zwj: '‍', zwnj: '‌',
};

/** Decode the entities a message body can contain. Unknown ones pass through. */
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
