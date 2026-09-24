/**
 * The To do tab (2026-09-23): a family's or a student's school tasks.
 *
 * Covered: a task opens to its steps; ticking a plain step PATCHes
 * {status:'complete'}; a signature step has no checkbox and signs with a name
 * and the agreement; a signature step whose document is missing offers no
 * sign box; an approved step is locked; an expired task has no controls; the
 * empty state; a notification's task opens expanded; the audience and org
 * reach the request.
 */

import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { TodoTab, dueLine } from '../TodoTab';

jest.mock('@/src/services/api', () => ({
  ...require('@/src/__tests__/utils/mockApi').mockApiModule(),
  uploadTaskDocument: jest.fn().mockResolvedValue({ path: 'org/t/file.jpg' }),
}));

const mockGet = api.get as jest.Mock;
const mockPatch = api.patch as jest.Mock;

const step = (over: Record<string, unknown> = {}) => ({
  key: 's1', title: 'Read the handbook', description: null, required: true,
  needs_document: false, needs_signature: false, needs_approval: false,
  link: null, due_date: null, status: 'pending', documents: [], signature: null,
  admin_notes: null, ...over,
});

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1', type: 'task', title: 'Start of year paperwork', description: 'Before the first day.',
  audience: 'family', status: 'todo', due_date: '2026-09-30', overdue: false, priority: null,
  action: 'do', thread_link: null, occurrence_date: null, assigned_by_name: 'Marika',
  created_at: '2026-09-20T00:00:00Z', done_count: 0, total_count: 1, comment_count: 0,
  items: [step()], ...over,
});

let mockTasks: any[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockTasks = [task()];
  mockGet.mockImplementation((url: string) => {
    if (url === '/api/sis/tasks/mine') {
      return Promise.resolve({ data: {
        success: true, tasks: mockTasks, counts: { open: mockTasks.length },
        signature_statement: 'I agree this is my legal signature.',
      } });
    }
    if (url.endsWith('/comments')) return Promise.resolve({ data: { success: true, comments: [] } });
    return Promise.resolve({ data: {} });
  });
  mockPatch.mockResolvedValue({ data: { success: true } });
});

// Opening a task loads its comments; waiting for them keeps that fetch
// inside the test instead of landing after it.
const openTask = async (id = 't1') => {
  fireEvent.press(await screen.findByTestId(`todo-task-toggle-${id}`));
  await screen.findByText('No comments yet.');
};

it('asks for the family list of the school on screen', async () => {
  render(<TodoTab organizationId="org-1" audience="family" />);
  await screen.findByText('Start of year paperwork');
  expect(mockGet).toHaveBeenCalledWith('/api/sis/tasks/mine', {
    params: { audience: 'family', organization_id: 'org-1' },
  });
});

it('asks for a student\'s own list without naming an org', async () => {
  render(<TodoTab organizationId="org-1" audience="student" />);
  await screen.findByText('Start of year paperwork');
  expect(mockGet).toHaveBeenCalledWith('/api/sis/tasks/mine', { params: { audience: 'student' } });
});

it('shows the card summary and opens to the task\'s steps', async () => {
  mockTasks = [task({
    priority: 'urgent', overdue: true,
    items: [step(), step({ key: 's2', title: 'Pack a lunch' })], total_count: 2, done_count: 0,
  })];
  render(<TodoTab organizationId="org-1" audience="family" />);
  expect(await screen.findByText('To do')).toBeTruthy();
  expect(screen.getByText('Urgent')).toBeTruthy();
  expect(screen.getByText(/^Overdue, due /)).toBeTruthy();
  expect(screen.getByText(/From Marika/)).toBeTruthy();
  expect(screen.getByText(/0 of 2 done/)).toBeTruthy();
  expect(screen.queryByText('Read the handbook')).toBeNull();

  await openTask();
  expect(screen.getByText('Before the first day.')).toBeTruthy();
  expect(screen.getByText('Read the handbook')).toBeTruthy();
  expect(screen.getByText('Pack a lunch')).toBeTruthy();
});

it('shows no priority badge for a normal task', async () => {
  mockTasks = [task({ priority: 'normal' })];
  render(<TodoTab organizationId="org-1" audience="family" />);
  await screen.findByText('Start of year paperwork');
  expect(screen.queryByTestId('todo-task-priority-t1')).toBeNull();
});

it('ticks a plain step with {status: complete}, and refetches', async () => {
  render(<TodoTab organizationId="org-1" audience="family" />);
  await openTask();
  const listCalls = () => mockGet.mock.calls.filter((c) => c[0] === '/api/sis/tasks/mine').length;
  const before = listCalls();
  fireEvent.press(screen.getByTestId('todo-step-check-t1-s1'));
  await waitFor(() => expect(mockPatch).toHaveBeenCalledWith(
    '/api/sis/tasks/t1/items/s1', { status: 'complete' },
  ));
  await waitFor(() => expect(listCalls()).toBe(before + 1));
});

it('unticks a completed step with {status: pending}', async () => {
  mockTasks = [task({ items: [step({ status: 'complete' })] })];
  render(<TodoTab organizationId="org-1" audience="family" />);
  await openTask();
  fireEvent.press(screen.getByTestId('todo-step-check-t1-s1'));
  await waitFor(() => expect(mockPatch).toHaveBeenCalledWith(
    '/api/sis/tasks/t1/items/s1', { status: 'pending' },
  ));
});

it('locks an approved step', async () => {
  mockTasks = [task({ items: [step({ status: 'approved' })] })];
  render(<TodoTab organizationId="org-1" audience="family" />);
  await openTask();
  expect(screen.queryByTestId('todo-step-check-t1-s1')).toBeNull();
  expect(screen.getByText('Approved by the office')).toBeTruthy();
});

it('shows the server\'s error when a write is refused', async () => {
  const { toast } = require('@/src/components/ui');
  const spy = jest.spyOn(toast, 'error').mockImplementation(() => {});
  mockPatch.mockRejectedValueOnce({ response: { status: 400, data: { success: false, error: 'This task is closed' } } });
  render(<TodoTab organizationId="org-1" audience="family" />);
  await openTask();
  fireEvent.press(screen.getByTestId('todo-step-check-t1-s1'));
  await waitFor(() => expect(spy).toHaveBeenCalledWith('This task is closed'));
  spy.mockRestore();
});

describe('a signature step', () => {
  beforeEach(() => {
    mockTasks = [task({ type: 'signature', items: [step({ key: 'sig', title: 'Sign the waiver', needs_signature: true })] })];
  });

  it('has no checkbox, and signs with the name and the agreement', async () => {
    render(<TodoTab organizationId="org-1" audience="family" />);
    await openTask();
    expect(screen.queryByTestId('todo-step-check-t1-sig')).toBeNull();
    expect(screen.getByText('I agree this is my legal signature.')).toBeTruthy();

    // Nothing to send until both the name and the agreement are there.
    fireEvent.changeText(screen.getByTestId('todo-step-sign-name-t1-sig'), 'Kayla Rose');
    fireEvent.press(screen.getByTestId('todo-step-sign-submit-t1-sig'));
    expect(mockPatch).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('todo-step-sign-agree-t1-sig'));
    fireEvent.press(screen.getByTestId('todo-step-sign-submit-t1-sig'));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith(
      '/api/sis/tasks/t1/items/sig', { signature_name: 'Kayla Rose', signature_agreed: true },
    ));
  });

  it('says the document is not here yet, and offers no sign box, when it is missing', async () => {
    mockTasks = [task({ items: [step({ key: 'sig', needs_signature: true, sign_docs: [] })] })];
    render(<TodoTab organizationId="org-1" audience="family" />);
    await openTask();
    expect(screen.getByText('Your document is not here yet')).toBeTruthy();
    expect(screen.queryByTestId('todo-step-sign-t1-sig')).toBeNull();
  });

  it('shows who signed once it is signed', async () => {
    mockTasks = [task({ items: [step({
      key: 'sig', needs_signature: true, status: 'complete',
      signature: { name: 'Kayla Rose', signed_at: '2026-09-21T10:00:00Z' },
    })] })];
    render(<TodoTab organizationId="org-1" audience="family" />);
    await openTask();
    expect(screen.getByText(/Signed by Kayla Rose/)).toBeTruthy();
    expect(screen.queryByTestId('todo-step-sign-t1-sig')).toBeNull();
  });
});

it('completes a file step only by uploading: no checkbox', async () => {
  mockTasks = [task({ items: [step({ key: 'doc', title: 'Birth certificate', needs_document: true })] })];
  render(<TodoTab organizationId="org-1" audience="family" />);
  await openTask();
  expect(screen.queryByTestId('todo-step-check-t1-doc')).toBeNull();
  expect(screen.getByTestId('todo-step-upload-t1-doc')).toBeTruthy();
});

it('gives an expired task no controls at all', async () => {
  mockTasks = [task({
    status: 'expired',
    items: [
      step(),
      step({ key: 'sig', needs_signature: true }),
      step({ key: 'doc', needs_document: true }),
    ],
  })];
  render(<TodoTab organizationId="org-1" audience="family" />);
  await openTask();
  expect(screen.getByText('Expired')).toBeTruthy();
  expect(screen.getByTestId('todo-task-expired-t1')).toBeTruthy();
  expect(screen.queryByTestId('todo-step-check-t1-s1')).toBeNull();
  expect(screen.queryByTestId('todo-step-sign-t1-sig')).toBeNull();
  expect(screen.queryByTestId('todo-step-upload-t1-doc')).toBeNull();
  await waitFor(() => expect(screen.getByTestId('todo-comments-t1')).toBeTruthy());
  expect(screen.queryByTestId('todo-comment-input-t1')).toBeNull();
});

it('points a reply task at Messages', async () => {
  mockTasks = [task({ action: 'reply', thread_link: '/inbox?tab=school&group=g-7' })];
  const { router } = require('expo-router');
  render(<TodoTab organizationId="org-1" audience="family" />);
  await openTask();
  expect(screen.getByText('The school asked you to reply')).toBeTruthy();
  fireEvent.press(screen.getByTestId('todo-task-open-messages-t1'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/(app)/(tabs)/messages', params: { group: 'g-7' } });
});

it('posts a comment', async () => {
  (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true, comment: {
    id: 'c1', author_id: 'u1', author_name: 'Kayla Rose', body: 'Is a photo fine?', created_at: '2026-09-22T00:00:00Z',
  } } });
  render(<TodoTab organizationId="org-1" audience="family" />);
  await openTask();
  fireEvent.changeText(screen.getByTestId('todo-comment-input-t1'), 'Is a photo fine?');
  fireEvent.press(screen.getByTestId('todo-comment-send-t1'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    '/api/sis/tasks/t1/comments', { body: 'Is a photo fine?' },
  ));
  expect(await screen.findByText('Is a photo fine?')).toBeTruthy();
});

it('says there is nothing to do when the list is empty', async () => {
  mockTasks = [];
  render(<TodoTab organizationId="org-1" audience="family" />);
  expect(await screen.findByText('Nothing to do right now.')).toBeTruthy();
});

it('asks for finished tasks when Show finished is on', async () => {
  render(<TodoTab organizationId="org-1" audience="family" />);
  await screen.findByText('Start of year paperwork');
  fireEvent.press(screen.getByTestId('todo-show-finished'));
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/sis/tasks/mine', {
    params: { audience: 'family', organization_id: 'org-1', include_done: '1' },
  }));
});

it('opens the task a notification names', async () => {
  render(<TodoTab organizationId="org-1" audience="family" initialTaskId="t1" />);
  expect(await screen.findByText('Read the handbook')).toBeTruthy();
  await screen.findByText('No comments yet.');
});

it('writes the due line both ways', () => {
  expect(dueLine({ due_date: '2026-09-30', overdue: false })).toMatch(/^Due Sep 30/);
  expect(dueLine({ due_date: '2026-09-30', overdue: true })).toMatch(/^Overdue, due Sep 30/);
  expect(dueLine({ due_date: null, overdue: false })).toBe('');
});
