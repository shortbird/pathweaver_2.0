/**
 * Dashboard screen tests - welcome header, quest grid, enrolled courses,
 * navigation buttons.
 *
 * Covers issues found during v2 launch readiness audit:
 * - Enrolled courses were fetched but not rendered
 * - Browse All / Browse Quests buttons had no onPress handlers
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DashboardScreen from '../dashboard';
import { useDashboard, useGlobalEngagement } from '@/src/hooks/useDashboard';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/hooks/useDashboard', () => ({
  useDashboard: jest.fn(),
  useGlobalEngagement: jest.fn(),
}));
jest.mock('@/src/components/engagement/MiniHeatmap', () => ({
  MiniHeatmap: () => null,
}));
jest.mock('@/src/components/engagement/EngagementCalendar', () => ({
  EngagementCalendar: () => null,
}));
jest.mock('@/src/components/engagement/RhythmBadge', () => ({
  RhythmBadge: () => null,
}));
jest.mock('@/src/components/layouts/MobileHeader', () => ({
  PageHeader: () => null,
}));
jest.mock('@/src/components/capture/CaptureSheet', () => ({
  CaptureSheet: () => null,
}));
jest.mock('@/src/components/capture/CaptureModal', () => ({
  CaptureModal: () => null,
}));
jest.mock('@/src/components/diploma/DiplomaCreditTracker', () => ({
  DiplomaCreditTracker: () => null,
}));

const mockRouter = require('expo-router').router;

const mockDashboardData = {
  active_quests: [
    {
      id: 'uq-1',
      quests: { id: 'q-1', title: 'Build a Robot', description: 'Robotics project', header_image_url: null },
    },
    {
      id: 'uq-2',
      quests: { id: 'q-2', title: 'Write a Story', description: 'Creative writing', header_image_url: null },
    },
  ],
  enrolled_courses: [
    {
      id: 'c-1',
      title: 'Intro to Engineering',
      cover_image_url: null,
      quest_count: 3,
      progress: { completed_quests: 1, total_quests: 3 },
    },
  ],
  stats: {
    total_xp: 1250,
    completed_quests_count: 5,
    completed_tasks_count: 22,
    level: null,
  },
};

const mockEngagement = {
  calendar: { days: [], first_activity_date: '2026-01-01', weeks_active: 8 },
  rhythm: { state: 'steady', state_display: 'Steady', message: 'Nice rhythm', pattern_description: 'Regular activity' },
  summary: { active_days_last_week: 3, active_days_last_month: 12, last_activity_date: '2026-03-27', total_activities: 50 },
};

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useDashboard as jest.Mock).mockReturnValue({
    data: mockDashboardData, loading: false, error: null, refetch: jest.fn(),
  });
  (useGlobalEngagement as jest.Mock).mockReturnValue({
    data: mockEngagement, loading: false,
  });
  // Default mock for card API calls (ClassCard class-progress, quest detail).
  (api.get as jest.Mock).mockResolvedValue({ data: { quest: { quest_tasks: [] } } });
});

afterEach(() => {
  clearAuthState();
});

// The AggregateError these files used to swallow was a real failure, not a
// React 19 quirk: `withRepeat` was missing from the reanimated mock, so any
// loading Skeleton threw from its mount effect and render() rethrew it. Fixed
// in src/__tests__/setup.tsx; a throw from render() here is a bug now.

function tryRender(ui: React.ReactElement) {
  return render(ui);
}

describe('DashboardScreen', () => {
  // ── Welcome Header ──

  it('renders welcome greeting with user first name', () => {
    const r = tryRender(<DashboardScreen />);
    expect(r.getByText(/Welcome back, Test/)).toBeTruthy();
  });

  it('displays stats in welcome header', () => {
    const r = tryRender(<DashboardScreen />);
    expect(r.getByText('5')).toBeTruthy();
    expect(r.getByText('1,250')).toBeTruthy();
    expect(r.getByText('2')).toBeTruthy();
  });

  // ── Active Quests ──

  it('renders active quest cards', () => {
    const r = tryRender(<DashboardScreen />);
    expect(r.getByText('Build a Robot')).toBeTruthy();
    expect(r.getByText('Write a Story')).toBeTruthy();
  });

  it('shows empty state when nothing is in progress', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: { ...mockDashboardData, active_quests: [], enrolled_courses: [] },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    expect(r.getByText('Nothing here yet')).toBeTruthy();
    expect(r.getByTestId('empty-state-cta')).toBeTruthy();
  });

  it('quest card navigates to quest detail on press', () => {
    const r = tryRender(<DashboardScreen />);
    fireEvent.press(r.getByTestId('quest-card-q-1'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/quests/q-1');
  });

  // ── Assigned Class Quests (org class assignments not yet started) ──

  it('renders assigned class quest cards with class name', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: {
        ...mockDashboardData,
        assigned_class_quests: [
          {
            class_id: 'cls-1',
            class_name: 'Homeroom A',
            due_date: null,
            quest: { id: 'q-9', title: 'Volcano Project', description: 'Science', header_image_url: null },
          },
        ],
      },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    expect(r.getByText('Volcano Project')).toBeTruthy();
    expect(r.getByText('Assigned')).toBeTruthy();
    expect(r.getByText(/Homeroom A/)).toBeTruthy();
  });

  it('assigned quest card navigates to quest detail on press', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: {
        ...mockDashboardData,
        assigned_class_quests: [
          { class_id: 'cls-1', class_name: 'Homeroom A', due_date: null, quest: { id: 'q-9', title: 'Volcano Project' } },
        ],
      },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    fireEvent.press(r.getByTestId('assigned-quest-card-q-9'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/quests/q-9');
  });

  it('assigned quests keep the empty state hidden even with no active quests', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: {
        ...mockDashboardData,
        active_quests: [],
        enrolled_courses: [],
        assigned_class_quests: [
          { class_id: 'cls-1', class_name: 'Homeroom A', due_date: null, quest: { id: 'q-9', title: 'Volcano Project' } },
        ],
      },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    expect(r.queryByTestId('empty-state-cta')).toBeNull();
    expect(r.getByText('Volcano Project')).toBeTruthy();
  });

  // ── Enrolled Courses (rendered as cards in the unified "What you're working on" list) ──

  it('renders the enrolled course card', () => {
    const r = tryRender(<DashboardScreen />);
    expect(r.getByText('Intro to Engineering')).toBeTruthy();
  });

  it('shows course progress', () => {
    const r = tryRender(<DashboardScreen />);
    expect(r.getByText('1 of 3 projects')).toBeTruthy();
  });

  it('course card navigates to course detail on press', () => {
    const r = tryRender(<DashboardScreen />);
    fireEvent.press(r.getByTestId('course-card-c-1'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/courses/c-1');
  });

  it('hides the course card when no enrolled courses', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: { ...mockDashboardData, enrolled_courses: [] },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    expect(r.queryByText('Intro to Engineering')).toBeNull();
  });

});
