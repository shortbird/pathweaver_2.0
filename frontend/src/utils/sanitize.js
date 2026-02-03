/**
 * HTML Sanitization Utility
 *
 * Provides safe HTML rendering to prevent XSS attacks.
 * Uses DOMPurify library for robust sanitization.
 */

import DOMPurify from 'dompurify';

/**
 * Default DOMPurify configuration for educational content
 * Allows common formatting tags while blocking dangerous elements
 */
const DEFAULT_CONFIG = {
  ALLOWED_TAGS: [
    // Text formatting
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins',
    'sub', 'sup', 'small', 'mark', 'abbr', 'cite', 'q', 'blockquote',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Links and media
    'a', 'img', 'figure', 'figcaption',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Structure
    'div', 'span', 'section', 'article', 'header', 'footer', 'aside', 'nav',
    // Code
    'pre', 'code', 'kbd', 'samp', 'var',
    // Other
    'hr', 'details', 'summary', 'time', 'address'
  ],
  ALLOWED_ATTR: [
    // Global attributes
    'class', 'id', 'style', 'title', 'lang', 'dir',
    // Links
    'href', 'target', 'rel',
    // Images
    'src', 'alt', 'width', 'height', 'loading',
    // Tables
    'colspan', 'rowspan', 'scope', 'headers',
    // Data attributes (for styling frameworks)
    'data-*',
    // Accessibility
    'role', 'aria-*', 'tabindex'
  ],
  // Force all links to open in new tab and add noopener for security
  ADD_ATTR: ['target', 'rel'],
  // Forbid dangerous protocols
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  // Remove empty elements that could be used for clickjacking
  KEEP_CONTENT: true
};

/**
 * Sanitize HTML content for safe rendering
 *
 * @param {string} html - The HTML string to sanitize
 * @param {Object} options - Optional DOMPurify configuration overrides
 * @returns {string} Sanitized HTML safe for dangerouslySetInnerHTML
 *
 * @example
 * // Basic usage
 * <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
 *
 * @example
 * // With custom config
 * const safeHtml = sanitizeHtml(content, { ALLOWED_TAGS: ['p', 'br'] });
 */
export function sanitizeHtml(html, options = {}) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const config = {
    ...DEFAULT_CONFIG,
    ...options
  };

  // Add security attributes to links
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      // Force external links to open safely
      if (node.getAttribute('href')?.startsWith('http')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    // Add loading="lazy" to images for performance
    if (node.tagName === 'IMG' && !node.getAttribute('loading')) {
      node.setAttribute('loading', 'lazy');
    }
  });

  const clean = DOMPurify.sanitize(html, config);

  // Remove hook after use to prevent memory leaks
  DOMPurify.removeHook('afterSanitizeAttributes');

  return clean;
}

/**
 * Strict sanitization that only allows basic text formatting
 * Use for user-generated content where rich formatting is not needed
 *
 * @param {string} html - The HTML string to sanitize
 * @returns {string} Sanitized HTML with only basic formatting
 */
export function sanitizeBasicHtml(html) {
  return sanitizeHtml(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u'],
    ALLOWED_ATTR: ['class']
  });
}

/**
 * Convert newlines to <br> tags and sanitize
 * Useful for plain text that needs line break preservation
 *
 * @param {string} text - Plain text with newlines
 * @returns {string} Sanitized HTML with <br> tags
 */
export function textToSafeHtml(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  // First escape any HTML entities, then convert newlines
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br/>');

  return escaped;
}

export default sanitizeHtml;
