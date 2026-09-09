/**
 * Parent quest view - the kid's own quest screen, rendered for a parent.
 *
 * What these tests pin down is the part that is easy to get wrong once one
 * component serves two viewers: the reads carry `student_id`, and the controls
 * on screen are exactly the ones the backend's write rules allow. A managed
 * dependent's parent may finish and remove tasks; the parent of a student with
 * their own login may only add to their work.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import ParentQuestViewPage from '../[studentId]/[questId]';
import api from '@/src/services/api';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

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

const baseQuest = {
  id: 'quest-1',
  title: 'Bridge Building',
  description: 'Design and test a bridge',
  big_idea: 'Design and test a bridge',
  header_image_url: null,
  image_url: null,
  quest_type: 'standard',
  approach_examples: [],
  allow_custom_tasks: true,
  is_active: true,
  user_enrollment: { id: 'enroll-1' },
  completed_enrollment: null,
  quest_tasks: [
    {
      id: 'task-1', title: 'Sketch three designs', pillar: 'stem',
      xp_value: 50, is_completed: false, order_index: 0, is_required: false,
    },
  ],
  template_tasks: [],
  sample_tasks: [],
  preset_tasks: [],
  has_template_tasks: false,
  progress: null,
};

/** The delegated read's answer for a managed under-13 dependent. */
const dependentContext = {
  student_id: 'kid-1',
  student_name: 'Ada',
  is_dependent: true,
  can_add_tasks: true,
  can_complete_tasks: true,
  can_remove_tasks: true,
};

/** ...and for a student who keeps their own login (an approved link). */
const linkedContext = { ...dependentContext, is_dependent: false, can_complete_tasks: false, can_remove_tasks: false };

function mockQuestRead(viewer_context: typeof dependentContext, quest: any = baseQuest) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url.startsWith('/api/quests/quest-1/engagement')) {
      return Promise.resolve({ data: { engagement: null } });
    }
    if (url.startsWith('/api/evidence/documents/')) {
      return Promise.resolve({ data: { blocks: [] } });
    }
    return Promise.resolve({ data: { quest: { ...quest, viewer_context } } });
  });
}

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ studentId: 'kid-1', questId: 'quest-1' });
  mockQuestRead(dependentContext);
});

afterEach(() => {
  clearAuthState();
});

// This used to swallow an AggregateError out of render() and return null, and
// every test below then returned early -- the whole file passed without
// asserting anything. The AggregateError was React 19 rethrowing a real
// failure: `withRepeat` was missing from the reanimated mock, so the loading
// Skeleton threw from its mount effect. Fixed in src/__tests__/setup.tsx.
// Render plainly; a throw here is a bug, not weather.
function renderScreen() {
  return render(<ParentQuestViewPage />);
}

describe('ParentQuestViewPage', () => {
  it("reads the CHILD's copy of the quest, not the parent's", async () => {
    const result = renderScreen();

    await waitFor(() => expect(result.getByText('Bridge Building')).toBeTruthy());
    expect(api.get).toHaveBeenCalledWith('/api/quests/quest-1', {
      params: { student_id: 'kid-1' },
    });
  });

  it('names whose quest it is', async () => {
    const result = renderScreen();

    await waitFor(() => expect(result.getByText("Ada's quest")).toBeTruthy());
  });

  it('offers the task wizard - the same one the kid uses', async () => {
    const result = renderScreen();

    await waitFor(() => expect(result.getByTestId('add-task-btn')).toBeTruthy());
  });

  it("still offers the wizard for a student with their own login", async () => {
    mockQuestRead(linkedContext);
    const result = renderScreen();

    // The 403 this used to be: task authoring was gated on is_dependent, so a
    // Hearthwood family whose tie is an approved link had no way in at all.
    await waitFor(() => expect(result.getByTestId('add-task-btn')).toBeTruthy());
  });

  it('shows the quest description the learner sees', async () => {
    const result = renderScreen();

    await waitFor(() => expect(result.getByText('Design and test a bridge')).toBeTruthy());
  });

  it("lets a dependent's parent finish and remove a task", async () => {
    const result = renderScreen();

    await waitFor(() => expect(result.getByText('Sketch three designs')).toBeTruthy());
    fireEvent.press(result.getByText('Sketch three designs'));

    await waitFor(() => expect(result.getByText('Complete task')).toBeTruthy());
    expect(result.getByText('Remove from quest')).toBeTruthy();
  });

  it('offers to generate tasks when the quest is empty', async () => {
    // A parent creates a quest for her kid and lands here with nothing on it.
    // The offer has to be ON this screen: hiding AI generation behind the small
    // "Add Task" pill read as the app failing to generate anything at all.
    mockQuestRead(linkedContext, { ...baseQuest, quest_tasks: [] });
    const result = renderScreen();

    await waitFor(() => expect(result.getByTestId('empty-generate-tasks-btn')).toBeTruthy());
    expect(result.getByText('Write my own')).toBeTruthy();
  });

  it('opens the wizard on its AI step for a quest the parent just created', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      studentId: 'kid-1', questId: 'quest-1', new: '1',
    });
    mockQuestRead(linkedContext, { ...baseQuest, quest_tasks: [] });
    const result = renderScreen();

    // 'Personalize' is the wizard's header on the ai-personalize step, and it
    // appears nowhere else — reaching it with no press means the screen opened
    // the wizard and skipped the method chooser.
    await waitFor(() => expect(result.getByText('Personalize')).toBeTruthy());
  });

  it('says a collapsed task can be opened when it has more to read', async () => {
    mockQuestRead(linkedContext, {
      ...baseQuest,
      quest_tasks: [{ ...baseQuest.quest_tasks[0], description: 'Three sketches, front and side.' }],
    });
    const result = renderScreen();

    // The report this fixes: "I cannot click on it to read the whole thing."
    await waitFor(() => expect(result.getByText('Tap to read the whole task')).toBeTruthy());
    expect(result.getByText('Three sketches, front and side.')).toBeTruthy();
  });

  it('withholds both from the parent of a student with their own login', async () => {
    mockQuestRead(linkedContext);
    const result = renderScreen();

    await waitFor(() => expect(result.getByText('Sketch three designs')).toBeTruthy());
    fireEvent.press(result.getByText('Sketch three designs'));

    await waitFor(() => expect(result.queryByText('Complete task')).toBeNull());
    expect(result.queryByText('Remove from quest')).toBeNull();
    // Not a silent gap - say who finishes the work.
    expect(
      result.getByText('Anything you add here is theirs to finish — they mark the task complete.'),
    ).toBeTruthy();
  });
});
