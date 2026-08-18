/**
 * The body text scale, pinned.
 *
 * iCreate's families reported the app as simply too small to read on a phone
 * (2026-08-18). It was: 1,392 of 1,811 sized UIText calls — 77% — rendered at
 * 12px or 14px, against an iOS body default of 17px.
 *
 * The whole app moves through UIText's sizeMap, so these tests guard that one
 * mapping rather than any screen. If someone shrinks the scale back, or points
 * a size at the raw Tailwind classes again, this fails.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { UIText } from '../Text';

/** The class each size must resolve to, and the px it is defined as in
 *  tailwind.config.js. Both halves matter: the class name is what the
 *  component emits, the px is what the reader actually gets. */
const SCALE: Record<string, { className: string; px: number }> = {
  xs: { className: 'text-body-xs', px: 13 },
  sm: { className: 'text-body-sm', px: 15 },
  md: { className: 'text-body-md', px: 17 },
  lg: { className: 'text-body-lg', px: 20 },
};

describe('UIText body scale', () => {
  it.each(Object.entries(SCALE))(
    'size="%s" maps to the body scale, not the raw Tailwind default',
    (size, { className }) => {
      const { getByText } = render(<UIText size={size as any}>hello</UIText>);
      const cls = getByText('hello').props.className as string;
      expect(cls).toContain(className);
      // The old scale is what made it unreadable — make sure we did not
      // silently fall back to it.
      expect(cls).not.toMatch(/\btext-(xs|sm|base|lg)\b/);
    },
  );

  it('defaults to md, the body size', () => {
    const { getByText } = render(<UIText>hello</UIText>);
    expect(getByText('hello').props.className).toContain('text-body-md');
  });

  it('still applies caller classNames on top', () => {
    const { getByText } = render(<UIText size="sm" className="text-optio-purple">x</UIText>);
    const cls = getByText('x').props.className as string;
    expect(cls).toContain('text-body-sm');
    expect(cls).toContain('text-optio-purple');
  });
});

describe('tailwind body sizes', () => {
  const tw = require('../../../../tailwind.config.js');
  const sizes = tw.theme.extend.fontSize;

  it.each(Object.entries(SCALE))('body-%s is the expected size', (size, { px }) => {
    expect(sizes[`body-${size}`]).toBe(`${px}px`);
  });

  it('no body size drops below 13px', () => {
    // 13px is the floor this pass established for anything a user reads.
    for (const [name, value] of Object.entries(sizes)) {
      expect(parseInt(String(value), 10)).toBeGreaterThanOrEqual(13);
    }
  });

  it('body text is at least as large as the platform default it replaces', () => {
    // md is the body size; iOS ships 17px and Material 16sp.
    expect(parseInt(sizes['body-md'], 10)).toBeGreaterThanOrEqual(16);
  });
});
