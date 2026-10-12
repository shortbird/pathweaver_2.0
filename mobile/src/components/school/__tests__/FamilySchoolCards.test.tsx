/**
 * What the school keeps for one family, on the school hub.
 *
 * Volunteer hours -- iCreate 2fab910a/9db5bde3: "I know you just added a
 * tracker to track hours and also comments for it... I'm not seeing it from
 * the parent side. Is there a way to make it so that the parents can also see
 * the notes and the hours?"
 *
 * Who to contact -- ticket c58b7c0b (iCreate, org admin): "On parent
 * dashboards, could we create a section where there is who to contact info?
 * ... e.g. a question about something in the building message Becky; late
 * pick-up; general concern about classes message Sharmaine."
 */

import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { VolunteerHoursCard, WhoToContactCard, telUrl } from '../FamilySchoolCards';
import { readVolunteerHours } from '@/src/hooks/useFamilyVolunteerHours';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
const mockOpen = jest.fn(async (_url: string) => true);
jest.mock('@/src/utils/linking', () => ({ safeOpenURL: (u: string) => mockOpen(u) }));
const mockGet = jest.fn();
jest.mock('@/src/services/api', () => ({
  __esModule: true,
  ...jest.requireActual('@/src/services/api'),
  default: { get: (...a: unknown[]) => mockGet(...a) },
}));

beforeEach(() => jest.clearAllMocks());

describe('VolunteerHoursCard', () => {
  it('asks the parent endpoint and shows the hours, the date and the note', async () => {
    mockGet.mockResolvedValue({ data: { volunteer_hours: 12.5, updated_at: '2026-10-01T12:00:00Z', note: 'Fall fair', shown: true } });
    render(<VolunteerHoursCard organizationId="org-1" />);
    expect(await screen.findByTestId('family-volunteer-hours')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/sis/parent/volunteer-hours', { params: { organization_id: 'org-1' } });
    expect(screen.getByText('12.5')).toBeTruthy();
    expect(screen.getByText(/^as of /)).toBeTruthy();
    expect(screen.getByTestId('family-volunteer-hours-note')).toBeTruthy();
  });

  it('draws nothing when the server says not shown, or on a failure', async () => {
    mockGet.mockResolvedValue({ data: { volunteer_hours: 0, shown: false } });
    const { unmount } = render(<VolunteerHoursCard organizationId="org-1" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByTestId('family-volunteer-hours')).toBeNull();
    unmount();
    mockGet.mockRejectedValue(new Error('404'));
    render(<VolunteerHoursCard organizationId="org-1" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('family-volunteer-hours')).toBeNull();
  });

  it('reads the server shape', () => {
    expect(readVolunteerHours({ volunteer_hours: '4', note: '  ', shown: true }))
      .toEqual({ hours: 4, updatedAt: null, note: null, shown: true });
    expect(readVolunteerHours(null).shown).toBe(false);
  });
});

const CONTACTS = [
  { topic: 'Building questions', name: 'Becky Lane', phone: '(801) 555-0100', email: null, staff_user_id: 'becky', message_user_id: 'becky' },
  { topic: 'Late pick-up', name: 'Front desk', phone: null, email: 'desk@icreate.test', staff_user_id: null, message_user_id: null },
];

describe('WhoToContactCard', () => {
  it('lists each topic and person, with call, email, and Message only for staff', () => {
    render(<WhoToContactCard contacts={CONTACTS} />);
    expect(screen.getAllByTestId('who-to-contact-row')).toHaveLength(2);
    expect(screen.getByText('Building questions')).toBeTruthy();
    expect(screen.getByText('Becky Lane')).toBeTruthy();
    expect(screen.getByTestId('who-to-contact-message-0')).toBeTruthy();
    expect(screen.queryByTestId('who-to-contact-message-1')).toBeNull();

    fireEvent.press(screen.getByTestId('who-to-contact-call-0'));
    expect(mockOpen).toHaveBeenCalledWith('tel:8015550100');
    fireEvent.press(screen.getByTestId('who-to-contact-email-1'));
    expect(mockOpen).toHaveBeenCalledWith('mailto:desk@icreate.test');
    fireEvent.press(screen.getByTestId('who-to-contact-message-0'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/messages?user=becky');
  });

  it('draws nothing for an empty list', () => {
    render(<WhoToContactCard contacts={[]} />);
    expect(screen.queryByTestId('who-to-contact')).toBeNull();
  });

  it('dials digits only', () => {
    expect(telUrl('+1 (801) 555-0100')).toBe('tel:+18015550100');
  });
});
