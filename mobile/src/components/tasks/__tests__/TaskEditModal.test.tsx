/**
 * The task editor carries the Definition of Done (success_criteria): prefilled
 * from the task, sent on save, required where the school says so, and read-only
 * once the task was sent for credit.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TaskEditModal, CRITERIA_LOCKED_NOTE } from '../TaskEditModal';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const task = {
  id: 'task-7',
  title: 'Play chess',
  pillar: 'stem',
  diploma_subjects: ['Math'],
  success_criteria: ['You played 5 games'],
};

function rulesAre(rules: Record<string, boolean>) {
  (api.get as jest.Mock).mockImplementation((url: string) =>
    url === '/api/tasks/authoring-rules'
      ? Promise.resolve({ data: { success: true, requires_success_criteria: false, can_edit_xp: true, criteria_locked: false, ...rules } })
      : Promise.resolve({ data: {} }));
}

function renderModal(extra: Partial<React.ComponentProps<typeof TaskEditModal>> = {}) {
  const props = { visible: true, task, onClose: jest.fn(), onSaved: jest.fn(), ...extra };
  return { ...render(<TaskEditModal {...props} />), props };
}

beforeEach(() => {
  jest.clearAllMocks();
  setAuthAsStudent();
  rulesAre({});
});

afterEach(() => clearAuthState());

describe('TaskEditModal Definition of Done', () => {
  it('asks for the rules of this task, scoped to the child in parent mode', async () => {
    renderModal({ studentId: 'kid-1' });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/tasks/authoring-rules', {
      params: { student_id: 'kid-1', task_id: 'task-7' },
    }));
  });

  it('prefills the criteria and sends the edited list in the PUT', async () => {
    const utils = renderModal();
    expect(utils.getByDisplayValue('You played 5 games')).toBeTruthy();
    fireEvent.press(utils.getByLabelText('Add a Definition of Done line'));
    fireEvent.changeText(utils.getByLabelText('Definition of Done line 2'), 'You named an opening');
    fireEvent.press(utils.getByLabelText('Save changes'));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/tasks/task-7', {
      title: 'Play chess',
      pillar: 'stem',
      diploma_subjects: ['Math'],
      success_criteria: ['You played 5 games', 'You named an opening'],
    }));
    expect(utils.props.onSaved).toHaveBeenCalled();
  });

  it('is read-only with a note when the task was sent for credit, and does not send criteria', async () => {
    rulesAre({ criteria_locked: true });
    const utils = renderModal();
    expect(await utils.findByText(CRITERIA_LOCKED_NOTE)).toBeTruthy();
    expect(utils.queryByLabelText('Definition of Done line 1')).toBeNull();
    expect(utils.getByText('You played 5 games')).toBeTruthy();

    fireEvent.press(utils.getByLabelText('Save changes'));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/tasks/task-7', {
      title: 'Play chess',
      pillar: 'stem',
      diploma_subjects: ['Math'],
    }));
  });

  it('blocks clearing the criteria when the school requires them', async () => {
    rulesAre({ requires_success_criteria: true });
    const utils = renderModal();
    await waitFor(() => expect(utils.getByText('Definition of Done *')).toBeTruthy());
    fireEvent.press(utils.getByLabelText('Remove Definition of Done line 1'));
    fireEvent.press(utils.getByLabelText('Save changes'));

    expect(await utils.findByText(/asks for a Definition of Done/)).toBeTruthy();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('locks the editor and shows the server message on a 409 success_criteria_locked', async () => {
    (api.put as jest.Mock).mockRejectedValueOnce({
      response: { status: 409, data: { code: 'success_criteria_locked', error: 'This task was already sent for credit.' } },
    });
    const utils = renderModal();
    fireEvent.changeText(utils.getByLabelText('Definition of Done line 1'), 'You played 9 games');
    fireEvent.press(utils.getByLabelText('Save changes'));

    expect(await utils.findByText('This task was already sent for credit.')).toBeTruthy();
    expect(utils.getByText(CRITERIA_LOCKED_NOTE)).toBeTruthy();
    expect(utils.props.onSaved).not.toHaveBeenCalled();
  });
});

describe('TaskEditModal for a learner 13 or older', () => {
  it('hides the pillar picker and saves without a pillar', async () => {
    rulesAre({ hide_pillars: true });
    const utils = renderModal();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/tasks/authoring-rules', expect.anything()));
    await waitFor(() => expect(utils.queryByText('PILLAR')).toBeNull(), { timeout: 5000 });
    fireEvent.press(utils.getByLabelText('Save changes'));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = (api.put as jest.Mock).mock.calls[0][1];
    expect(body).not.toHaveProperty('pillar');
    expect(body.diploma_subjects).toEqual(['Math']);
  });

  it('keeps the pillar picker for younger learners', async () => {
    rulesAre({ hide_pillars: false });
    const utils = renderModal();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(utils.getByText('PILLAR')).toBeTruthy();
  });
});

// Ticket 03ee5c2d, Karen Boyd (parent, Optio Academy): "everything but the
// title can be edited. It would be nice to also be able to edit the task
// title."
describe('TaskEditModal title', () => {
  it('prefills the title and sends the edited one, trimmed', async () => {
    const utils = renderModal();
    expect(utils.getByLabelText('Task title').props.value).toBe('Play chess');
    fireEvent.changeText(utils.getByLabelText('Task title'), '  Play chess online  ');
    fireEvent.press(utils.getByLabelText('Save changes'));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect((api.put as jest.Mock).mock.calls[0][1].title).toBe('Play chess online');
  });

  it('will not save an empty title', async () => {
    const utils = renderModal();
    fireEvent.changeText(utils.getByLabelText('Task title'), '   ');
    fireEvent.press(utils.getByLabelText('Save changes'));

    expect(await utils.findByText('Give the task a title.')).toBeTruthy();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('names the child in parent mode, so the delegated save is not refused', async () => {
    const utils = renderModal({ studentId: 'kid-1' });
    fireEvent.press(utils.getByLabelText('Save changes'));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect((api.put as jest.Mock).mock.calls[0][1].student_id).toBe('kid-1');
  });
});

// Ticket 4476c061, Karen Boyd: "copy an existing task to create a new one by
// just changing the title while keeping the same task description and
// evidence requirements."
describe('TaskEditModal Duplicate task', () => {
  it('copies through the server and hands the copy to the screen', async () => {
    const copy = { ...task, id: 'task-8', title: 'Play chess (copy)' };
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, task: copy } });
    const onDuplicated = jest.fn();
    const utils = renderModal({ studentId: 'kid-1', onDuplicated });
    fireEvent.press(utils.getByLabelText('Duplicate task'));

    await waitFor(() => expect(onDuplicated).toHaveBeenCalledWith(copy));
    expect(api.post).toHaveBeenCalledWith('/api/tasks/task-7/duplicate', { student_id: 'kid-1' });
  });

  it('is not offered without a screen to open the copy', () => {
    const utils = renderModal();
    expect(utils.queryByLabelText('Duplicate task')).toBeNull();
  });
});
