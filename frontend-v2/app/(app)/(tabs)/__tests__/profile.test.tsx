/**
 * Profile screen tests - renders user info, XP breakdown, sign out.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../profile';
import { useProfile } from '@/src/hooks/useProfile';
import { useGlobalEngagement, useDashboard } from '@/src/hooks/useDashboard';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import api from '@/src/services/api';

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
  useDashboard: jest.fn(),
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

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useGlobalEngagement as jest.Mock).mockReturnValue({ data: null, loading: false });
  (useDashboard as jest.Mock).mockReturnValue({ data: null, loading: false });
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
  it('renders user name, total XP, and pillar breakdown', () => {
    (useProfile as jest.Mock).mockReturnValue(baseProfileMock);

    const { getByText } = render(<ProfileScreen />);

    expect(getByText('Test Student')).toBeTruthy();
    expect(getByText('1,250')).toBeTruthy();
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

  // ── Date of birth ──
  //
  // The backend gates date_of_birth (COPPA + a one-time age-gate lock), so the
  // editor has to decide whether to offer the field at all rather than let a
  // locked account discover the rule as a validation error.

  describe('date of birth', () => {
    const openEditSheet = () => {
      (useProfile as jest.Mock).mockReturnValue(baseProfileMock);
      const utils = render(<ProfileScreen />);
      fireEvent.press(utils.getByText('Edit Profile'));
      return utils;
    };

    it('offers a date picker seeded with the saved date', () => {
      setAuthAsStudent({ date_of_birth: '2005-06-15' });
      const { getByTestId, getByText } = openEditSheet();

      expect(getByTestId('profile-dob-trigger')).toBeTruthy();
      expect(getByText('June 15, 2005')).toBeTruthy();
    });

    it('leaves an unchanged date of birth out of the save payload', async () => {
      setAuthAsStudent({ date_of_birth: '2005-06-15' });
      const { getByText } = openEditSheet();

      fireEvent.press(getByText('Save Changes'));

      await waitFor(() => expect(api.put).toHaveBeenCalled());
      expect(api.put).toHaveBeenCalledWith(
        '/api/users/profile',
        expect.not.objectContaining({ date_of_birth: expect.anything() })
      );
    });

    it('sends a newly picked date of birth', async () => {
      setAuthAsStudent({ date_of_birth: '2005-06-15' });
      const { getByText, getByTestId } = openEditSheet();

      fireEvent.press(getByTestId('profile-dob-trigger'));
      fireEvent(getByTestId('profile-dob-picker'), 'change', { type: 'set' }, new Date(2004, 2, 2, 12));
      fireEvent.press(getByText('Save Changes'));

      await waitFor(() => expect(api.put).toHaveBeenCalled());
      expect(api.put).toHaveBeenCalledWith(
        '/api/users/profile',
        expect.objectContaining({ date_of_birth: '2004-03-02' })
      );
    });

    it('refuses to save a date that makes the account under 13', async () => {
      const tooYoung = new Date();
      tooYoung.setFullYear(tooYoung.getFullYear() - 8);
      setAuthAsStudent({ date_of_birth: '2005-06-15' });
      const { getByText, getByTestId } = openEditSheet();

      fireEvent.press(getByTestId('profile-dob-trigger'));
      fireEvent(getByTestId('profile-dob-picker'), 'change', { type: 'set' }, tooYoung);
      fireEvent.press(getByText('Save Changes'));

      expect(getByText(/must be managed by a parent or guardian/)).toBeTruthy();
      expect(api.put).not.toHaveBeenCalled();
    });

    it('shows a read-only date with an explanation once it is locked', () => {
      setAuthAsStudent({
        date_of_birth: '2005-06-15',
        date_of_birth_locked_at: '2026-08-01T00:00:00Z',
      });
      const { queryByTestId, getByText } = openEditSheet();

      expect(queryByTestId('profile-dob-trigger')).toBeNull();
      expect(getByText('June 15, 2005')).toBeTruthy();
      expect(getByText(/Ask a parent, guardian, or your school/)).toBeTruthy();
    });

    it('points a parent-managed student at their parent instead', () => {
      setAuthAsStudent({ date_of_birth: '2015-06-15', is_dependent: true });
      const { queryByTestId, getByText } = openEditSheet();

      expect(queryByTestId('profile-dob-trigger')).toBeNull();
      expect(getByText(/Your parent or guardian manages your date of birth/)).toBeTruthy();
    });
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
