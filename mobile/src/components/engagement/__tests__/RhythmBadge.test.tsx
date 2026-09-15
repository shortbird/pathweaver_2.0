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
      <RhythmBadge rhythm={{ state: 'in_flow', state_display: 'In Flow', message: '', pattern_description: '' }} compact />
    );
    expect(getByText('Active')).toBeTruthy();
  });

  it('maps building to Building', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'building', state_display: 'Building', message: '', pattern_description: '' }} compact />
    );
    expect(getByText('Building')).toBeTruthy();
  });

  it('maps finding_rhythm to Building', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'finding_rhythm', state_display: 'Finding Rhythm', message: '', pattern_description: '' }} compact />
    );
    expect(getByText('Building')).toBeTruthy();
  });

  it('maps fresh_return to Building', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'fresh_return', state_display: 'Fresh Return', message: '', pattern_description: '' }} compact />
    );
    expect(getByText('Building')).toBeTruthy();
  });

  it('maps resting to Resting', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'resting', state_display: 'Resting', message: '', pattern_description: '' }} compact />
    );
    expect(getByText('Resting')).toBeTruthy();
  });

  it('maps ready_to_begin to Resting', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'ready_to_begin', state_display: 'Ready to Begin', message: '', pattern_description: '' }} compact />
    );
    expect(getByText('Resting')).toBeTruthy();
  });

  it('maps ready_when_you_are to Resting', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'ready_when_you_are', state_display: 'Ready When You Are', message: '', pattern_description: '' }} compact />
    );
    expect(getByText('Resting')).toBeTruthy();
  });

  it('defaults to Resting for unknown backend state', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'some_new_state', state_display: 'New', message: '', pattern_description: '' }} compact />
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
      <RhythmBadge rhythm={{ state: 'in_flow', state_display: 'In Flow', message: 'Great job!', pattern_description: '' }} compact />
    );
    expect(getByText('Active')).toBeTruthy();
    expect(queryByText('Great job!')).toBeNull();
  });

  it('renders full mode with label and message', () => {
    const { getByText } = render(
      <RhythmBadge rhythm={{ state: 'in_flow', state_display: 'In Flow', message: 'Great job!', pattern_description: '' }} />
    );
    expect(getByText('Active')).toBeTruthy();
    expect(getByText('Great job!')).toBeTruthy();
  });
});

describe('RhythmBadge seven-day map', () => {
  const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

  it('draws the last seven days, oldest first, from whatever days it is given', () => {
    const { getByTestId } = render(
      <RhythmBadge
        rhythm={{ state: 'in_flow', state_display: 'In Flow', message: '', pattern_description: '' }}
        days={[{ date: day(0), intensity: 3 }, { date: day(2), intensity: 1 }, { date: day(30), intensity: 4 }]}
      />
    );
    const map = getByTestId('mini-heat-map');
    expect(map.children).toHaveLength(7);
    expect(getByTestId(`heat-${day(0)}`)).toBeTruthy();
    expect(getByTestId(`heat-${day(6)}`)).toBeTruthy();
  });

  it('label={false} keeps the icon and the map and moves the state to the accessibility label', () => {
    const { queryByText, getByLabelText, getByTestId } = render(
      <RhythmBadge rhythm={{ state: 'building', state_display: 'Building', message: '', pattern_description: '' }} days={[]} label={false} />
    );
    expect(queryByText('Building')).toBeNull();
    expect(getByLabelText('Building')).toBeTruthy();
    expect(getByTestId('mini-heat-map')).toBeTruthy();
  });
});
