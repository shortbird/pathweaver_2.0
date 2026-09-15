/**
 * The quest screen, rendered for a parent in family scope: the kid's own
 * screen, pointed at the kid.
 *
 * What these tests pin down is the part that is easy to get wrong once one
 * component serves two viewers: the reads carry `student_id` (the child in
 * stores/familyStore), and the controls on screen are exactly the ones the
 * backend's write rules allow. A managed dependent's parent may finish and
 * remove tasks; the parent of a student with their own login may only add to
 * their work. Until 2026-09-15 this was a second route with the child in its
 * path; the assertions are unchanged.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import QuestDetailScreen from '../[id]';
import api from '@/src/services/api';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { useFamilyStore } from '@/src/stores/familyStore';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/utils/alerts', () => ({
  showAlert: jest.fn(),
  confirmAlert: jest.fn().mockResolvedValue(true),
}));
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

/** ...and for a student who keeps their own login (an approved link), as a
 *  backend from BEFORE 2026-09-15 answered it: adding only. The backend now
 *  grants every verified guardian the full set; this shape is what a preview
 *  build sees against a stale backend, and the screen must still respect it. */
const linkedContext = { ...dependentContext, is_dependent: false, can_complete_tasks: false, can_remove_tasks: false };

/** The same student, as the backend answers since 2026-09-15 (Paige's case:
 *  her son is 12 and has his own login; she may finish his tasks). */
const linkedContextNow = { ...dependentContext, is_dependent: false };

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
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'quest-1' });
  useFamilyStore.setState({
    parentId: 'parent-1',
    children: [createMockChild({ id: 'kid-1', first_name: 'Ada', display_name: 'Ada' })],
    selectedChildId: 'kid-1',
  });
  mockQuestRead(dependentContext);
});

afterEach(() => {
  clearAuthState();
  useFamilyStore.getState().clear();
});

// This used to swallow an AggregateError out of render() and return null, and
// every test below then returned early -- the whole file passed without
// asserting anything. The AggregateError was React 19 rethrowing a real
// failure: `withRepeat` was missing from the reanimated mock, so the loading
// Skeleton threw from its mount effect. Fixed in src/__tests__/setup.tsx.
// Render plainly; a throw here is a bug, not weather.
function renderScreen() {
  return render(<QuestDetailScreen />);
}

describe('QuestDetailScreen in family scope', () => {
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

  it("lets a parent END the child's quest, work kept, beside the destructive remove", async () => {
    // "Remove quest" deletes the enrollment and reverses XP. A parent tidying
    // up a quest her son has moved on from wants the gentle exit: end it,
    // keep the work. Same route as the student's own End, with student_id.
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });
    const result = renderScreen();

    await waitFor(() => expect(result.getByText('End quest')).toBeTruthy());
    expect(result.getByText('Remove quest')).toBeTruthy();
    fireEvent.press(result.getByText('End quest'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/end', { student_id: 'kid-1' });
    });
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
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'quest-1', new: '1' });
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

  it('lets the parent of a student with their own login finish and remove a task', async () => {
    mockQuestRead(linkedContextNow);
    const result = renderScreen();

    await waitFor(() => expect(result.getByText('Sketch three designs')).toBeTruthy());
    fireEvent.press(result.getByText('Sketch three designs'));

    await waitFor(() => expect(result.getByText('Complete task')).toBeTruthy());
    expect(result.getByText('Remove from quest')).toBeTruthy();
    expect(result.queryByText('Anything you add here is theirs to finish — they mark the task complete.')).toBeNull();
  });

  it('hides complete and remove when an older backend says no', async () => {
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
