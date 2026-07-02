/**
 * Credit dashboard tests - renders progress + GPA, adds a course, and grades one.
 */
jest.mock('@/src/services/api', () => require('@/src/__tests__/utils/mockApi').mockApiModule());

const mockSearchParams = { studentId: 'stu-1', studentName: 'Ada' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockSearchParams,
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CreditsScreen from '../credits';
import { oeaAPI } from '@/src/services/api';
import { router } from 'expo-router';

const RESPONSE = {
  enrollment: { id: 'e1', student_id: 'stu-1', pathway_key: 'open_balanced' },
  credits: [
    {
      id: 'c1', student_id: 'stu-1', requirement_key: 'math', category: 'foundation',
      subject_key: 'math', course_name: 'Algebra I', credits: 3, status: 'in_progress',
      letter_grade: null, is_weighted: false, completed_at: null, quest_id: 'q-algebra',
    },
  ],
  progress: {
    pathway_key: 'open_balanced', total_required: 24, total_earned: 3, total_in_progress: 3,
    foundation_required: 12, foundation_earned: 3, elective_required: 12, elective_earned: 0,
    percent_complete: 12.5, is_complete: false,
    requirements: [
      { key: 'math', label: 'Math', category: 'foundation', subject_key: 'math', required: 3, earned: 3, in_progress: 3, is_met: true },
      { key: 'student_choice', label: 'Student Choice', category: 'elective', subject_key: 'electives', required: 12, earned: 0, in_progress: 0, is_met: false },
    ],
  },
  gpa: { unweighted: 4, weighted: 4.5, graded_credits: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  (oeaAPI.credits as jest.Mock).mockResolvedValue({ data: RESPONSE });
  (oeaAPI.addCredit as jest.Mock).mockResolvedValue({ data: { success: true } });
  (oeaAPI.updateCredit as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('CreditsScreen', () => {
  it('renders progress, GPA, requirements and courses', async () => {
    const { getByText, getAllByText } = render(<CreditsScreen />);
    await waitFor(() => expect(getByText('3 of 24 credits')).toBeTruthy());
    expect(getByText('4.5')).toBeTruthy();           // weighted GPA
    expect(getByText('Math')).toBeTruthy();
    expect(getByText('Student Choice')).toBeTruthy();
    expect(getByText('Algebra I')).toBeTruthy();
    expect(getAllByText('Add course').length).toBe(2); // one per requirement
  });

  it('adds a course to a requirement slot', async () => {
    const { getByText, getAllByText, getByPlaceholderText } = render(<CreditsScreen />);
    await waitFor(() => expect(getAllByText('Add course').length).toBe(2));

    fireEvent.press(getAllByText('Add course')[0]); // Math
    await waitFor(() => expect(getByText('Add course — Math')).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText('e.g. Algebra I'), 'Geometry');
    fireEvent.press(getByText('Add'));

    await waitFor(() =>
      expect(oeaAPI.addCredit).toHaveBeenCalledWith('stu-1', {
        requirement_key: 'math', course_name: 'Geometry', credits: 1,
      })
    );
  });

  it('opens the linked student quest for a course', async () => {
    const { getByText } = render(<CreditsScreen />);
    await waitFor(() => expect(getByText('Algebra I')).toBeTruthy());

    fireEvent.press(getByText('Algebra I'));               // open edit modal
    await waitFor(() => expect(getByText('Add work evidence & learning logs')).toBeTruthy());
    fireEvent.press(getByText('Add work evidence & learning logs'));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/(app)/parent/quest/stu-1/q-algebra'));
    // Already linked — no need to create a quest.
    expect(oeaAPI.ensureCreditQuest).not.toHaveBeenCalled();
  });

  it('creates the quest on demand for a credit without one', async () => {
    (oeaAPI.credits as jest.Mock).mockResolvedValue({
      data: { ...RESPONSE, credits: [{ ...RESPONSE.credits[0], quest_id: null }] },
    });
    (oeaAPI.ensureCreditQuest as jest.Mock).mockResolvedValue({ data: { quest_id: 'q-new' } });

    const { getByText } = render(<CreditsScreen />);
    await waitFor(() => expect(getByText('Algebra I')).toBeTruthy());
    fireEvent.press(getByText('Algebra I'));
    await waitFor(() => expect(getByText('Add work evidence & learning logs')).toBeTruthy());
    fireEvent.press(getByText('Add work evidence & learning logs'));

    await waitFor(() => expect(oeaAPI.ensureCreditQuest).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/(app)/parent/quest/stu-1/q-new'));
  });

  it('marks a course complete with a grade', async () => {
    const { getByText } = render(<CreditsScreen />);
    await waitFor(() => expect(getByText('Algebra I')).toBeTruthy());

    fireEvent.press(getByText('Algebra I'));           // open edit modal
    await waitFor(() => expect(getByText('Edit course')).toBeTruthy());
    fireEvent.press(getByText('Mark complete'));       // reveals grade selector
    fireEvent.press(getByText('A'));                   // pick grade A
    fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(oeaAPI.updateCredit).toHaveBeenCalledWith('c1', expect.objectContaining({
        status: 'complete', letter_grade: 'A',
      }))
    );
  });
});
