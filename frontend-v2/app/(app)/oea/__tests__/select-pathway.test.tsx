/**
 * Pathway selection screen tests - loads pathways, preselects current enrollment,
 * and saves a choice (then navigates back).
 */
jest.mock('@/src/services/api', () => require('@/src/__tests__/utils/mockApi').mockApiModule());

const mockSearchParams = { studentId: 'stu-1', studentName: 'Ada' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockSearchParams,
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SelectPathwayScreen from '../select-pathway';
import { oeaAPI } from '@/src/services/api';
import { router } from 'expo-router';

const PATHWAYS = [
  {
    key: 'open_balanced', name: 'Open and Balanced', tagline: 'Maximum flexibility',
    description: 'Light foundation.', best_for: 'Flexible families.',
    total_credits: 24, foundation_credits: 12, elective_credits: 12,
    requirements: [{ key: 'math', label: 'Math', category: 'foundation', credits: 3, subject_key: 'math' }],
  },
  {
    key: 'college_bound', name: 'College Bound', tagline: 'College-aligned',
    description: 'Heavy foundation.', best_for: 'College-bound students.',
    total_credits: 24, foundation_credits: 19, elective_credits: 5,
    requirements: [{ key: 'math', label: 'Math', category: 'foundation', credits: 4, subject_key: 'math' }],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  (oeaAPI.pathways as jest.Mock).mockResolvedValue({ data: { pathways: PATHWAYS } });
  (oeaAPI.studentEnrollment as jest.Mock).mockResolvedValue({ data: { enrollment: null } });
  (oeaAPI.selectPathway as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('SelectPathwayScreen', () => {
  it('renders the available pathways for the student', async () => {
    const { getByText } = render(<SelectPathwayScreen />);
    await waitFor(() => expect(getByText('Open and Balanced')).toBeTruthy());
    expect(getByText('College Bound')).toBeTruthy();
    expect(getByText("Choose Ada's pathway")).toBeTruthy();
  });

  it('saves the chosen pathway and navigates back', async () => {
    const { getAllByText } = render(<SelectPathwayScreen />);
    await waitFor(() => expect(getAllByText('Choose this pathway').length).toBe(2));

    // Press the second card's CTA (College Bound).
    fireEvent.press(getAllByText('Choose this pathway')[1]);

    await waitFor(() =>
      expect(oeaAPI.selectPathway).toHaveBeenCalledWith('stu-1', 'college_bound')
    );
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('preselects the student\'s current pathway', async () => {
    (oeaAPI.studentEnrollment as jest.Mock).mockResolvedValue({
      data: { enrollment: { pathway_key: 'college_bound' } },
    });
    const { getByText } = render(<SelectPathwayScreen />);
    await waitFor(() => expect(getByText('Selected pathway')).toBeTruthy());
  });
});
