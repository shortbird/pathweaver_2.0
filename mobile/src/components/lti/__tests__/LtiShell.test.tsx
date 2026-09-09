/**
 * LtiShell tests — loading/error/content branching + title rendering.
 *
 * The frame-resize postMessage path is web-only and guarded by
 * Platform.OS; under jest (native preset) it's a no-op, so these tests
 * focus on the render contract every LTI page depends on.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { LtiShell } from '../LtiShell';
import { UIText } from '@/src/components/ui';

describe('LtiShell', () => {
  it('renders a spinner when loading (not children)', () => {
    const { getByTestId, queryByText } = render(
      <LtiShell loading>
        <UIText>hidden while loading</UIText>
      </LtiShell>,
    );
    expect(getByTestId('lti-shell-loading')).toBeTruthy();
    expect(queryByText('hidden while loading')).toBeNull();
  });

  it('renders the error message (not children) when error is set', () => {
    const { getByTestId, getByText, queryByText } = render(
      <LtiShell error="Launch token exchange failed.">
        <UIText>hidden on error</UIText>
      </LtiShell>,
    );
    expect(getByTestId('lti-shell-error')).toBeTruthy();
    expect(getByText('Launch token exchange failed.')).toBeTruthy();
    expect(queryByText('hidden on error')).toBeNull();
  });

  it('renders children when neither loading nor error', () => {
    const { getByText, queryByTestId } = render(
      <LtiShell>
        <UIText>quest content here</UIText>
      </LtiShell>,
    );
    expect(getByText('quest content here')).toBeTruthy();
    expect(queryByTestId('lti-shell-loading')).toBeNull();
    expect(queryByTestId('lti-shell-error')).toBeNull();
  });

  it('shows title/subtitle only in the content state', () => {
    const { getByText, rerender, queryByText } = render(
      <LtiShell title="Build Something" subtitle="Jane Doe">
        <UIText>body</UIText>
      </LtiShell>,
    );
    expect(getByText('Build Something')).toBeTruthy();
    expect(getByText('Jane Doe')).toBeTruthy();

    // Title is suppressed while loading (avoids a half-rendered header).
    rerender(
      <LtiShell title="Build Something" subtitle="Jane Doe" loading>
        <UIText>body</UIText>
      </LtiShell>,
    );
    expect(queryByText('Build Something')).toBeNull();
  });
});
