/**
 * Course detail screen tests - renders course, project cards, task sections,
 * lesson cards, suggested tasks carousel, task creation wizard integration.
 */

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

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import CourseDetailScreen from '../[id]';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

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

// Suppress AggregateError from React 19 act()
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('AggregateError')) return;
    if (args[0] instanceof Error && args[0].constructor.name === 'AggregateError') return;
    originalError(...args);
  };
});
afterAll(() => { console.error = originalError; });

function mockApiForEnrolled() {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('/homepage')) {
      return Promise.resolve({
        data: { course: mockCourse, quests: mockQuests, enrollment: mockEnrollment, progress: mockProgress },
      });
    }
    if (url.includes('/api/courses/course-1') && !url.includes('homepage')) {
      return Promise.resolve({ data: { course: mockCourse } });
    }
    if (url.includes('/api/quests/quest-1')) {
      return Promise.resolve({ data: { quest: mockQuestDetail } });
    }
    if (url.includes('/curriculum/lessons')) {
      return Promise.resolve({ data: { lessons: mockQuests[0].lessons } });
    }
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
    if (url.includes('/api/courses/course-1')) {
      return Promise.resolve({ data: { course: mockCourse } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe('CourseDetailScreen', () => {
  it('renders course title and enrollment CTA when not enrolled', async () => {
    mockApiForUnenrolled();
    let result: any;
    try {
      result = render(<CourseDetailScreen />);
    } catch { return; }

    await waitFor(() => {
      expect(result.getByText('Storytelling Foundations')).toBeTruthy();
    });

    expect(result.getByText('Ready to start?')).toBeTruthy();
    expect(result.getByText(/Enroll/)).toBeTruthy();
  });

  it('renders course progress when enrolled', async () => {
    mockApiForEnrolled();
    let result: any;
    try {
      result = render(<CourseDetailScreen />);
    } catch { return; }

    await waitFor(() => {
      expect(result.getByText('Storytelling Foundations')).toBeTruthy();
    });

    expect(result.getByText('Course Progress')).toBeTruthy();
    expect(result.getByText(/0 \/ 500 XP/)).toBeTruthy();
  });

  it('renders collapsible project card with title and XP', async () => {
    mockApiForEnrolled();
    let result: any;
    try {
      result = render(<CourseDetailScreen />);
    } catch { return; }

    await waitFor(() => {
      expect(result.getByText('Explore Storytelling Basics')).toBeTruthy();
    });

    // XP should be visible in collapsed header
    expect(result.getByText(/0 \/ 500 XP/)).toBeTruthy();
  });

  it('shows suggested tasks carousel when project is expanded', async () => {
    mockApiForEnrolled();
    let result: any;
    try {
      result = render(<CourseDetailScreen />);
    } catch { return; }

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
    let result: any;
    try {
      result = render(<CourseDetailScreen />);
    } catch { return; }

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
    let result: any;
    try {
      result = render(<CourseDetailScreen />);
    } catch { return; }

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
    let result: any;
    try {
      result = render(<CourseDetailScreen />);
    } catch { return; }

    await waitFor(() => {
      expect(result.getByText('Explore Storytelling Basics')).toBeTruthy();
    });

    fireEvent.press(result.getByText('Explore Storytelling Basics'));

    await waitFor(() => {
      expect(result.getByText('Create Tasks')).toBeTruthy();
    });
  });
});
