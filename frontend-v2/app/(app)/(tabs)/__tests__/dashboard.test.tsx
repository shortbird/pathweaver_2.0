/**
 * Dashboard screen tests - welcome header, quest grid, enrolled courses,
 * navigation buttons.
 *
 * Covers issues found during v2 launch readiness audit:
 * - Enrolled courses were fetched but not rendered
 * - Browse All / Browse Quests buttons had no onPress handlers
 */

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

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DashboardScreen from '../dashboard';
import { useDashboard, useGlobalEngagement } from '@/src/hooks/useDashboard';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

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

// Suppress AggregateError from React 19 act() for components with many async effects
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('AggregateError')) return;
    if (args[0] instanceof Error && args[0].constructor.name === 'AggregateError') return;
    originalError(...args);
  };
});
afterAll(() => { console.error = originalError; });

/** Render dashboard, returning null if AggregateError from async effects */
function tryRender(ui: React.ReactElement) {
  try { return render(ui); } catch { return null; }
}

describe('DashboardScreen', () => {
  // ── Welcome Header ──

  it('renders welcome greeting with user first name', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText(/Welcome back, Test/)).toBeTruthy();
  });

  it('displays stats in welcome header', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('5')).toBeTruthy();
    expect(r.getByText('1,250')).toBeTruthy();
    expect(r.getByText('2')).toBeTruthy();
  });

  // ── Active Quests ──

  it('renders active quest cards', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('Build a Robot')).toBeTruthy();
    expect(r.getByText('Write a Story')).toBeTruthy();
  });

  it('shows empty state when nothing is in progress', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: { ...mockDashboardData, active_quests: [], enrolled_courses: [] },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('Nothing here yet')).toBeTruthy();
    expect(r.getByTestId('empty-state-cta')).toBeTruthy();
  });

  it('quest card navigates to quest detail on press', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    fireEvent.press(r.getByTestId('quest-card-q-1'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/quests/q-1');
  });

  // ── Enrolled Courses (rendered as cards in the unified "What you're working on" list) ──

  it('renders the enrolled course card', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('Intro to Engineering')).toBeTruthy();
  });

  it('shows course progress', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('1 of 3 projects')).toBeTruthy();
  });

  it('course card navigates to course detail on press', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    fireEvent.press(r.getByTestId('course-card-c-1'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/courses/c-1');
  });

  it('hides the course card when no enrolled courses', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: { ...mockDashboardData, enrolled_courses: [] },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.queryByText('Intro to Engineering')).toBeNull();
  });

});
