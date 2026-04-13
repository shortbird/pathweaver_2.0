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
jest.mock('@/src/components/diploma/DiplomaCreditTracker', () => ({
  DiplomaCreditTracker: () => null,
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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

const baseProfileMock = {
  pillarXP: [
    { pillar: 'stem', xp: 500 },
    { pillar: 'art', xp: 200 },
  ],
  achievements: [],
  subjectXP: [],
  viewers: [],
  deletionStatus: {},
  portfolioPublic: false,
  setPortfolioPublic: jest.fn(),
  portfolioSlug: null,
  loading: false,
  refetch: jest.fn(),
};

describe('ProfileScreen', () => {
  it('renders user name, total XP, pillar breakdown, and sign out button', () => {
    (useProfile as jest.Mock).mockReturnValue(baseProfileMock);

    const { getByText } = render(<ProfileScreen />);

    expect(getByText('Test Student')).toBeTruthy();
    expect(getByText('1,250')).toBeTruthy();
    expect(getByText('Sign Out')).toBeTruthy();
    expect(getByText('Pillar Breakdown')).toBeTruthy();
  });

  it('formats subject credit names from snake_case to Title Case', () => {
    (useProfile as jest.Mock).mockReturnValue({
      ...baseProfileMock,
      subjectXP: [
        { school_subject: 'fine_arts', xp_amount: 300, pending_xp: 0 },
        { school_subject: 'social_studies', xp_amount: 150, pending_xp: 50 },
      ],
    });

    const { getByText } = render(<ProfileScreen />);

    fireEvent.press(getByText('Subject Credits'));

    expect(getByText('Fine Arts')).toBeTruthy();
    expect(getByText('Social Studies')).toBeTruthy();
  });

  it('renders human-readable display names for CTE and PE subjects', () => {
    // ProfileScreen's CREDIT_REQUIREMENTS maps 'cte' → 'Career & Tech' and
    // 'pe' → 'Physical Education'. Earlier tests asserted the raw acronyms,
    // but the component no longer renders them — the displayName lookup
    // always wins before the acronym-capitalization fallback.
    (useProfile as jest.Mock).mockReturnValue({
      ...baseProfileMock,
      subjectXP: [
        { school_subject: 'cte', xp_amount: 200, pending_xp: 0 },
        { school_subject: 'pe', xp_amount: 100, pending_xp: 0 },
      ],
    });

    const { getByText } = render(<ProfileScreen />);

    fireEvent.press(getByText('Subject Credits'));

    expect(getByText('Career & Tech')).toBeTruthy();
    expect(getByText('Physical Education')).toBeTruthy();
  });

  it('renders progress and pending XP badge for subject credits', () => {
    (useProfile as jest.Mock).mockReturnValue({
      ...baseProfileMock,
      subjectXP: [
        { school_subject: 'math', xp_amount: 400, pending_xp: 75 },
      ],
    });

    const { getByText } = render(<ProfileScreen />);

    // Section is collapsed by default -- expand it
    fireEvent.press(getByText('Subject Credits'));

    // Math requires 3 credits × 2000 XP/credit = 6,000 XP.
    // Component formats with toLocaleString() as "400 / 6,000 XP".
    expect(getByText('400 / 6,000 XP')).toBeTruthy();
    expect(getByText('+75 pending')).toBeTruthy();
  });
});
