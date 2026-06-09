/**
 * Bounty create/edit screen tests — 3-step wizard (challenge → reward → who & when),
 * per-step validation, unified pillar, edit mode.
 */

jest.mock('@/src/services/api', () => {
  const base = require('@/src/__tests__/utils/mockApi').mockApiModule();
  base.bountyAPI = {
    get: jest.fn().mockResolvedValue({ data: {} }),
    create: jest.fn().mockResolvedValue({ data: {} }),
    update: jest.fn().mockResolvedValue({ data: {} }),
    list: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    claim: jest.fn().mockResolvedValue({ data: {} }),
    myClaims: jest.fn().mockResolvedValue({ data: { claims: [] } }),
    myPosted: jest.fn().mockResolvedValue({ data: { bounties: [] } }),
    toggleDeliverable: jest.fn().mockResolvedValue({ data: {} }),
    turnIn: jest.fn().mockResolvedValue({ data: {} }),
    uploadEvidence: jest.fn().mockResolvedValue({ data: {} }),
    deleteEvidence: jest.fn().mockResolvedValue({ data: {} }),
    review: jest.fn().mockResolvedValue({ data: {} }),
  };
  return base;
});
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
  },
}));

// Control the edit param via mock
const mockSearchParams = { edit: undefined as string | undefined };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockSearchParams,
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CreateBountyPage from '../create';
import api, { bountyAPI } from '@/src/services/api';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockBounty } from '@/src/__tests__/utils/mockFactories';

const DESC_PLACEHOLDER = 'What should they do, and why is it worth doing?';

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
  mockSearchParams.edit = undefined;
  // Mock dependents fetch (fires on mount)
  (api.get as jest.Mock).mockResolvedValue({ data: { dependents: [] } });
});

afterEach(() => {
  clearAuthState();
});

describe('CreateBountyPage (wizard)', () => {
  it('opens on step 1 with the challenge fields and a Next button', () => {
    const { getByText, getByPlaceholderText } = render(<CreateBountyPage />);

    expect(getByText('Post a bounty')).toBeTruthy();
    expect(getByText('Step 1 of 3 · The challenge')).toBeTruthy();
    expect(getByPlaceholderText("What's the challenge?")).toBeTruthy();
    expect(getByPlaceholderText(DESC_PLACEHOLDER)).toBeTruthy();
    expect(getByPlaceholderText('Deliverable 1')).toBeTruthy();
    expect(getByText('Next')).toBeTruthy();
  });

  it('blocks advancing past step 1 without a title', async () => {
    const { getByText } = render(<CreateBountyPage />);

    fireEvent.press(getByText('Next'));

    await waitFor(() => {
      expect(getByText('Give your bounty a title')).toBeTruthy();
    });
  });

  it('blocks advancing without a description', async () => {
    const { getByText, getByPlaceholderText } = render(<CreateBountyPage />);

    fireEvent.changeText(getByPlaceholderText("What's the challenge?"), 'Test Bounty');
    fireEvent.press(getByText('Next'));

    await waitFor(() => {
      expect(getByText('Add a short description')).toBeTruthy();
    });
  });

  it('advances through the steps to reward then who & when', () => {
    const { getByText, getByPlaceholderText } = render(<CreateBountyPage />);

    // Step 1
    fireEvent.changeText(getByPlaceholderText("What's the challenge?"), 'Test Bounty');
    fireEvent.changeText(getByPlaceholderText(DESC_PLACEHOLDER), 'Do the thing');
    fireEvent.changeText(getByPlaceholderText('Deliverable 1'), 'Step one');
    fireEvent.press(getByText('Next'));

    // Step 2 — reward (single unified pillar + XP)
    expect(getByText('Step 2 of 3 · The reward')).toBeTruthy();
    expect(getByText('XP reward')).toBeTruthy();
    fireEvent.press(getByText('Next')); // default 50 XP is valid

    // Step 3 — who & when
    expect(getByText('Step 3 of 3 · Who & when')).toBeTruthy();
    expect(getByText('Everyone')).toBeTruthy();
    expect(getByText('My kids')).toBeTruthy();
    expect(getByText('Limit how many can take it on')).toBeTruthy();
    expect(getByText('Post bounty')).toBeTruthy();
  });

  it('shows a single unified pillar selector on the reward step', () => {
    const { getByText, getByPlaceholderText } = render(<CreateBountyPage />);

    fireEvent.changeText(getByPlaceholderText("What's the challenge?"), 'Test Bounty');
    fireEvent.changeText(getByPlaceholderText(DESC_PLACEHOLDER), 'Do the thing');
    fireEvent.changeText(getByPlaceholderText('Deliverable 1'), 'Step one');
    fireEvent.press(getByText('Next'));

    // One pillar chip each (no duplicate per-reward picker).
    expect(getByText('STEM')).toBeTruthy();
    expect(getByText('Art')).toBeTruthy();
    expect(getByText('Communication')).toBeTruthy();
    expect(getByText('Civics')).toBeTruthy();
    expect(getByText('Wellness')).toBeTruthy();
  });

  it('loads bounty data and shows the Edit title in edit mode', async () => {
    mockSearchParams.edit = 'bounty-edit-1';
    const bounty = createMockBounty({
      id: 'bounty-edit-1',
      title: 'Existing Bounty',
      description: 'Edit me',
      pillar: 'art',
      rewards: [{ type: 'custom', value: '0', text: 'Ice cream' }],
    } as any);
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });

    const { getByText, getByDisplayValue } = render(<CreateBountyPage />);

    await waitFor(() => {
      expect(getByText('Edit bounty')).toBeTruthy();
    });
    expect(getByDisplayValue('Existing Bounty')).toBeTruthy();
  });
});
