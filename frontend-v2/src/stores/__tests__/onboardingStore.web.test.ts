/**
 * @jest-environment jsdom
 *
 * onboardingStore web tests — uses localStorage under the hood on web.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import { hasSeenOnboarding, markOnboardingSeen } from '../onboardingStore';

beforeEach(() => {
  localStorage.clear();
});

describe('onboardingStore (web)', () => {
  it('returns false for a user who has not seen onboarding', async () => {
    expect(await hasSeenOnboarding('user-1')).toBe(false);
  });

  it('marks onboarding as seen and reads it back', async () => {
    await markOnboardingSeen('user-1');
    expect(await hasSeenOnboarding('user-1')).toBe(true);
  });

  it('keys per-user so two accounts on one device are independent', async () => {
    await markOnboardingSeen('user-1');
    expect(await hasSeenOnboarding('user-2')).toBe(false);
  });

  it('handles storage failure gracefully', async () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(await hasSeenOnboarding('user-1')).toBe(false);
    spy.mockRestore();
  });
});
