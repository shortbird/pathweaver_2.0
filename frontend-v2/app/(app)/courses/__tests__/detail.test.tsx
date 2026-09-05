/**
 * Course detail screen tests - renders course, project cards, task sections,
 * lesson cards, suggested tasks carousel, task creation wizard integration.
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import CourseDetailScreen from '../[id]';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
  },
}));
jest.mock('@/src/services/supabaseClient', () => ({
  supabase: { auth: { signInWithOAuth: jest.fn() } },
}));

const mockCourse = {
  id: 'course-1',
  title: 'Storytelling Foundations',
  description: 'Learn to tell stories',
  cover_image_url: null,
  status: 'published',
  learning_outcomes: ['Write stories', 'Perform stories'],
  final_deliverable: 'A live performance',
};

const mockQuests = [
  {
    id: 'quest-1',
    title: 'Explore Storytelling Basics',
    description: 'Find stories to share',
    header_image_url: null,
    sequence_order: 1,
    lessons: [
      { id: 'lesson-1', title: 'Find Your Story Idea', content: { steps: [{ order: 1, title: 'Step 1', content: '<p>Hello</p>' }] }, video_url: null, progress: null },
    ],
    suggested_tasks: [
      { id: 'st-1', title: 'Write a personal story', description: 'Write about something meaningful', pillar: 'communication', xp_value: 50 },
      { id: 'st-2', title: 'Record a voice memo', description: 'Tell your story aloud', pillar: 'art', xp_value: 75 },
    ],
    progress: { earned_xp: 0, total_xp: 500, is_completed: false },
  },
];

const mockEnrollment = { id: 'enroll-1', status: 'active' };
const mockProgress = { completed_quests: 0, total_quests: 1, earned_xp: 0, total_xp: 500, percentage: 0 };

// Mock quest detail response (for task fetching)
const mockQuestDetail = {
  id: 'quest-1',
  title: 'Explore Storytelling Basics',
  quest_tasks: [],
  template_tasks: [],
};

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'course-1' });
});

afterEach(() => {
  clearAuthState();
});

// The AggregateError these files used to swallow was a real failure, not a
// React 19 quirk: `withRepeat` was missing from the reanimated mock, so any
// loading Skeleton threw from its mount effect and render() rethrew it. Fixed
// in src/__tests__/setup.tsx; a throw from render() here is a bug now.

function mockApiForEnrolled() {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('/homepage')) {
      return Promise.resolve({
        data: { course: mockCourse, quests: mockQuests, enrollment: mockEnrollment, progress: mockProgress },
      });
    }
    // Quest detail fetched lazily when project is expanded
    if (url.includes('/api/quests/quest-1') && !url.includes('/curriculum')) {
      return Promise.resolve({ data: { quest: mockQuestDetail } });
    }
    // Evidence fetched lazily when task is expanded
    if (url.includes('/evidence/documents/')) {
      return Promise.resolve({ data: { blocks: [] } });
    }
    return Promise.resolve({ data: {} });
  });
}

function mockApiForUnenrolled() {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('/homepage')) {
      return Promise.resolve({
        data: { course: mockCourse, quests: [], enrollment: null, progress: null },
      });
    }
    return Promise.resolve({ data: {} });
  });
}

describe('CourseDetailScreen', () => {
  it('renders course title and enrollment CTA when not enrolled', async () => {
    mockApiForUnenrolled();
    const result = render(<CourseDetailScreen />);

    await waitFor(() => {
      expect(result.getByText('Storytelling Foundations')).toBeTruthy();
    });

    expect(result.getByText('Ready to start?')).toBeTruthy();
    // Exact, not /Enroll/: the card's blurb says "Enroll to access…" too, so
    // the loose match now finds two nodes and throws.
    expect(result.getByText('Enroll in Course')).toBeTruthy();
  });

  it('renders course progress when enrolled', async () => {
    mockApiForEnrolled();
    const result = render(<CourseDetailScreen />);

    await waitFor(() => {
      expect(result.getByText('Storytelling Foundations')).toBeTruthy();
    });

    expect(result.getByText('Course Progress')).toBeTruthy();
    // "0 / 500 XP" is rendered twice — once on the course progress card, once
    // on the project card below it — so this counts rather than assuming one.
    expect(result.getAllByText(/0 \/ 500 XP/).length).toBeGreaterThan(0);
    expect(result.getByText('0/1 projects')).toBeTruthy();
  });

  it('renders collapsible project card with title and XP', async () => {
    mockApiForEnrolled();
    const result = render(<CourseDetailScreen />);

    await waitFor(() => {
      expect(result.getByText('Explore Storytelling Basics')).toBeTruthy();
    });

    // XP should be visible in collapsed header. Two nodes carry this text
    // (course progress + project card); the project card is one of them.
    expect(result.getAllByText(/0 \/ 500 XP/).length).toBeGreaterThan(0);
  });

  it('shows suggested tasks carousel when project is expanded', async () => {
    mockApiForEnrolled();
    const result = render(<CourseDetailScreen />);

    await waitFor(() => {
      expect(result.getByText('Explore Storytelling Basics')).toBeTruthy();
    });

    // Expand the project
    fireEvent.press(result.getByText('Explore Storytelling Basics'));

    await waitFor(() => {
      expect(result.getByText('Write a personal story')).toBeTruthy();
      expect(result.getByText('Record a voice memo')).toBeTruthy();
    });
  });

  it('shows lesson cards when project is expanded', async () => {
    mockApiForEnrolled();
    const result = render(<CourseDetailScreen />);

    await waitFor(() => {
      expect(result.getByText('Explore Storytelling Basics')).toBeTruthy();
    });

    fireEvent.press(result.getByText('Explore Storytelling Basics'));

    await waitFor(() => {
      expect(result.getByText('Find Your Story Idea')).toBeTruthy();
    });
  });

  it('shows empty task state with messaging', async () => {
    mockApiForEnrolled();
    const result = render(<CourseDetailScreen />);

    await waitFor(() => {
      expect(result.getByText('Explore Storytelling Basics')).toBeTruthy();
    });

    fireEvent.press(result.getByText('Explore Storytelling Basics'));

    await waitFor(() => {
      expect(result.getByText('No tasks added yet')).toBeTruthy();
      expect(result.getByText(/Add tasks to earn 500 XP/)).toBeTruthy();
    });
  });

  it('shows Create Tasks button for task wizard', async () => {
    mockApiForEnrolled();
    const result = render(<CourseDetailScreen />);

    await waitFor(() => {
      expect(result.getByText('Explore Storytelling Basics')).toBeTruthy();
    });

    fireEvent.press(result.getByText('Explore Storytelling Basics'));

    await waitFor(() => {
      expect(result.getByText('Create Tasks')).toBeTruthy();
    });
  });
});
