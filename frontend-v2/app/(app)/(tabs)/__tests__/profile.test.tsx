/**
 * Profile screen tests - renders user info, XP breakdown, sign out.
 */

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

jest.mock('@/src/hooks/useProfile', () => ({
  useProfile: jest.fn(),
}));
jest.mock('@/src/hooks/useDashboard', () => ({
  useGlobalEngagement: jest.fn(),
}));
jest.mock('@/src/components/engagement/EngagementCalendar', () => ({
  EngagementCalendar: () => null,
}));
jest.mock('@/src/components/engagement/RhythmBadge', () => ({
  RhythmBadge: () => null,
}));
jest.mock('@/src/components/engagement/PillarRadar', () => ({
  PillarRadar: () => null,
}));
jest.mock('@/src/components/layouts/MobileHeader', () => ({
  PageHeader: () => null,
}));

import React from 'react';
import { render } from '@testing-library/react-native';
import ProfileScreen from '../profile';
import { useProfile } from '@/src/hooks/useProfile';
import { useGlobalEngagement } from '@/src/hooks/useDashboard';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useGlobalEngagement as jest.Mock).mockReturnValue({ data: null, loading: false });
});

afterEach(() => {
  clearAuthState();
});

describe('ProfileScreen', () => {
  it('renders user name, total XP, pillar breakdown, and sign out button', () => {
    (useProfile as jest.Mock).mockReturnValue({
      user: { id: 'user-1', display_name: 'Test Student', first_name: 'Test', last_name: 'Student', total_xp: 1250, avatar_url: null },
      pillarXP: [
        { pillar: 'stem', xp: 500 },
        { pillar: 'art', xp: 200 },
      ],
      achievements: [],
      subjectXP: [],
      loading: false,
      refetch: jest.fn(),
    });

    const { getByText } = render(<ProfileScreen />);

    expect(getByText('Test Student')).toBeTruthy();
    expect(getByText('1,250')).toBeTruthy();
    expect(getByText('Sign Out')).toBeTruthy();
    expect(getByText('Pillar Breakdown')).toBeTruthy();
  });
});
