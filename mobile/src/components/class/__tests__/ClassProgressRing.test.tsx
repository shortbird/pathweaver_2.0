/**
 * ClassProgressRing tests — credit rollover math.
 *
 * 0/1000      -> "Progress" header, ring shows 0
 * 500/1000    -> "Progress" header, ring shows 500
 * 1000/1000   -> "1 credit" header, ring shows full
 * 1340/1000   -> "1 credit" header, ring shows 340 toward next
 * 2000/1000   -> "2 credits" header (multiple)
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ClassProgressRing } from '../ClassProgressRing';

describe('ClassProgressRing', () => {
  it('shows Progress header with current XP at 0', () => {
    const { getByText } = render(<ClassProgressRing approvedXp={0} />);
    expect(getByText('Progress')).toBeTruthy();
    expect(getByText('0')).toBeTruthy();
    expect(getByText('/ 1000 XP')).toBeTruthy();
  });

  it('shows Progress header with partial XP', () => {
    const { getByText } = render(<ClassProgressRing approvedXp={500} />);
    expect(getByText('Progress')).toBeTruthy();
    expect(getByText('500')).toBeTruthy();
  });

  it('rolls over to "1 credit" after hitting 1000', () => {
    const { getByText } = render(<ClassProgressRing approvedXp={1000} />);
    expect(getByText('1 credit')).toBeTruthy();
  });

  it('shows excess XP toward the next credit', () => {
    const { getByText } = render(<ClassProgressRing approvedXp={1340} />);
    expect(getByText('1 credit')).toBeTruthy();
    expect(getByText('340')).toBeTruthy();
  });

  it('pluralizes credits at 2+', () => {
    const { getByText } = render(<ClassProgressRing approvedXp={2000} />);
    expect(getByText('2 credits')).toBeTruthy();
  });
});
