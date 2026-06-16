/**
 * Shared legal-document content model.
 *
 * This is the SINGLE SOURCE OF TRUTH for the Terms of Service and Privacy
 * Policy text. It is consumed by BOTH frontends:
 *   - v1 web  (frontend/)        -> rendered with HTML via LegalDocument.jsx
 *   - v2 mobile (frontend-v2/)   -> rendered with RN components via LegalDocument.tsx
 *
 * Content is structured data (not markdown / not JSX) so each platform can
 * render it with its own components and styling while the words stay identical.
 *
 * When you change the wording of a document, also bump the matching version in
 * backend/legal_versions.py and the `version`/`effectiveDate` fields below so
 * the displayed date and the stored acceptance version stay in agreement.
 */

/** An inline run of text: a plain string, bolded text, or a link. */
export type InlineNode =
  | string
  | { bold: string }
  | { link: string; href: string };

/** Either a plain string (the common case) or a list of inline runs. */
export type RichText = string | InlineNode[];

/** A block of content within a section. */
export type LegalBlock =
  | { type: 'subheading'; text: string }
  | { type: 'paragraph'; text: RichText; emphasis?: boolean }
  | { type: 'list'; items: RichText[] }
  | { type: 'callout'; variant: 'warning' | 'success'; title?: string; blocks: LegalBlock[] }
  | { type: 'contact'; lines: RichText[] };

export interface LegalSection {
  /** Section heading, e.g. "1. Introduction". */
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  /** Human-readable effective date, e.g. "June 16, 2026". */
  effectiveDate: string;
  /** Must match the matching constant in backend/legal_versions.py. */
  version: string;
  /** Optional lead paragraphs rendered before the first numbered section. */
  preamble?: LegalBlock[];
  sections: LegalSection[];
}
