/**
 * The school hub, as one tabbed page (2026-09-18).
 *
 * Covered: the strip lists the tabs the school and member earn, tapping one
 * swaps the body in place, ?tab= lands on it, a tab that does not exist for
 * this member falls back to Feed, and "Coming up" hands off to the Calendar
 * tab instead of pushing a screen.
 */

import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import SchoolScreen from '../index';
import { useAuthStore } from '@/src/stores/authStore';

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

const EVENT = { id: 'e1', title: 'Open house', description: null, location: null, start_at: '2099-08-20T16:00:00Z', end_at: null, all_day: false };
let mockHub: any;
jest.mock('@/src/hooks/useSchool', () => ({
  ...jest.requireActual('@/src/hooks/useSchool'),
  useSchool: () => ({ name: 'iCreate' }),
  useSchoolHub: () => mockHub,
}));

let mockResources: any[] = [];
jest.mock('@/src/hooks/useSchoolResources', () => ({
  useSchoolResources: () => ({ resources: mockResources, loading: false, refresh: jest.fn() }),
}));

// The tab bodies are tested on their own; here they only need to be
// recognisable.
jest.mock('@/src/components/school/ScheduleTab', () => ({
  ScheduleTab: ({ initialStudentId }: { initialStudentId?: string | null }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text testID="school-tab-schedule">schedule:{initialStudentId || ''}</Text>;
  },
}));
jest.mock('@/src/components/school/CalendarTab', () => ({
  CalendarTab: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text testID="school-tab-calendar">calendar</Text>;
  },
}));
jest.mock('@/src/components/school/CarpoolTab', () => ({
  CarpoolTab: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text testID="school-tab-carpool">carpool</Text>;
  },
}));
jest.mock('@/src/components/school/TodoTab', () => ({
  TodoTab: ({ audience, initialTaskId }: { audience: string; initialTaskId?: string | null }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text testID="school-tab-todo">todo:{audience}:{initialTaskId || ''}</Text>;
  },
}));
jest.mock('@/src/components/school/DocumentsTab', () => ({
  DocumentsTab: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text testID="school-tab-documents">documents</Text>;
  },
}));

const guardianHub = (over: any = {}) => ({
  org: { organization_id: 'org-1', organization_name: 'iCreate', is_guardian: true, post_registration_flow: 'schedule', logo_url: null },
  feed: { announcements: [], events: [EVENT], lost_found: [], recognition: [], carpool: [] },
  messages: [],
  carpool: { posts: [], canPost: true, canModerate: false, post: jest.fn(), remove: jest.fn() },
  loading: false,
  refreshing: false,
  refresh: jest.fn(),
  schoolName: 'iCreate',
  isGuardian: true,
  ...over,
});

const tabLabels = () => screen.getAllByRole('tab').map((t) => t.props.accessibilityState);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockResources = [{ id: 'd1', title: 'Handbook' }];
  mockHub = guardianHub();
});

describe('the tab strip', () => {
  it('lists Feed, To do, Schedule, Calendar, Carpool, Documents for an iCreate parent', () => {
    render(<SchoolScreen />);
    for (const key of ['feed', 'todo', 'schedule', 'calendar', 'carpool', 'documents']) {
      expect(screen.getByTestId(`school-tab-${key}-button`)).toBeTruthy();
    }
    expect(screen.queryByText('Absence')).toBeNull();
    expect(screen.queryByText('Billing')).toBeNull();
    expect(screen.queryByText('Forms')).toBeNull();
    // Lost & found is on the page as a feed filter, not as a tab.
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(screen.getByTestId('feed-filter-lostfound')).toBeTruthy();
  });

  it('opens on the Feed', () => {
    render(<SchoolScreen />);
    expect(screen.getByTestId('school-tab-feed')).toBeTruthy();
    expect(screen.queryByTestId('school-tab-schedule')).toBeNull();
    expect(tabLabels()[0]).toEqual({ selected: true });
  });

  it('swaps the body in place when a tab is tapped', () => {
    render(<SchoolScreen />);
    fireEvent.press(screen.getByTestId('school-tab-schedule-button'));
    expect(screen.getByTestId('school-tab-schedule')).toBeTruthy();
    expect(screen.queryByTestId('school-tab-feed')).toBeNull();
    fireEvent.press(screen.getByTestId('school-tab-documents-button'));
    expect(screen.getByTestId('school-tab-documents')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lands on the tab a link asks for, carrying the child along', () => {
    mockParams = { tab: 'schedule', student: 'kid-2' };
    render(<SchoolScreen />);
    expect(screen.getByText('schedule:kid-2')).toBeTruthy();
  });

  it('follows ?tab= when it changes while the page is already open', () => {
    mockParams = {};
    const view = render(<SchoolScreen />);
    expect(screen.getByTestId('school-tab-feed')).toBeTruthy();
    mockParams = { tab: 'calendar' };
    view.rerender(<SchoolScreen />);
    expect(screen.getByTestId('school-tab-calendar')).toBeTruthy();
  });

  it('falls back to Feed when the tab asked for does not exist for this member', () => {
    mockParams = { tab: 'schedule' };
    mockHub = guardianHub({ org: { ...guardianHub().org, is_guardian: false } });
    render(<SchoolScreen />);
    expect(screen.getByTestId('school-tab-feed')).toBeTruthy();
    expect(screen.queryByTestId('school-tab-schedule-button')).toBeNull();
  });

  it('hides the strip entirely when Feed is the only tab', () => {
    mockResources = [];
    mockHub = guardianHub({ feed: null, org: { ...guardianHub().org, is_guardian: false } });
    render(<SchoolScreen />);
    expect(screen.queryByTestId('school-tabs')).toBeNull();
    expect(screen.getByTestId('school-tab-feed')).toBeTruthy();
  });
});

describe('the To do tab', () => {
  afterEach(() => {
    act(() => { useAuthStore.setState({ user: null }); });
  });

  it('sits right after Feed, and opens the family list for a guardian', () => {
    render(<SchoolScreen />);
    const keys = screen.getAllByRole('tab').map((t) => t.props.testID);
    expect(keys.slice(0, 2)).toEqual(['school-tab-feed-button', 'school-tab-todo-button']);
    fireEvent.press(screen.getByTestId('school-tab-todo-button'));
    expect(screen.getByText('todo:family:')).toBeTruthy();
  });

  it('appears for a student, who is a member without being a guardian', () => {
    act(() => { useAuthStore.setState({ user: { id: 's1', role: 'student' } as any }); });
    mockHub = guardianHub({ org: { ...guardianHub().org, is_guardian: false } });
    mockParams = { tab: 'todo' };
    render(<SchoolScreen />);
    expect(screen.getByText('todo:student:')).toBeTruthy();
    expect(screen.queryByTestId('school-tab-schedule-button')).toBeNull();
  });

  it('is absent for a member who is neither a guardian nor a student', () => {
    act(() => { useAuthStore.setState({ user: { id: 'a1', role: 'org_managed', org_role: 'advisor' } as any }); });
    mockHub = guardianHub({ org: { ...guardianHub().org, is_guardian: false } });
    render(<SchoolScreen />);
    expect(screen.queryByTestId('school-tab-todo-button')).toBeNull();
  });

  it('opens on the task a notification names', () => {
    mockParams = { tab: 'todo', task: 't-9' };
    render(<SchoolScreen />);
    expect(screen.getByText('todo:family:t-9')).toBeTruthy();
  });
});

describe('the Feed tab', () => {
  it('hands "Coming up" off to the Calendar tab rather than pushing a screen', () => {
    render(<SchoolScreen />);
    fireEvent.press(screen.getByTestId('coming-up-see-all'));
    expect(screen.getByTestId('school-tab-calendar')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('offers Lost & found as a filter, and the office line when it is empty', () => {
    render(<SchoolScreen />);
    fireEvent.press(screen.getByTestId('feed-filter-lostfound'));
    expect(screen.getByTestId('feed-filter-empty')).toBeTruthy();
    expect(screen.queryByTestId('coming-up')).toBeNull();
  });

  it('shows a goals-flow school its Goal Setting door as a web chip, not a tab', () => {
    mockHub = guardianHub({ org: { ...guardianHub().org, post_registration_flow: 'goals' } });
    render(<SchoolScreen />);
    fireEvent.press(screen.getByTestId('school-chip-goals'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/(app)/view-on-web',
      params: expect.objectContaining({ path: '/family/goals' }),
    }));
    expect(screen.queryByText('Goal Setting', { exact: false })).toBeTruthy();
  });
});
