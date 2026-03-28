/**
 * Bounty create/edit screen tests - form rendering, validation, edit mode, pillar selector.
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

describe('CreateBountyPage', () => {
  it('renders title, description, deliverables, and Post Bounty button', () => {
    const { getByText, getByPlaceholderText } = render(<CreateBountyPage />);

    expect(getByText('Post a Bounty')).toBeTruthy();
    expect(getByPlaceholderText("What's the challenge?")).toBeTruthy();
    expect(getByPlaceholderText('Describe the bounty...')).toBeTruthy();
    expect(getByPlaceholderText('Deliverable 1')).toBeTruthy();
    expect(getByText('Post Bounty')).toBeTruthy();
  });

  it('shows validation error when submitting empty form', async () => {
    const { getByText } = render(<CreateBountyPage />);

    fireEvent.press(getByText('Post Bounty'));

    await waitFor(() => {
      expect(getByText('Title is required')).toBeTruthy();
    });
  });

  it('shows validation error for missing description', async () => {
    const { getByText, getByPlaceholderText } = render(<CreateBountyPage />);

    fireEvent.changeText(getByPlaceholderText("What's the challenge?"), 'Test Bounty');
    fireEvent.press(getByText('Post Bounty'));

    await waitFor(() => {
      expect(getByText('Description is required')).toBeTruthy();
    });
  });

  it('shows visibility options', () => {
    const { getByText } = render(<CreateBountyPage />);

    expect(getByText('Everyone')).toBeTruthy();
    expect(getByText('My Students')).toBeTruthy();
  });

  it('renders pillar selector with all pillars', () => {
    const { getByText, getAllByText } = render(<CreateBountyPage />);

    expect(getByText('Pillar')).toBeTruthy();
    // STEM appears in both reward pillar picker and bounty pillar selector
    expect(getAllByText('STEM').length).toBeGreaterThanOrEqual(2);
    expect(getAllByText('Art').length).toBeGreaterThanOrEqual(2);
    expect(getAllByText('Communication').length).toBeGreaterThanOrEqual(2);
    expect(getAllByText('Civics').length).toBeGreaterThanOrEqual(2);
    expect(getAllByText('Wellness').length).toBeGreaterThanOrEqual(2);
  });

  it('loads bounty data and shows Edit title in edit mode', async () => {
    mockSearchParams.edit = 'bounty-edit-1';
    const bounty = createMockBounty({
      id: 'bounty-edit-1',
      title: 'Existing Bounty',
      description: 'Edit me',
      pillar: 'art',
      rewards: [{ type: 'custom', value: '0', text: 'Ice cream' }],
    });
    (bountyAPI.get as jest.Mock).mockResolvedValueOnce({ data: { bounty } });

    const { getByText, getByDisplayValue } = render(<CreateBountyPage />);

    await waitFor(() => {
      expect(getByText('Edit Bounty')).toBeTruthy();
    });
    expect(getByText('Save Changes')).toBeTruthy();
    expect(getByDisplayValue('Existing Bounty')).toBeTruthy();
  });
});
