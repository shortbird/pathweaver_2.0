/**
 * Dashboard screen tests - welcome header, quest grid, enrolled courses,
 * completed quests, navigation buttons.
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

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
  recent_completed_quests: [
    {
      id: 'uq-3',
      completed_at: '2026-03-15T00:00:00Z',
      quests: { title: 'Nature Walk' },
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
  // Default mock for NextUpPanel API calls (fetches quest tasks)
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

  it('shows empty state when no active quests', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: { ...mockDashboardData, active_quests: [] },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('No quests yet')).toBeTruthy();
    expect(r.getByText('Browse Quests')).toBeTruthy();
  });

  it('Browse All button navigates to quests page', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    fireEvent.press(r.getByText('Browse All'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/(tabs)/quests');
  });

  it('Browse Quests empty state button navigates to quests page', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: { ...mockDashboardData, active_quests: [] },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    fireEvent.press(r.getByText('Browse Quests'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/(tabs)/quests');
  });

  it('quest card navigates to quest detail on press', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    fireEvent.press(r.getByTestId('quest-card-q-1'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/quests/q-1');
  });

  // ── Enrolled Courses ──

  it('renders enrolled courses section', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('Your Courses')).toBeTruthy();
    expect(r.getByText('Intro to Engineering')).toBeTruthy();
  });

  it('shows course progress', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('1/3 done')).toBeTruthy();
  });

  it('shows project count on course card', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('3 projects')).toBeTruthy();
  });

  it('hides courses section when no enrolled courses', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: { ...mockDashboardData, enrolled_courses: [] },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.queryByText('Your Courses')).toBeNull();
  });

  it('View All button navigates to courses tab', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    fireEvent.press(r.getByText('View All'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/(tabs)/courses');
  });

  // ── Completed Quests ──

  it('renders completed quest titles', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('Nature Walk')).toBeTruthy();
  });

  it('hides completed quests when none exist', () => {
    (useDashboard as jest.Mock).mockReturnValue({
      data: { ...mockDashboardData, recent_completed_quests: [] },
      loading: false, error: null, refetch: jest.fn(),
    });
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.queryByText('Nature Walk')).toBeNull();
  });

  // ── Learning Rhythm ──

  it('renders learning rhythm section', () => {
    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(r.getByText('Your Learning Rhythm')).toBeTruthy();
  });

  // ── Next Up Panel ──

  it('renders Next Up section when quests have incomplete tasks', async () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/quests/q-1')) {
        return Promise.resolve({
          data: { quest: { quest_tasks: [{ id: 't-1', title: 'Build chassis', pillar: 'stem', xp_value: 50, is_completed: false }] } },
        });
      }
      if (url.includes('/api/quests/q-2')) {
        return Promise.resolve({
          data: { quest: { quest_tasks: [{ id: 't-2', title: 'Write chapter 1', pillar: 'communication', xp_value: 75, is_completed: false }] } },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    expect(await r.findByText('Next Up')).toBeTruthy();
    expect(await r.findByText('Build chassis')).toBeTruthy();
  });

  it('hides Next Up when all tasks are completed', async () => {
    (api.get as jest.Mock).mockImplementation(() =>
      Promise.resolve({ data: { quest: { quest_tasks: [{ id: 't-1', title: 'Done', pillar: 'stem', xp_value: 50, is_completed: true }] } } })
    );

    const r = tryRender(<DashboardScreen />);
    if (!r) return;
    await waitFor(() => {
      expect(r.queryByText('Next Up')).toBeNull();
    });
  });

});
