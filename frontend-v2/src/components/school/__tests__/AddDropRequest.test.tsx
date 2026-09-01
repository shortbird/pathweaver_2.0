/**
 * The add/drop request families file from the mobile schedule.
 *
 * iCreate, 2026-09-01: "have an add/drop button that sends a request to say
 * what changes they want to make to that child's schedule. Then we get the task
 * in the task center." What the office receives has to be actionable on its
 * own — a coordinator cannot enter "switch her out of the Tuesday art one" into
 * the SIS without calling back — so these tests pin the body it files, not just
 * that a request went out.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AddDropRequest from '../AddDropRequest';
import api from '@/src/services/api';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('../../ui', () => ({
  ...jest.requireActual('../../ui'),
  toast: { success: (...a: any[]) => mockToast.success(...a), error: (...a: any[]) => mockToast.error(...a) },
}));

const POTTERY = {
  id: 'c1', name: 'Pottery', meetings: [{ day_of_week: 2, start_time: '09:00', end_time: '10:30', location: null }],
};
const WOODSHOP = {
  id: 'c2', name: 'Woodshop', meetings: [{ day_of_week: 3, start_time: '13:00', end_time: '14:00', location: null }],
};

const renderIt = (props: Partial<React.ComponentProps<typeof AddDropRequest>> = {}) => render(
  <AddDropRequest
    studentId="kid-1"
    studentName="Charlotte Myers"
    organizationId="org-1"
    enrolled={[POTTERY]}
    deadline="2026-09-08"
    {...props}
  />,
);

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: { classes: [POTTERY, WOODSHOP] } });
  (api.post as jest.Mock).mockResolvedValue({ data: { submission: { id: 'sub-1' } } });
});

describe('filing a request', () => {
  it('names the class, the day and the time on every line', async () => {
    const { getByLabelText, getByText } = renderIt();
    fireEvent.press(getByLabelText('Request an add/drop'));

    // The catalog is fetched when the sheet opens, not on every schedule render.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/parent/classes',
      { params: { organization_id: 'org-1' } }));

    fireEvent.press(getByLabelText('Pottery'));      // drop
    await waitFor(() => expect(getByLabelText('Woodshop')).toBeTruthy());
    fireEvent.press(getByLabelText('Woodshop'));     // add
    fireEvent.changeText(
      getByLabelText('Anything else the office should know?'), 'Mornings work better.');
    fireEvent.press(getByLabelText('Send request'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/parent/forms', {
      organization_id: 'org-1',
      form_type: 'schedule_change',
      title: 'Add/drop — Charlotte Myers',
      body: 'Drop: Pottery (Tuesday 9:00 AM – 10:30 AM)\n'
        + 'Add: Woodshop (Wednesday 1:00 PM – 2:00 PM)\n'
        + '\nMornings work better.',
      student_user_id: 'kid-1',
    }));
    expect(getByText('Your add/drop request is in')).toBeTruthy();
  });

  it('sends nothing until a class is picked', async () => {
    const { getByLabelText, getByText } = renderIt();
    fireEvent.press(getByLabelText('Request an add/drop'));
    await waitFor(() => expect(getByText('Pick at least one class to add or drop.')).toBeTruthy());

    fireEvent.press(getByLabelText('Send request'));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('a class the child is already in is not offered as an add', async () => {
    const { getByLabelText, queryAllByLabelText } = renderIt();
    fireEvent.press(getByLabelText('Request an add/drop'));
    await waitFor(() => expect(queryAllByLabelText('Woodshop').length).toBe(1));
    // Pottery appears once — as a drop — not again in the add list.
    expect(queryAllByLabelText('Pottery').length).toBe(1);
  });

  it('keeps the sheet usable when the catalog cannot be loaded', async () => {
    // Dropping is the half that still works, and it is the half families use
    // most; the note carries anything else.
    (api.get as jest.Mock).mockRejectedValue(new Error('offline'));
    const { getByLabelText, getByText } = renderIt();
    fireEvent.press(getByLabelText('Request an add/drop'));
    await waitFor(() => expect(getByText(/No open classes to pick from/)).toBeTruthy());

    fireEvent.press(getByLabelText('Pottery'));
    fireEvent.press(getByLabelText('Send request'));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect((api.post as jest.Mock).mock.calls[0][1].body).toBe(
      'Drop: Pottery (Tuesday 9:00 AM – 10:30 AM)');
  });

  it('reports the server refusal instead of claiming it sent', async () => {
    (api.post as jest.Mock).mockRejectedValue({
      response: { data: { error: 'The add/drop window is closed — contact the school office' } },
    });
    const { getByLabelText, queryByText } = renderIt();
    fireEvent.press(getByLabelText('Request an add/drop'));
    await waitFor(() => expect(getByLabelText('Pottery')).toBeTruthy());
    fireEvent.press(getByLabelText('Pottery'));
    fireEvent.press(getByLabelText('Send request'));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(
      'The add/drop window is closed — contact the school office'));
    expect(queryByText('Your add/drop request is in')).toBeNull();
  });
});

describe('a request already in', () => {
  it('offers a follow-up rather than the same button again', () => {
    const { getByText, queryByLabelText } = renderIt({ pending: true });
    expect(getByText('Your add/drop request is in')).toBeTruthy();
    expect(queryByLabelText('Request an add/drop')).toBeNull();
    expect(getByText('Send another request')).toBeTruthy();
  });
});
