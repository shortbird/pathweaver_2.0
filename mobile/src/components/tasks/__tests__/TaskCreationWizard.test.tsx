/**
 * The write-your-own step of the task wizard.
 *
 * A hand-typed task used to go through onAcceptTask (the AI-suggestion accept
 * path), which stored it as an AI suggestion and copied it into the shared AI
 * task library. It now goes to onAddManualTask, carries a Definition of Done,
 * and respects the learner's school rules from /api/tasks/authoring-rules.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TaskCreationWizard } from '../TaskCreationWizard';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

function rulesAre(rules: { requires_success_criteria?: boolean; can_edit_xp?: boolean; hide_pillars?: boolean }) {
  (api.get as jest.Mock).mockImplementation((url: string) =>
    url === '/api/tasks/authoring-rules'
      ? Promise.resolve({ data: { success: true, requires_success_criteria: false, can_edit_xp: true, ...rules } })
      : Promise.resolve({ data: {} }));
}

function renderWizard(extra: Partial<React.ComponentProps<typeof TaskCreationWizard>> = {}) {
  const props = {
    questId: 'quest-1',
    questTitle: 'Chess',
    open: true,
    onClose: jest.fn(),
    onGenerate: jest.fn().mockResolvedValue([]),
    onAcceptTask: jest.fn().mockResolvedValue(undefined),
    onAddManualTask: jest.fn().mockResolvedValue({ success: true }),
    onAnalyzeManualTask: jest.fn(),
    ...extra,
  };
  const utils = render(<TaskCreationWizard {...props} />);
  fireEvent.press(utils.getByText('Write My Own'));
  return { ...utils, props };
}

function fillBasics(utils: ReturnType<typeof render>) {
  fireEvent.changeText(
    utils.getByPlaceholderText('e.g., Interview my grandparent about their childhood'),
    'Play chess',
  );
  fireEvent.changeText(
    utils.getByPlaceholderText("Describe what you'll do, how you'll explore, and what you hope to discover..."),
    'Games against the club app',
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setAuthAsStudent();
  rulesAre({});
});

afterEach(() => clearAuthState());

describe('TaskCreationWizard write-your-own', () => {
  it('sends a hand-written task to onAddManualTask with its Definition of Done, not onAcceptTask', async () => {
    const utils = renderWizard();
    fillBasics(utils);
    fireEvent.changeText(utils.getByLabelText('Definition of Done line 1'), '  You played 5 games ');
    fireEvent.press(utils.getByLabelText('Add a Definition of Done line'));
    fireEvent.changeText(utils.getByLabelText('Definition of Done line 2'), 'You wrote down one lesson from each');
    fireEvent.press(utils.getByLabelText('Add Task'));

    await waitFor(() => expect(utils.props.onAddManualTask).toHaveBeenCalledTimes(1));
    expect(utils.props.onAddManualTask).toHaveBeenCalledWith({
      title: 'Play chess',
      description: 'Games against the club app',
      pillar: 'stem',
      xp_value: 100,
      success_criteria: ['You played 5 games', 'You wrote down one lesson from each'],
    });
    expect(utils.props.onAcceptTask).not.toHaveBeenCalled();
  });

  it('reads the rules for the CHILD in parent mode', async () => {
    renderWizard({ studentId: 'kid-1' });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/tasks/authoring-rules', {
      params: { student_id: 'kid-1' },
    }));
  });

  it('blocks submit when the school requires a Definition of Done and none is written', async () => {
    rulesAre({ requires_success_criteria: true });
    const utils = renderWizard();
    await waitFor(() => expect(utils.getByText('Definition of Done *')).toBeTruthy());
    fillBasics(utils);
    fireEvent.press(utils.getByLabelText('Add Task'));

    expect(await utils.findByText(/asks for a Definition of Done/)).toBeTruthy();
    expect(utils.props.onAddManualTask).not.toHaveBeenCalled();
  });

  it('shows the server error when the server says a Definition of Done is required', async () => {
    const onAddManualTask = jest.fn().mockRejectedValue({
      response: { status: 400, data: { code: 'success_criteria_required', error: 'Add a Definition of Done.' } },
    });
    const utils = renderWizard({ onAddManualTask });
    fillBasics(utils);
    fireEvent.press(utils.getByLabelText('Add Task'));
    expect(await utils.findByText('Add a Definition of Done.')).toBeTruthy();
  });

  it('"Help me finish this" fills the empty description, the criteria and the XP', async () => {
    const onAnalyzeManualTask = jest.fn().mockResolvedValue({
      success: true,
      description: 'Play five games and reflect.',
      success_criteria: ['You played 5 games', 'You named one opening you used'],
      suggested_xp: 150,
      xp_rationale: 'Five full games is a large task.',
    });
    const utils = renderWizard({ onAnalyzeManualTask });
    const help = utils.getByLabelText('Help me finish this');
    fireEvent.changeText(
      utils.getByPlaceholderText('e.g., Interview my grandparent about their childhood'), 'Pl',
    );
    fireEvent.press(help);
    expect(onAnalyzeManualTask).not.toHaveBeenCalled();

    fireEvent.changeText(
      utils.getByPlaceholderText('e.g., Interview my grandparent about their childhood'), 'Play chess',
    );
    fireEvent.press(utils.getByLabelText('Help me finish this'));

    await waitFor(() => expect(utils.getByDisplayValue('Play five games and reflect.')).toBeTruthy());
    expect(onAnalyzeManualTask).toHaveBeenCalledWith({ title: 'Play chess', pillar: 'stem' });
    expect(utils.getByDisplayValue('You named one opening you used')).toBeTruthy();
    expect(utils.getByText('Five full games is a large task.')).toBeTruthy();

    // Still editable: change a line, then save.
    fireEvent.changeText(utils.getByLabelText('Definition of Done line 1'), 'You played 6 games');
    fireEvent.press(utils.getByLabelText('Add Task'));
    await waitFor(() => expect(utils.props.onAddManualTask).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Play five games and reflect.',
      xp_value: 150,
      success_criteria: ['You played 6 games', 'You named one opening you used'],
    })));
  });

  it('keeps a description the family wrote and leaves XP alone when the school sets it', async () => {
    rulesAre({ can_edit_xp: false });
    const onAnalyzeManualTask = jest.fn().mockResolvedValue({
      description: 'AI text', success_criteria: ['You played 5 games'], suggested_xp: 200,
    });
    const utils = renderWizard({ onAnalyzeManualTask });
    await waitFor(() => expect(utils.queryByText('Task Size *')).toBeNull());
    fillBasics(utils);
    fireEvent.press(utils.getByLabelText('Help me finish this'));

    await waitFor(() => expect(utils.getByDisplayValue('You played 5 games')).toBeTruthy());
    expect(utils.getByDisplayValue('Games against the club app')).toBeTruthy();
    fireEvent.press(utils.getByLabelText('Add Task'));
    await waitFor(() => expect(utils.props.onAddManualTask).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Games against the club app', xp_value: 100 }),
    ));
  });

  it('shows the server error when AI help is refused', async () => {
    const onAnalyzeManualTask = jest.fn().mockRejectedValue({
      response: { status: 403, data: { error: 'AI is turned off for this student.' } },
    });
    const utils = renderWizard({ onAnalyzeManualTask });
    fillBasics(utils);
    fireEvent.press(utils.getByLabelText('Help me finish this'));
    expect(await utils.findByText('AI is turned off for this student.')).toBeTruthy();
  });
});


describe('13 and older pick a diploma subject, not a pillar', () => {
  it('shows only the subject picker and sends the subject with no pillar', async () => {
    rulesAre({ hide_pillars: true });
    const utils = renderWizard();
    await waitFor(() => expect(utils.getByText('Diploma subject *')).toBeTruthy());
    expect(utils.queryByText('Pillar *')).toBeNull();

    fillBasics(utils);
    fireEvent.press(utils.getByLabelText('Subject Math'));
    fireEvent.press(utils.getByLabelText('Add Task'));

    await waitFor(() => expect(utils.props.onAddManualTask).toHaveBeenCalledTimes(1));
    const sent = (utils.props.onAddManualTask as jest.Mock).mock.calls[0][0];
    expect(sent.diploma_subjects).toEqual({ Math: 100 });
    expect(sent).not.toHaveProperty('pillar');
  });

  it('refuses to add until a subject is chosen', async () => {
    rulesAre({ hide_pillars: true });
    const utils = renderWizard();
    await waitFor(() => expect(utils.getByText('Diploma subject *')).toBeTruthy());
    fillBasics(utils);
    fireEvent.press(utils.getByLabelText('Add Task'));
    await waitFor(() => expect(utils.getByText('Choose the diploma subject this task counts toward')).toBeTruthy());
    expect(utils.props.onAddManualTask).not.toHaveBeenCalled();
  });

  it('keeps the pillar picker for younger learners', async () => {
    rulesAre({ hide_pillars: false });
    const utils = renderWizard();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(utils.getByText('Pillar *')).toBeTruthy();
    expect(utils.queryByText('Diploma subject *')).toBeNull();
  });
});
