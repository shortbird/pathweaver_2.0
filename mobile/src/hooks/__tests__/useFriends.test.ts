/**
 * Friends, the student's side: the reads carry student scope when a parent
 * works a child's friends, the writes go to the routes the server owns, and
 * the code helpers keep the code where the server put it.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import {
  useFriends, useFriendSuggestions, issueCode, requestFriend, inviteLinkFor,
  setReaction, clearReaction, getPeerComments, postPeerComment, REACTIONS,
} from '../useFriends';
import { setAuthAsStudent, setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const ELIGIBLE = { state: 'eligible', reason: null, who_can_enable: null, policy: { enabled: true } };
const LIST = {
  active: [{ id: 'c-1', status: 'active', peer: { id: 'p-1', display_name: 'Ada', avatar_url: null }, created_at: '' }],
  incoming: [{ id: 'c-2', status: 'pending_addressee', peer: { id: 'p-2', display_name: 'Linus', avatar_url: null }, created_at: '' }],
  outgoing: [], awaiting_approval: [],
};

function answer(url: string) {
  if (url.endsWith('/eligibility')) return { data: { success: true, data: ELIGIBLE } };
  if (url.endsWith('/suggestions')) return { data: { success: true, data: { classmates: [{ peer: { id: 'p-3', display_name: 'Grace', avatar_url: null }, class_names: ['Robotics'], state: 'none', connection_id: null }], school: [], school_pool: false } } };
  if (url.endsWith('/comments')) return { data: { success: true, data: { comments: [{ id: 'k1', comment_text: 'nice', created_at: '', author: { id: 'p-1', display_name: 'Ada', avatar_url: null }, author_id: 'p-1' }] } } };
  return { data: { success: true, data: LIST } };
}

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) => Promise.resolve(answer(url)));
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { id: 'c-9', status: 'pending_addressee' } } });
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
});
afterEach(() => clearAuthState());

describe('useFriends', () => {
  it('reads eligibility and the list together, for the caller', async () => {
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith('/api/connections/eligibility', { params: {} });
    expect(api.get).toHaveBeenCalledWith('/api/connections', { params: {} });
    expect(result.current.eligibility?.state).toBe('eligible');
    expect(result.current.connections.active[0].peer.display_name).toBe('Ada');
    expect(result.current.connections.incoming).toHaveLength(1);
  });

  it('carries student scope on every read and write when a parent works a child', async () => {
    setAuthAsParent();
    const { result } = renderHook(() => useFriends('kid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith('/api/connections/eligibility', { params: { student_id: 'kid-1' } });
    expect(api.get).toHaveBeenCalledWith('/api/connections', { params: { student_id: 'kid-1' } });

    await act(async () => { await result.current.respond('c-2', true); });
    expect(api.post).toHaveBeenCalledWith('/api/connections/c-2/respond', { accept: true, student_id: 'kid-1' });
    await act(async () => { await result.current.revoke('c-1'); });
    expect(api.post).toHaveBeenCalledWith('/api/connections/c-1/revoke', { student_id: 'kid-1' });
  });

  it('never delegates the age screen', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true, data: { ...ELIGIBLE, state: 'friends_off' } } });
    const { result } = renderHook(() => useFriends('kid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.submitDob('2012-01-01'); });
    expect(api.post).toHaveBeenCalledWith('/api/connections/age-check', { date_of_birth: '2012-01-01' });
    expect(result.current.eligibility?.state).toBe('friends_off');
  });
});

describe('useFriendSuggestions', () => {
  it('reads the vetted pools and nothing else', async () => {
    const { result } = renderHook(() => useFriendSuggestions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).toHaveBeenCalledWith('/api/connections/suggestions', { params: {} });
    expect(result.current.data.classmates[0].class_names).toEqual(['Robotics']);
    expect(result.current.data.school_pool).toBe(false);
  });

  it('does not read when disabled', async () => {
    const { result } = renderHook(() => useFriendSuggestions(null, false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.get).not.toHaveBeenCalledWith('/api/connections/suggestions', expect.anything());
  });
});

describe('the writes', () => {
  it('uppercases and trims a typed code', async () => {
    await requestFriend({ code: ' abcd2345 ' });
    expect(api.post).toHaveBeenCalledWith('/api/connections/request', { code: 'ABCD2345' });
  });

  it('names a classmate by peer_id with its pool', async () => {
    await requestFriend({ peerId: 'p-3', source: 'classmates', studentId: 'kid-1' });
    expect(api.post).toHaveBeenCalledWith('/api/connections/request', { peer_id: 'p-3', source: 'classmates', student_id: 'kid-1' });
  });

  it('mints a code for the caller or for a child', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { code: 'ABCD2345', expires_at: 'x' } } });
    expect((await issueCode()).code).toBe('ABCD2345');
    expect(api.post).toHaveBeenCalledWith('/api/connections/code', {});
    await issueCode('kid-1');
    expect(api.post).toHaveBeenCalledWith('/api/connections/code', { student_id: 'kid-1' });
  });

  it('builds the invite link on the app host', () => {
    expect(inviteLinkFor('ABCD2345')).toBe('https://app.optioeducation.com/f/ABCD2345');
  });

  it('sets and clears a reaction on exactly one target', async () => {
    await setReaction({ studentId: 'p-1', completionId: 'tc-1' }, 'keep_going');
    expect(api.post).toHaveBeenCalledWith('/api/connections/reactions', {
      student_id: 'p-1', reaction: 'keep_going', task_completion_id: 'tc-1', learning_event_id: null,
    });
    await clearReaction({ studentId: 'p-1', learningEventId: 'le-1' });
    expect(api.delete).toHaveBeenCalledWith('/api/connections/reactions', { params: { learning_event_id: 'le-1' } });
  });

  it('reads and writes peer comments through the peer endpoint', async () => {
    const rows = await getPeerComments({ studentId: 'p-1', learningEventId: 'le-1' });
    expect(api.get).toHaveBeenCalledWith('/api/connections/comments', { params: { student_id: 'p-1', learning_event_id: 'le-1' } });
    expect(rows[0].author.display_name).toBe('Ada');
    await postPeerComment({ studentId: 'p-1', completionId: 'tc-1' }, 'great');
    expect(api.post).toHaveBeenCalledWith('/api/connections/comments', {
      student_id: 'p-1', text: 'great', task_completion_id: 'tc-1', learning_event_id: null,
    });
  });

  it('the palette is encouragement only', () => {
    expect(REACTIONS.map((r) => r.key)).toEqual(['proud', 'inspired', 'curious', 'keep_going', 'thanks']);
  });
});
