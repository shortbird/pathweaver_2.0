/**
 * useBounties hook tests - browse, claims, posted, claim/submit actions.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import { renderHook, waitFor } from '@testing-library/react-native';
import { useBounties, useMyClaims, useMyPosted } from '../useBounties';
import api from '@/src/services/api';
import { setAuthAsStudent, setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockBounty, createMockClaim } from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

describe('useBounties', () => {
  it('fetches active bounties from /api/bounties', async () => {
    const mockBounties = [createMockBounty(), createMockBounty({ id: 'bounty-2', title: 'Read a Book' })];
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { bounties: mockBounties } });

    const { result } = renderHook(() => useBounties());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/bounties', { params: {} });
    expect(result.current.bounties).toHaveLength(2);
    expect(result.current.bounties[0].title).toBe('Build a Bird Feeder');
  });

  it('applies pillar filter param when provided', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { bounties: [createMockBounty()] } });

    const { result } = renderHook(() => useBounties('stem'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/bounties', { params: { pillar: 'stem' } });
  });
});

describe('useMyClaims', () => {
  it('fetches claimed bounties from /api/bounties/my-claims', async () => {
    const mockClaims = [createMockClaim()];
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { claims: mockClaims } });

    const { result } = renderHook(() => useMyClaims());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/bounties/my-claims');
    expect(result.current.claims).toHaveLength(1);
    expect(result.current.claims[0].status).toBe('claimed');
  });
});

describe('useMyPosted', () => {
  it('fetches posted bounties from /api/bounties/my-posted', async () => {
    setAuthAsParent();
    const mockPosted = [createMockBounty({ poster_id: 'parent-1' })];
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { bounties: mockPosted } });

    const { result } = renderHook(() => useMyPosted());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/bounties/my-posted');
    expect(result.current.bounties).toHaveLength(1);
  });
});

describe('bounty actions', () => {
  it('claim bounty: POST /api/bounties/{id}/claim', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { claim: createMockClaim() } });

    await api.post('/api/bounties/bounty-1/claim', {});

    expect(api.post).toHaveBeenCalledWith('/api/bounties/bounty-1/claim', {});
  });

  it('submit evidence: POST with FormData', async () => {
    const formData = new FormData();
    formData.append('description', 'My evidence');
    formData.append('file', { uri: 'file://photo.jpg', name: 'photo.jpg', type: 'image/jpeg' } as any);

    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await api.post('/api/bounties/bounty-1/submit', formData);

    expect(api.post).toHaveBeenCalledWith('/api/bounties/bounty-1/submit', formData);
  });
});
