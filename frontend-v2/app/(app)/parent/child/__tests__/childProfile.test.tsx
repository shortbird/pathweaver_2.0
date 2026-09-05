/**
 * Parent → child profile.
 *
 * The one thing on this read-only screen that is not read-only is the profile
 * picture, and it is here because a parent went looking for it here. She tapped
 * her son's photo, nothing happened, and she reported that she could not change
 * it — the only control was a "Change photo" row behind the ⋮ menu on the
 * Family tab. These tests pin the photo to the tap it looks like it takes, and
 * pin the header to saying whose profile this is.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import ChildProfileScreen from '../[studentId]';
import api, { uploadChildAvatar } from '@/src/services/api';
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
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

const overview = {
  student: {
    id: 'kid-1', first_name: 'Maximus', last_name: 'Meletis',
    avatar_url: null, created_at: '2026-09-03T00:00:00Z', date_of_birth: '2010-05-20',
  },
  dashboard: { total_xp: 0, moments_count: 0, xp_by_pillar: {} },
  engagement: { calendar: [] },
  completed_quests: [],
  subject_xp: {},
  pending_subject_xp: {},
};

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ studentId: 'kid-1' });
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url.startsWith('/api/parent/child-overview/')) return Promise.resolve({ data: overview });
    return Promise.resolve({ data: {} });
  });
});

afterEach(() => clearAuthState());

describe('ChildProfileScreen', () => {
  it('says whose profile this is, so a parent is not left reading it as their own', async () => {
    const result = render(<ChildProfileScreen />);

    // The name renders twice (header + identity card); the subtitle is the
    // part that tells a parent they are not looking at their own profile.
    expect((await waitFor(() => result.getAllByText('Maximus Meletis'))).length).toBeGreaterThan(0);
    expect(result.getByText("Maximus's profile — your parent view")).toBeTruthy();
  });

  it('invites the parent to change the photo', async () => {
    const result = render(<ChildProfileScreen />);

    await waitFor(() => expect(result.getByText('Tap the photo to change it')).toBeTruthy());
  });

  it('uploads the picked image to the child, not the signed-in parent', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://pic.jpg', fileName: 'pic.jpg', mimeType: 'image/jpeg' }],
    });

    const result = render(<ChildProfileScreen />);
    await waitFor(() => expect(result.getByText('Tap the photo to change it')).toBeTruthy());

    fireEvent.press(result.getByLabelText("Change Maximus's profile picture"));

    await waitFor(() => expect(uploadChildAvatar).toHaveBeenCalledWith('kid-1', {
      uri: 'file://pic.jpg', name: 'pic.jpg', type: 'image/jpeg',
    }));
  });

  it('uploads nothing when the parent backs out of the picker', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true });

    const result = render(<ChildProfileScreen />);
    await waitFor(() => expect(result.getByText('Tap the photo to change it')).toBeTruthy());

    fireEvent.press(result.getByLabelText("Change Maximus's profile picture"));

    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    expect(uploadChildAvatar).not.toHaveBeenCalled();
  });
});
