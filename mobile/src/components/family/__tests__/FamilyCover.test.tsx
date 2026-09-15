/**
 * The family photo across the top of the Family tab: a placeholder that
 * picks and uploads; with a photo, a tap offers Change and Remove.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { FamilyCover } from '../FamilyCover';
import { useFamilyCover } from '@/src/hooks/useFamilyCover';
import { confirmAlert } from '@/src/utils/alerts';

jest.mock('@/src/hooks/useFamilyCover', () => ({ useFamilyCover: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/src/utils/alerts', () => ({
  showAlert: jest.fn(),
  confirmAlert: jest.fn().mockResolvedValue(true),
}));

let hook: any;

beforeEach(() => {
  jest.clearAllMocks();
  hook = { url: null, loading: false, busy: false, upload: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
  (useFamilyCover as jest.Mock).mockImplementation(() => hook);
});

describe('FamilyCover', () => {
  it('with no photo, invites one and uploads the pick', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://us.jpg', fileName: 'us.jpg', mimeType: 'image/jpeg' }],
    });
    const { getByText, getByLabelText } = render(<FamilyCover />);
    expect(getByText('Add a family photo')).toBeTruthy();
    fireEvent.press(getByLabelText('Add a family photo'));
    await waitFor(() => expect(hook.upload).toHaveBeenCalledWith({ uri: 'file://us.jpg', name: 'us.jpg', type: 'image/jpeg' }));
    // Landscape: the picker crops wide.
    expect((ImagePicker.launchImageLibraryAsync as jest.Mock).mock.calls[0][0].aspect).toEqual([16, 9]);
  });

  it('uploads nothing when the parent backs out of the picker', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true });
    const { getByLabelText } = render(<FamilyCover />);
    fireEvent.press(getByLabelText('Add a family photo'));
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    expect(hook.upload).not.toHaveBeenCalled();
  });

  it('with a photo, a tap offers Change and Remove; Remove asks first', async () => {
    hook.url = 'https://x/family.jpg';
    const { getByLabelText, queryByText } = render(<FamilyCover />);
    expect(queryByText('Add a family photo')).toBeNull();
    fireEvent.press(getByLabelText('Family photo. Change or remove it'));
    fireEvent.press(getByLabelText('Remove photo'));
    await waitFor(() => expect(confirmAlert).toHaveBeenCalled());
    await waitFor(() => expect(hook.remove).toHaveBeenCalled());
  });
});
