/**
 * NotificationPreferences tests — loads prefs, toggles them, persists.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { NotificationPreferences } from '../NotificationPreferences';
import api from '@/src/services/api';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NotificationPreferences', () => {
  it('fetches preferences on mount', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { preferences: {} } });
    render(<NotificationPreferences />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/notifications/preferences');
    });
  });

  it('renders a row for each notification type', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { preferences: {} } });
    const { findByText } = render(<NotificationPreferences />);
    expect(await findByText('Messages')).toBeTruthy();
    expect(await findByText('Comments')).toBeTruthy();
    expect(await findByText('New bounties')).toBeTruthy();
    expect(await findByText('Announcements')).toBeTruthy();
  });

  it('treats missing preferences as enabled by default', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { preferences: {} } });
    const { findAllByRole } = render(<NotificationPreferences />);
    const switches = await findAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
    switches.forEach((sw) => expect(sw.props.value).toBe(true));
  });

  it('reflects explicit {enabled: false} as off', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { preferences: { message_received: false } },
    });
    const { findAllByRole } = render(<NotificationPreferences />);
    const switches = await findAllByRole('switch');
    // Messages is the first row
    expect(switches[0].props.value).toBe(false);
  });

  it('toggling a switch persists via PUT with the right payload', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { preferences: {} } });
    (api.put as jest.Mock).mockResolvedValueOnce({ data: { updated: 1 } });
    const { findAllByRole } = render(<NotificationPreferences />);
    const switches = await findAllByRole('switch');
    await act(async () => {
      fireEvent(switches[0], 'valueChange', false);
    });
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/notifications/preferences', {
        preferences: { message_received: false },
      });
    });
  });

  it('reverts the toggle state if the PUT fails', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { preferences: {} } });
    (api.put as jest.Mock).mockRejectedValueOnce(new Error('network'));
    const { findAllByRole } = render(<NotificationPreferences />);
    const switches = await findAllByRole('switch');
    await act(async () => {
      fireEvent(switches[0], 'valueChange', false);
    });
    await waitFor(() => {
      // After failure, first switch flips back to true
      expect(switches[0].props.value).toBe(true);
    });
  });
});
