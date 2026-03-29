/**
 * RhythmBadge tests - verifies 3-state mapping from backend granular states.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { RhythmBadge } from '../RhythmBadge';

describe('RhythmBadge', () => {
  // ── State mapping ──

  it('maps in_flow to Active', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'in_flow', state_display: 'In Flow', message: '' }} compact />
    );
    expect(getByText('Active')).toBeTruthy();
  });

  it('maps building to Building', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'building', state_display: 'Building', message: '' }} compact />
    );
    expect(getByText('Building')).toBeTruthy();
  });

  it('maps finding_rhythm to Building', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'finding_rhythm', state_display: 'Finding Rhythm', message: '' }} compact />
    );
    expect(getByText('Building')).toBeTruthy();
  });

  it('maps fresh_return to Building', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'fresh_return', state_display: 'Fresh Return', message: '' }} compact />
    );
    expect(getByText('Building')).toBeTruthy();
  });

  it('maps resting to Resting', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'resting', state_display: 'Resting', message: '' }} compact />
    );
    expect(getByText('Resting')).toBeTruthy();
  });

  it('maps ready_to_begin to Resting', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'ready_to_begin', state_display: 'Ready to Begin', message: '' }} compact />
    );
    expect(getByText('Resting')).toBeTruthy();
  });

  it('maps ready_when_you_are to Resting', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'ready_when_you_are', state_display: 'Ready When You Are', message: '' }} compact />
    );
    expect(getByText('Resting')).toBeTruthy();
  });

  it('defaults to Resting for unknown backend state', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'some_new_state', state_display: 'New', message: '' }} compact />
    );
    expect(getByText('Resting')).toBeTruthy();
  });

  it('defaults to Resting when rhythm is null', () => {
    const { getByText } = render(<RhythmBadge rhythm={null} compact />);
    expect(getByText('Resting')).toBeTruthy();
  });

  // ── Render modes ──

  it('renders compact mode with label only', () => {
    const { getByText, queryByText } = render(
      <RhythmBadge rhythm={{ state: 'in_flow', state_display: 'In Flow', message: 'Great job!' }} compact />
    );
    expect(getByText('Active')).toBeTruthy();
    expect(queryByText('Great job!')).toBeNull();
  });

  it('renders full mode with label and message', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'in_flow', state_display: 'In Flow', message: 'Great job!' }} />
    );
    expect(getByText('Active')).toBeTruthy();
    expect(getByText('Great job!')).toBeTruthy();
  });
});
