/**
 * PathwayCard tests - renders the credit split + requirements and fires onSelect.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PathwayCard } from '../PathwayCard';
import type { Pathway } from '../types';

const PATHWAY: Pathway = {
  key: 'traditional',
  name: 'Traditionally Aligned',
  tagline: 'Conventional high school structure',
  description: 'Mirrors a conventional high school transcript.',
  best_for: 'Families who want a traditional structure.',
  total_credits: 24,
  foundation_credits: 13,
  elective_credits: 11,
  requirements: [
    { key: 'language_arts', label: 'Language Arts', category: 'foundation', credits: 4, subject_key: 'language_arts' },
    { key: 'cte', label: 'CTE', category: 'elective', credits: 1, subject_key: 'cte' },
  ],
};

describe('PathwayCard', () => {
  it('renders name, tagline, credit split, and requirement labels', () => {
    const { getByText } = render(
      <PathwayCard pathway={PATHWAY} selected={false} onSelect={jest.fn()} />
    );
    expect(getByText('Traditionally Aligned')).toBeTruthy();
    expect(getByText('Conventional high school structure')).toBeTruthy();
    expect(getByText('13')).toBeTruthy(); // foundation credits
    expect(getByText('11')).toBeTruthy(); // elective credits
    expect(getByText('Language Arts')).toBeTruthy();
    expect(getByText('4 credits')).toBeTruthy();
    expect(getByText('1 credit')).toBeTruthy(); // singular
  });

  it('shows the unselected CTA and fires onSelect with the pathway key', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <PathwayCard pathway={PATHWAY} selected={false} onSelect={onSelect} />
    );
    fireEvent.press(getByText('Choose this pathway'));
    expect(onSelect).toHaveBeenCalledWith('traditional');
  });

  it('shows the selected state when selected', () => {
    const { getByText } = render(
      <PathwayCard pathway={PATHWAY} selected onSelect={jest.fn()} />
    );
    expect(getByText('Selected pathway')).toBeTruthy();
  });
});
