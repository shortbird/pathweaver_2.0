/**
 * A cold-start notification tap lands here, because the launch URL a push
 * carries ("optio:///") is not a route expo-router can match. What matters is
 * that the params survive the hop: they used to be dropped, so a DM push that
 * cold-started the app opened the conversation LIST instead of the
 * conversation, and a staff handoff lost the page it was meant to offer.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const redirected: any[] = [];

jest.mock('expo-router', () => ({
  Redirect: (props: any) => {
    redirected.push(props.href);
    return null;
  },
}));

const mockGetInitialNotificationLink = jest.fn();
jest.mock('@/src/services/pushNotifications', () => ({
  getInitialNotificationLink: () => mockGetInitialNotificationLink(),
}));

jest.mock('@/src/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ brand: '#6d469b' }),
}));

import NotFound from '../+not-found';

async function renderWithLink(link: string | null) {
  redirected.length = 0;
  mockGetInitialNotificationLink.mockResolvedValue(link);
  render(<NotFound />);
  await waitFor(() => expect(redirected.length).toBeGreaterThan(0));
  return redirected[redirected.length - 1];
}

describe('+not-found cold-start recovery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('carries a DM notification through to the conversation, not the list', async () => {
    const href = await renderWithLink('/communication?user=abc-123');
    expect(href).toEqual({
      pathname: '/(app)/(tabs)/messages',
      params: { user: 'abc-123' },
    });
  });

  it('keeps the path and host on a staff view-on-web handoff', async () => {
    const href = await renderWithLink('/inbox');
    expect(href).toEqual({
      pathname: '/(app)/view-on-web',
      params: { path: '/inbox', label: 'The school inbox', surface: 'sis' },
    });
  });

  it('still redirects with a bare string when there are no params', async () => {
    expect(await renderWithLink('/feed')).toBe('/(app)/(tabs)/feed');
  });

  it('falls back to the index when there is no link to recover', async () => {
    expect(await renderWithLink(null)).toBe('/');
  });
});
